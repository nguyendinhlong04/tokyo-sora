import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm'
import { businessDateOf } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { isUniqueViolation } from '../../common/pg-error'
import { PeriodLockService } from '../../common/period-lock.service'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  dishRecipes,
  dishes,
  ingredients,
  orderLines,
  orders,
  prepRecipeLines,
  recipeVersions,
  staff,
  stockLevels,
  stockMoves,
  ticketItems,
  type RecipeVersionLine,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import {
  dishCost,
  effectiveQtyBase,
  foodCost,
  lineCostVnd,
  movingAverageMilli,
  prepCost,
  stockRatio,
  type DishCostBreakdown,
  type RecipeLineInput,
} from './domain/costing'
import { bumpStock, consumeLots } from './stock-ledger'

export interface IngredientInput {
  id: string
  code: string
  name: string
  groupName: string | null
  baseUnit: string
  purchaseUnit: string
  basePerPurchase: number
  minLevelBase: number
  lotRequired: boolean
  /** Bán thành phẩm (M8): pha ra ở bếp chứ không mua ngoài */
  isSemiFinished: boolean
  active: boolean
  sort: number
}

export interface RecipeLineWrite {
  ingredientId: string
  qtyBase: number
  wasteBp: number
}

const SLUG = /^[a-z0-9][a-z0-9-]*$/

/**
 * Kho & công thức — M7 · M4 · S1 · S2, và móc trừ kho của bếp.
 *
 * BA QUYẾT ĐỊNH NGHIỆP VỤ (§25) nằm ở ba chỗ trong file này:
 *   1. Giá bình quân gia quyền di động → `receive`
 *   2. Trừ kho khi bếp bấm Xong        → `postSaleForTicket`, và lượt trừ đó rút
 *      lô theo FEFO qua `consumeLots` (S9)
 *   3. Bắt buộc lô với hải sản/bò/keg  → cưỡng chế ở `WarehouseService.receiveLot`,
 *      cửa nhập kho đầy đủ của S5. `receive` dưới đây là bản rút gọn còn lại cho
 *      những lượt nhập không qua đơn đặt hàng.
 *
 * Toàn bộ số lượng trong file này là ĐVT CƠ SỞ và là số nguyên. Đơn vị mua chỉ
 * xuất hiện đúng một chỗ — tham số `qtyPurchase` của `receive` — và được quy đổi
 * ngay tại đó.
 */
@Injectable()
export class InventoryService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    private readonly locks: PeriodLockService,
  ) {}

  // ==================================================== M7 · Nguyên liệu

  /**
   * Danh sách nguyên liệu kèm tồn của chi nhánh đang xem.
   *
   * Một truy vấn cho cả M7 lẫn S2: hai màn nhìn cùng một bảng từ hai phía — M7 hỏi
   * "khai đúng chưa", S2 hỏi "còn bao nhiêu" — nên tách thành hai đầu đọc chỉ tạo
   * ra hai chỗ phải giữ đồng bộ.
   */
  async ingredients(branchId: string) {
    await this.requireBranch(branchId)

    const rows = await this.db
      .select({
        ing: ingredients,
        qtyBase: stockLevels.qtyBase,
        usedBy: sql<number>`(select count(*)::int from ${dishRecipes} r where r.ingredient_id = ${ingredients.id})`,
      })
      .from(ingredients)
      .leftJoin(
        stockLevels,
        and(eq(stockLevels.ingredientId, ingredients.id), eq(stockLevels.branchId, branchId)),
      )
      .orderBy(asc(ingredients.groupName), asc(ingredients.sort), asc(ingredients.name))

    return rows.map(({ ing, qtyBase, usedBy }) => {
      const qty = Number(qtyBase ?? 0)
      return {
        ...ing,
        qtyBase: qty,
        /** Tồn quy về đơn vị mua — thủ kho đếm bằng kg và keg, không đếm bằng gam */
        qtyPurchase: qty / ing.basePerPurchase,
        valueVnd: Math.round((qty * ing.costPerBaseMilli) / 1_000),
        /** Giá một đơn vị mua, đồng nguyên — con số người ta đọc trên hoá đơn */
        costPerPurchaseVnd: Math.round((ing.basePerPurchase * ing.costPerBaseMilli) / 1_000),
        belowMin: ing.minLevelBase > 0 && qty < ing.minLevelBase,
        emberRatio: stockRatio(qty, ing.minLevelBase),
        usedByDishes: Number(usedBy),
      }
    })
  }

  async createIngredient(input: IngredientInput, actor: Actor, approval?: ApprovalInput | null) {
    this.assertIngredient(input)

    return this.db.transaction(async (tx) => {
      await this.approvals.authorize(tx, {
        actor,
        action: 'recipe.edit',
        entity: 'ingredient',
        entityId: input.id,
        approval,
      })

      try {
        const [row] = await tx.insert(ingredients).values(this.cleanIngredient(input)).returning()
        await this.audit.write(tx, {
          actor,
          action: 'ingredient.created',
          entity: 'ingredient',
          entityId: input.id,
          payload: { code: input.code, name: input.name },
        })
        return row!
      } catch (err) {
        if (isUniqueViolation(err)) {
          throw new ConflictException(`Đã có nguyên liệu mang mã ${input.code} hoặc ${input.id}`)
        }
        throw err
      }
    })
  }

  async updateIngredient(
    id: string,
    patch: Partial<IngredientInput>,
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    return this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(ingredients).where(eq(ingredients.id, id))
      if (!current) throw new NotFoundException('Không có nguyên liệu này')

      const next = { ...current, ...patch, id }
      this.assertIngredient(next as IngredientInput)

      /**
       * Thôi làm bán thành phẩm thì công thức mẻ phải dọn trước.
       *
       * Không chặn ở đây thì cột `prep_yield_base` vi phạm CHECK của CSDL và người
       * dùng nhận về một chuỗi tên constraint; tệ hơn là công thức mẻ nằm lại
       * trong bảng, vô hình với mọi màn hình, chờ ngày ai đó bật cờ lại.
       */
      if (current.isSemiFinished && next.isSemiFinished === false) {
        const [line] = await tx
          .select({ id: prepRecipeLines.ingredientId })
          .from(prepRecipeLines)
          .where(eq(prepRecipeLines.prepId, id))
          .limit(1)
        if (line) {
          throw new ConflictException(
            `${current.name} còn công thức mẻ ở M8 — xoá hết dòng công thức rồi mới bỏ cờ bán thành phẩm`,
          )
        }
      }

      await this.approvals.authorize(tx, {
        actor,
        action: 'recipe.edit',
        entity: 'ingredient',
        entityId: id,
        approval,
      })

      const [row] = await tx
        .update(ingredients)
        .set({
          ...this.cleanIngredient(next as IngredientInput),
          prepYieldBase: next.isSemiFinished ? current.prepYieldBase : 0,
        })
        .where(eq(ingredients.id, id))
        .returning()

      await this.audit.write(tx, {
        actor,
        action: 'ingredient.updated',
        entity: 'ingredient',
        entityId: id,
        payload: { ...patch },
      })
      return row!
    })
  }

  private cleanIngredient(input: IngredientInput) {
    return {
      id: input.id,
      code: input.code.trim(),
      name: input.name.trim(),
      groupName: input.groupName?.trim() || null,
      baseUnit: input.baseUnit.trim(),
      purchaseUnit: input.purchaseUnit.trim(),
      basePerPurchase: input.basePerPurchase,
      minLevelBase: input.minLevelBase,
      lotRequired: input.lotRequired,
      isSemiFinished: input.isSemiFinished,
      active: input.active,
      sort: input.sort,
    }
  }

  private assertIngredient(input: IngredientInput) {
    if (!SLUG.test(input.id)) {
      throw new BadRequestException('Mã định danh chỉ gồm chữ thường, số và dấu gạch ngang')
    }
    if (!input.name.trim()) throw new BadRequestException('Nguyên liệu phải có tên')
    if (!input.baseUnit.trim() || !input.purchaseUnit.trim()) {
      throw new BadRequestException('Phải khai cả đơn vị cơ sở và đơn vị mua')
    }
    if (!Number.isSafeInteger(input.basePerPurchase) || input.basePerPurchase <= 0) {
      throw new BadRequestException(
        `1 ${input.purchaseUnit} bằng bao nhiêu ${input.baseUnit}? Phải là số nguyên dương`,
      )
    }
    if (!Number.isSafeInteger(input.minLevelBase) || input.minLevelBase < 0) {
      throw new BadRequestException('Định mức tồn tối thiểu phải là số nguyên không âm')
    }
  }

  // ====================================================== M4 · Công thức

  async recipe(dishId: string) {
    const [dish] = await this.db.select().from(dishes).where(eq(dishes.id, dishId))
    if (!dish) throw new NotFoundException('Không có món này')

    const rows = await this.db
      .select({ line: dishRecipes, ing: ingredients })
      .from(dishRecipes)
      .innerJoin(ingredients, eq(ingredients.id, dishRecipes.ingredientId))
      .where(eq(dishRecipes.dishId, dishId))
      .orderBy(asc(dishRecipes.sort), asc(ingredients.name))

    const breakdown = dishCost(rows.map(({ line, ing }) => this.toRecipeInput(line, ing)))
    const byIngredient = new Map(breakdown.lines.map((l) => [l.ingredientId, l]))

    return {
      dish: {
        id: dish.id,
        code: dish.code,
        nameVi: dish.nameVi,
        kind: dish.kind,
        basePrice: dish.basePrice,
      },
      lines: rows.map(({ line, ing }) => ({
        ingredientId: ing.id,
        code: ing.code,
        name: ing.name,
        baseUnit: ing.baseUnit,
        costPerBaseMilli: ing.costPerBaseMilli,
        qtyBase: line.qtyBase,
        wasteBp: line.wasteBp,
        sort: line.sort,
        effectiveQtyBase: byIngredient.get(ing.id)!.effectiveQtyBase,
        costVnd: byIngredient.get(ing.id)!.costVnd,
        share: byIngredient.get(ing.id)!.share,
      })),
      ...foodCost(breakdown.costVnd, dish.basePrice, rows.length > 0),
    }
  }

  /**
   * Thay CẢ CỤM công thức, không sửa từng dòng.
   *
   * Cùng lý do với chặng của set (M11): đổi một nguyên liệu thường kéo theo đổi
   * định lượng của nguyên liệu khác, và một API sửa từng dòng sẽ để công thức nằm
   * ở trạng thái nửa vời giữa hai lần gọi — đúng lúc đó có người bấm Xong thì kho
   * trừ theo công thức dở.
   */
  async setRecipe(
    dishId: string,
    lines: RecipeLineWrite[],
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    const [dish] = await this.db.select().from(dishes).where(eq(dishes.id, dishId))
    if (!dish) throw new NotFoundException('Không có món này')
    if (dish.kind === 'set') {
      throw new BadRequestException(
        'Set không có công thức riêng — giá vốn của set là tổng giá vốn các món thành phần',
      )
    }

    const seen = new Set<string>()
    for (const line of lines) {
      if (seen.has(line.ingredientId)) {
        throw new BadRequestException(`Nguyên liệu ${line.ingredientId} bị khai hai lần`)
      }
      seen.add(line.ingredientId)
      if (!Number.isSafeInteger(line.qtyBase) || line.qtyBase <= 0) {
        throw new BadRequestException('Định lượng phải là số nguyên dương theo đơn vị cơ sở')
      }
      if (!Number.isSafeInteger(line.wasteBp) || line.wasteBp < 0 || line.wasteBp > 10_000) {
        throw new BadRequestException('Hao hụt phải trong khoảng 0–100%')
      }
    }

    if (lines.length > 0) {
      const known = await this.db
        .select({ id: ingredients.id })
        .from(ingredients)
        .where(inArray(ingredients.id, [...seen]))
      const missing = [...seen].filter((id) => !known.some((k) => k.id === id))
      if (missing.length > 0) {
        throw new BadRequestException(`Chưa có nguyên liệu: ${missing.join(', ')}`)
      }
    }

    return this.db.transaction(async (tx) => {
      await this.approvals.authorize(tx, {
        actor,
        action: 'recipe.edit',
        entity: 'dish_recipe',
        entityId: dishId,
        approval,
      })

      const before = await tx
        .select({ line: dishRecipes, ing: ingredients })
        .from(dishRecipes)
        .innerJoin(ingredients, eq(ingredients.id, dishRecipes.ingredientId))
        .where(eq(dishRecipes.dishId, dishId))
      const costBefore = dishCost(before.map(({ line, ing }) => this.toRecipeInput(line, ing))).costVnd

      await tx.delete(dishRecipes).where(eq(dishRecipes.dishId, dishId))
      if (lines.length > 0) {
        await tx.insert(dishRecipes).values(
          lines.map((line, index) => ({
            dishId,
            ingredientId: line.ingredientId,
            qtyBase: line.qtyBase,
            wasteBp: line.wasteBp,
            sort: index,
          })),
        )
      }

      const priced = await tx
        .select({ line: dishRecipes, ing: ingredients })
        .from(dishRecipes)
        .innerJoin(ingredients, eq(ingredients.id, dishRecipes.ingredientId))
        .where(eq(dishRecipes.dishId, dishId))
      const costAfter = dishCost(priced.map(({ line, ing }) => this.toRecipeInput(line, ing))).costVnd

      // M9: chụp lại bản vừa lưu. Nhật ký A7 vẫn ghi song song vì nó trả lời câu
      // hỏi khác — "hôm qua ai đụng vào cái gì" chứ không phải "công thức hồi đó
      // trông thế nào".
      const version = await this.writeVersion(tx, {
        subjectKind: 'dish',
        subjectId: dishId,
        rows: priced,
        yieldBase: null,
        costVnd: costAfter,
        actor,
      })

      await this.audit.write(tx, {
        actor,
        action: 'recipe.updated',
        entity: 'dish_recipe',
        entityId: dishId,
        payload: { lines: lines.length, costBefore, costAfter, delta: costAfter - costBefore, version },
      })

      return { dishId, lines: lines.length, costBefore, costAfter, version }
    })
  }

  private toRecipeInput(
    line: { ingredientId: string; qtyBase: number; wasteBp: number },
    ing: { costPerBaseMilli: number },
  ): RecipeLineInput {
    return {
      ingredientId: line.ingredientId,
      qtyBase: line.qtyBase,
      wasteBp: line.wasteBp,
      costPerBaseMilli: ing.costPerBaseMilli,
    }
  }

  /**
   * Giá vốn tiêu chuẩn của MỌI món có công thức — nguồn cho cột giá vốn của M1 và
   * cho trục đóng góp của B3.
   *
   * Tính trong JavaScript bằng đúng hàm miền mà màn M4 dùng, thay vì viết lại công
   * thức làm tròn bằng SQL: hai bản cài đặt của cùng một phép tính sẽ trôi lệch,
   * và lệch ở giá vốn thì không ai nhìn ra cho tới lúc so hai màn.
   */
  async dishCostIndex(): Promise<Map<string, DishCostBreakdown>> {
    const rows = await this.db
      .select({ dishId: dishRecipes.dishId, line: dishRecipes, ing: ingredients })
      .from(dishRecipes)
      .innerJoin(ingredients, eq(ingredients.id, dishRecipes.ingredientId))

    const byDish = new Map<string, RecipeLineInput[]>()
    for (const { dishId, line, ing } of rows) {
      const list = byDish.get(dishId) ?? []
      list.push(this.toRecipeInput(line, ing))
      byDish.set(dishId, list)
    }

    return new Map([...byDish].map(([dishId, lines]) => [dishId, dishCost(lines)]))
  }

  // ============================================== M8 · Bán thành phẩm

  /**
   * Danh sách bán thành phẩm kèm HAI con số giá cạnh nhau.
   *
   * `standardMilli` là giá theo công thức mẻ; `costPerBaseMilli` là giá thật đang
   * dùng, do những lượt nấu ở S7 đẩy lên theo bình quân gia quyền. Chênh lệch giữa
   * chúng là thứ đáng nhìn nhất ở màn này: nước dùng ninh già lửa, sốt pha đặc hơn
   * công thức, hay đơn giản là giá xương vừa tăng — cả ba đều hiện ra ở đây trước
   * khi hiện ra ở food cost của mười món dùng nó.
   */
  async prepList() {
    const rows = await this.db
      .select()
      .from(ingredients)
      .where(eq(ingredients.isSemiFinished, true))
      .orderBy(asc(ingredients.sort), asc(ingredients.name))
    if (rows.length === 0) return []

    const lines = await this.db
      .select({ line: prepRecipeLines, ing: ingredients })
      .from(prepRecipeLines)
      .innerJoin(ingredients, eq(ingredients.id, prepRecipeLines.ingredientId))
      .where(
        inArray(
          prepRecipeLines.prepId,
          rows.map((r) => r.id),
        ),
      )

    // Món nào đang dùng bán thành phẩm nào — cột "món dùng" và cũng là lời cảnh
    // báo trước khi ai đó sửa định lượng một mẻ
    const usage = await this.db
      .select({ ingredientId: dishRecipes.ingredientId, dishId: dishRecipes.dishId })
      .from(dishRecipes)
      .where(
        inArray(
          dishRecipes.ingredientId,
          rows.map((r) => r.id),
        ),
      )

    return rows.map((prep) => {
      const mine = lines.filter((l) => l.line.prepId === prep.id)
      const cost = prepCost(
        mine.map(({ line, ing }) => this.toRecipeInput(line, ing)),
        prep.prepYieldBase,
      )
      return {
        id: prep.id,
        code: prep.code,
        name: prep.name,
        groupName: prep.groupName,
        baseUnit: prep.baseUnit,
        yieldBase: prep.prepYieldBase,
        lineCount: mine.length,
        batchCostVnd: cost.costVnd,
        /** Giá vốn mỗi ĐVT cơ sở theo công thức; null = chưa đủ dữ kiện để chia */
        standardMilli: cost.costPerBaseMilli,
        /** Giá đang dùng thật, do S7 đẩy lên theo bình quân gia quyền */
        costPerBaseMilli: prep.costPerBaseMilli,
        usedByDishes: usage.filter((u) => u.ingredientId === prep.id).length,
      }
    })
  }

  async prepRecipe(prepId: string) {
    const [prep] = await this.db.select().from(ingredients).where(eq(ingredients.id, prepId))
    if (!prep) throw new NotFoundException('Không có nguyên liệu này')
    if (!prep.isSemiFinished) {
      throw new BadRequestException(
        `${prep.name} không phải bán thành phẩm — bật cờ đó ở màn Nguyên liệu (M7) trước`,
      )
    }

    const rows = await this.db
      .select({ line: prepRecipeLines, ing: ingredients })
      .from(prepRecipeLines)
      .innerJoin(ingredients, eq(ingredients.id, prepRecipeLines.ingredientId))
      .where(eq(prepRecipeLines.prepId, prepId))
      .orderBy(asc(prepRecipeLines.sort), asc(ingredients.name))

    const cost = prepCost(
      rows.map(({ line, ing }) => this.toRecipeInput(line, ing)),
      prep.prepYieldBase,
    )
    const byIngredient = new Map(cost.lines.map((l) => [l.ingredientId, l]))

    return {
      prep: {
        id: prep.id,
        code: prep.code,
        name: prep.name,
        baseUnit: prep.baseUnit,
        yieldBase: prep.prepYieldBase,
        costPerBaseMilli: prep.costPerBaseMilli,
      },
      lines: rows.map(({ line, ing }) => ({
        ingredientId: ing.id,
        code: ing.code,
        name: ing.name,
        baseUnit: ing.baseUnit,
        isSemiFinished: ing.isSemiFinished,
        costPerBaseMilli: ing.costPerBaseMilli,
        qtyBase: line.qtyBase,
        wasteBp: line.wasteBp,
        sort: line.sort,
        effectiveQtyBase: byIngredient.get(ing.id)!.effectiveQtyBase,
        costVnd: byIngredient.get(ing.id)!.costVnd,
        share: byIngredient.get(ing.id)!.share,
      })),
      batchCostVnd: cost.costVnd,
      standardMilli: cost.costPerBaseMilli,
    }
  }

  /**
   * Thay cả cụm công thức mẻ, kèm sản lượng — hai thứ đó là một phép chia, sửa
   * riêng từng vế thì giữa hai lần gọi giá mỗi ml sẽ sai gấp đôi hoặc còn một nửa.
   *
   * Có ghi vào `costPerBaseMilli` KHÔNG? Chỉ khi bán thành phẩm chưa có giá nào cả
   * (chưa nấu mẻ nào, chưa nhập lần nào). Sau đó thì không: giá thật thuộc về
   * những lượt nấu ở S7, và để công thức chuẩn đè lên nó là biến giá vốn hàng bán
   * thành thứ sửa được bằng cách gõ lại định lượng — đúng cái mà bình quân gia
   * quyền sinh ra để ngăn.
   */
  async setPrepRecipe(
    prepId: string,
    input: { yieldBase: number; lines: RecipeLineWrite[] },
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    const [prep] = await this.db.select().from(ingredients).where(eq(ingredients.id, prepId))
    if (!prep) throw new NotFoundException('Không có nguyên liệu này')
    if (!prep.isSemiFinished) {
      throw new BadRequestException(
        `${prep.name} không phải bán thành phẩm — bật cờ đó ở màn Nguyên liệu (M7) trước`,
      )
    }
    if (!Number.isSafeInteger(input.yieldBase) || input.yieldBase < 0) {
      throw new BadRequestException('Sản lượng mẻ phải là số nguyên không âm')
    }
    if (input.lines.length > 0 && input.yieldBase <= 0) {
      throw new BadRequestException(
        `Một mẻ ra bao nhiêu ${prep.baseUnit}? Thiếu số này thì không chia được giá mỗi ${prep.baseUnit}`,
      )
    }

    const seen = new Set<string>()
    for (const line of input.lines) {
      if (line.ingredientId === prepId) {
        throw new BadRequestException(`${prep.name} không thể là nguyên liệu của chính nó`)
      }
      if (seen.has(line.ingredientId)) {
        throw new BadRequestException(`Nguyên liệu ${line.ingredientId} bị khai hai lần`)
      }
      seen.add(line.ingredientId)
      if (!Number.isSafeInteger(line.qtyBase) || line.qtyBase <= 0) {
        throw new BadRequestException('Định lượng phải là số nguyên dương theo đơn vị cơ sở')
      }
      if (!Number.isSafeInteger(line.wasteBp) || line.wasteBp < 0 || line.wasteBp > 10_000) {
        throw new BadRequestException('Hao hụt phải trong khoảng 0–100%')
      }
    }

    if (seen.size > 0) {
      const known = await this.db
        .select({ id: ingredients.id })
        .from(ingredients)
        .where(inArray(ingredients.id, [...seen]))
      const missing = [...seen].filter((id) => !known.some((k) => k.id === id))
      if (missing.length > 0) {
        throw new BadRequestException(`Chưa có nguyên liệu: ${missing.join(', ')}`)
      }
      await this.assertNoPrepCycle(prepId, [...seen])
    }

    return this.db.transaction(async (tx) => {
      await this.approvals.authorize(tx, {
        actor,
        action: 'recipe.edit',
        entity: 'prep_recipe',
        entityId: prepId,
        approval,
      })

      await tx.delete(prepRecipeLines).where(eq(prepRecipeLines.prepId, prepId))
      if (input.lines.length > 0) {
        await tx.insert(prepRecipeLines).values(
          input.lines.map((line, index) => ({
            prepId,
            ingredientId: line.ingredientId,
            qtyBase: line.qtyBase,
            wasteBp: line.wasteBp,
            sort: index,
          })),
        )
      }
      await tx
        .update(ingredients)
        .set({ prepYieldBase: input.yieldBase })
        .where(eq(ingredients.id, prepId))

      const priced = await tx
        .select({ line: prepRecipeLines, ing: ingredients })
        .from(prepRecipeLines)
        .innerJoin(ingredients, eq(ingredients.id, prepRecipeLines.ingredientId))
        .where(eq(prepRecipeLines.prepId, prepId))
      const cost = prepCost(
        priced.map(({ line, ing }) => this.toRecipeInput(line, ing)),
        input.yieldBase,
      )

      /**
       * Mồi giá cho bán thành phẩm chưa từng có giá.
       *
       * Không mồi thì mọi món chèn sốt mới sẽ tính sốt bằng 0₫ và báo lãi cao hơn
       * thực tế — im lặng, cho tới lần nấu đầu tiên. Mồi rồi thì lượt nấu thật đầu
       * tiên ở S7 sẽ trộn nó theo trọng số như mọi lần nhập khác.
       */
      let seeded: number | null = null
      if (prep.costPerBaseMilli === 0 && cost.costPerBaseMilli !== null && cost.costPerBaseMilli > 0) {
        seeded = cost.costPerBaseMilli
        await tx
          .update(ingredients)
          .set({ costPerBaseMilli: seeded })
          .where(eq(ingredients.id, prepId))
      }

      const version = await this.writeVersion(tx, {
        subjectKind: 'prep',
        subjectId: prepId,
        rows: priced,
        yieldBase: input.yieldBase,
        costVnd: cost.costVnd,
        actor,
      })

      await this.audit.write(tx, {
        actor,
        action: 'prep-recipe.updated',
        entity: 'prep_recipe',
        entityId: prepId,
        payload: {
          lines: input.lines.length,
          yieldBase: input.yieldBase,
          batchCostVnd: cost.costVnd,
          standardMilli: cost.costPerBaseMilli,
          seeded,
          version,
        },
      })

      return {
        prepId,
        lines: input.lines.length,
        batchCostVnd: cost.costVnd,
        standardMilli: cost.costPerBaseMilli,
        seededMilli: seeded,
        version,
      }
    })
  }

  /**
   * Chặn BOM lồng vòng: sốt A dùng sốt B, B dùng lại A.
   *
   * CSDL chỉ chặn được vòng dài một bước (`prep_recipe_lines_not_self`). Vòng dài
   * hơn phải đi hết đồ thị, và nếu để lọt thì phép tính giá vốn không dừng lại ở
   * đâu cả — không phải sai số, mà là treo.
   */
  private async assertNoPrepCycle(prepId: string, componentIds: string[]) {
    const edges = await this.db
      .select({ prepId: prepRecipeLines.prepId, ingredientId: prepRecipeLines.ingredientId })
      .from(prepRecipeLines)

    const children = new Map<string, string[]>()
    for (const edge of edges) {
      // Bỏ qua các dòng CŨ của chính công thức đang lưu — chúng sắp bị thay
      if (edge.prepId === prepId) continue
      children.set(edge.prepId, [...(children.get(edge.prepId) ?? []), edge.ingredientId])
    }

    const seen = new Set<string>()
    const stack = [...componentIds]
    while (stack.length > 0) {
      const current = stack.pop()!
      if (current === prepId) {
        throw new BadRequestException(
          'Công thức lồng vòng: bán thành phẩm này rốt cuộc lại dùng chính nó',
        )
      }
      if (seen.has(current)) continue
      seen.add(current)
      stack.push(...(children.get(current) ?? []))
    }
  }

  // ========================================== M9 · Lịch sử phiên bản

  /**
   * Chụp bản vừa lưu. Trả về số phiên bản, hoặc null khi không có gì đổi.
   *
   * So với bản gần nhất trước khi ghi: bấm Lưu ba lần liên tiếp mà bảng y nguyên
   * thì lịch sử chỉ nên có một dòng — danh sách toàn phiên bản giống hệt nhau là
   * thứ làm người ta thôi mở màn M9 ra xem.
   */
  private async writeVersion(
    tx: Tx,
    input: {
      subjectKind: 'dish' | 'prep'
      subjectId: string
      rows: { line: { ingredientId: string; qtyBase: number; wasteBp: number }; ing: typeof ingredients.$inferSelect }[]
      yieldBase: number | null
      costVnd: number
      actor: Actor
    },
  ): Promise<number | null> {
    const lines: RecipeVersionLine[] = input.rows.map(({ line, ing }) => ({
      ingredientId: ing.id,
      name: ing.name,
      qtyBase: line.qtyBase,
      wasteBp: line.wasteBp,
      costPerBaseMilli: ing.costPerBaseMilli,
      costVnd: lineCostVnd(this.toRecipeInput(line, ing)),
    }))

    const [latest] = await tx
      .select()
      .from(recipeVersions)
      .where(
        and(
          eq(recipeVersions.subjectKind, input.subjectKind),
          eq(recipeVersions.subjectId, input.subjectId),
        ),
      )
      .orderBy(sql`${recipeVersions.version} desc`)
      .limit(1)

    if (latest && sameVersionContent(latest, lines, input.yieldBase)) return null

    const [row] = await tx
      .insert(recipeVersions)
      .values({
        subjectKind: input.subjectKind,
        subjectId: input.subjectId,
        version: (latest?.version ?? 0) + 1,
        lines,
        yieldBase: input.yieldBase,
        costVnd: input.costVnd,
        actorId: input.actor.kind === 'staff' ? input.actor.staffId : null,
      })
      .returning({ version: recipeVersions.version })

    return row!.version
  }

  /**
   * Dòng thời gian chung của mọi công thức — bảng chính của M9.
   *
   * Gộp món và bán thành phẩm vào một danh sách vì người mở màn này không đi tìm
   * "công thức của món X"; họ đi tìm "tuần này ai đụng vào cái gì và giá vốn nhảy
   * bao nhiêu". Câu hỏi kia đã có cửa riêng ở `versionsOf`.
   */
  async recentRecipeChanges(limit = 60) {
    const rows = await this.db
      .select({ v: recipeVersions, by: staff.fullName })
      .from(recipeVersions)
      .leftJoin(staff, eq(staff.id, recipeVersions.actorId))
      .orderBy(sql`${recipeVersions.id} desc`)
      .limit(limit)
    if (rows.length === 0) return []

    const names = await this.subjectNames(rows.map((r) => r.v))

    /**
     * Chênh lệch so với phiên bản LIỀN TRƯỚC của cùng công thức, không phải so với
     * dòng phía trên trong danh sách — danh sách đang trộn nhiều công thức với
     * nhau, lấy dòng trên là trừ giá vốn của món này cho giá vốn của món khác.
     */
    const previous = await this.db
      .select({
        subjectKind: recipeVersions.subjectKind,
        subjectId: recipeVersions.subjectId,
        version: recipeVersions.version,
        costVnd: recipeVersions.costVnd,
      })
      .from(recipeVersions)
    const costByKey = new Map(
      previous.map((p) => [`${p.subjectKind}:${p.subjectId}:${p.version}`, p.costVnd]),
    )

    return rows.map(({ v, by }) => ({
      id: v.id,
      subjectKind: v.subjectKind,
      subjectId: v.subjectId,
      subjectName: names.get(`${v.subjectKind}:${v.subjectId}`) ?? v.subjectId,
      version: v.version,
      lineCount: v.lines.length,
      yieldBase: v.yieldBase,
      costVnd: v.costVnd,
      previousCostVnd: costByKey.get(`${v.subjectKind}:${v.subjectId}:${v.version - 1}`) ?? null,
      actorName: by,
      createdAt: v.createdAt,
    }))
  }

  /** Các phiên bản của MỘT công thức, mới nhất trước */
  async versionsOf(subjectKind: 'dish' | 'prep', subjectId: string) {
    const rows = await this.db
      .select({ v: recipeVersions, by: staff.fullName })
      .from(recipeVersions)
      .leftJoin(staff, eq(staff.id, recipeVersions.actorId))
      .where(
        and(
          eq(recipeVersions.subjectKind, subjectKind),
          eq(recipeVersions.subjectId, subjectId),
        ),
      )
      .orderBy(sql`${recipeVersions.version} desc`)

    const names = await this.subjectNames(rows.map((r) => r.v))
    return {
      subjectKind,
      subjectId,
      subjectName: names.get(`${subjectKind}:${subjectId}`) ?? subjectId,
      versions: rows.map(({ v, by }) => ({
        version: v.version,
        lineCount: v.lines.length,
        yieldBase: v.yieldBase,
        costVnd: v.costVnd,
        actorName: by,
        createdAt: v.createdAt,
      })),
    }
  }

  /**
   * So hai bản — cột phải của M9.
   *
   * Ghép theo NGUYÊN LIỆU chứ không theo thứ tự dòng: đổi thứ tự bảng không phải
   * là đổi công thức, và một bảng so sánh coi việc kéo một dòng lên trên là "sửa
   * bốn dòng" thì không giúp ai đọc được cái gì.
   */
  async compareVersions(subjectKind: 'dish' | 'prep', subjectId: string, from: number, to: number) {
    const rows = await this.db
      .select({ v: recipeVersions, by: staff.fullName })
      .from(recipeVersions)
      .where(
        and(
          eq(recipeVersions.subjectKind, subjectKind),
          eq(recipeVersions.subjectId, subjectId),
          inArray(recipeVersions.version, [from, to]),
        ),
      )
      .leftJoin(staff, eq(staff.id, recipeVersions.actorId))

    const left = rows.find((r) => r.v.version === from)
    const right = rows.find((r) => r.v.version === to)
    if (!left || !right) throw new NotFoundException('Không có phiên bản này')

    const beforeById = new Map(left.v.lines.map((l) => [l.ingredientId, l]))
    const afterById = new Map(right.v.lines.map((l) => [l.ingredientId, l]))
    const ids = [...new Set([...beforeById.keys(), ...afterById.keys()])]

    return {
      subjectKind,
      subjectId,
      from: this.versionHead(left.v, left.by),
      to: this.versionHead(right.v, right.by),
      lines: ids.map((id) => {
        const before = beforeById.get(id) ?? null
        const after = afterById.get(id) ?? null
        return {
          ingredientId: id,
          name: (after ?? before)!.name,
          before,
          after,
          change: before === null ? 'added' : after === null ? 'removed' : sameLine(before, after) ? 'same' : 'changed',
        } as const
      }),
    }
  }

  private versionHead(v: typeof recipeVersions.$inferSelect, actorName: string | null) {
    return {
      version: v.version,
      costVnd: v.costVnd,
      yieldBase: v.yieldBase,
      actorName,
      createdAt: v.createdAt,
    }
  }

  /** Tên hiển thị của các công thức trong danh sách: món lấy ở `dishes`, mẻ ở `ingredients` */
  private async subjectNames(versions: { subjectKind: 'dish' | 'prep'; subjectId: string }[]) {
    const dishIds = versions.filter((v) => v.subjectKind === 'dish').map((v) => v.subjectId)
    const prepIds = versions.filter((v) => v.subjectKind === 'prep').map((v) => v.subjectId)

    const [dishRows, prepRows] = await Promise.all([
      dishIds.length
        ? this.db.select({ id: dishes.id, name: dishes.nameVi }).from(dishes).where(inArray(dishes.id, dishIds))
        : Promise.resolve([]),
      prepIds.length
        ? this.db
            .select({ id: ingredients.id, name: ingredients.name })
            .from(ingredients)
            .where(inArray(ingredients.id, prepIds))
        : Promise.resolve([]),
    ])

    return new Map([
      ...dishRows.map((r) => [`dish:${r.id}`, r.name] as const),
      ...prepRows.map((r) => [`prep:${r.id}`, r.name] as const),
    ])
  }

  // ================================================= Nhập kho & điều chỉnh

  /**
   * Nhập nhanh từ M7 — dùng cho ĐỒ KHÔ, thứ không cần truy ngược theo lô.
   *
   * Hàng khai `lotRequired` (hải sản sống, thịt bò, keg) bị TỪ CHỐI ở đây và
   * phải đi qua S5: cửa này không hỏi số lô, nên cho nó nhận hàng bắt buộc lô
   * nghĩa là mở một đường vòng qua chính ràng buộc mà §25 đặt ra. Một ràng buộc
   * có đường vòng là một ràng buộc không tồn tại.
   */
  async receive(
    input: {
      branchId: string
      ingredientId: string
      /** Số lượng theo ĐƠN VỊ MUA — nhận số lẻ (2,5 kg), server quy đổi */
      qtyPurchase: number
      /** Tiền trên hoá đơn cho đúng lượng này, đồng nguyên */
      totalVnd: number
      note?: string | null
    },
    actor: Actor,
  ) {
    if (!(input.qtyPurchase > 0)) throw new BadRequestException('Lượng nhập phải lớn hơn 0')
    if (!Number.isSafeInteger(input.totalVnd) || input.totalVnd < 0) {
      throw new BadRequestException('Tiền hàng phải là số nguyên đồng, không âm')
    }

    const branch = await this.requireBranch(input.branchId)

    return this.db.transaction(async (tx) => {
      const [ing] = await tx
        .select()
        .from(ingredients)
        .where(eq(ingredients.id, input.ingredientId))
        .for('update')
      if (!ing) throw new NotFoundException('Không có nguyên liệu này')
      if (ing.lotRequired) {
        throw new BadRequestException(
          `${ing.name} bắt buộc khai lô và hạn dùng — nhập ở màn Nhập kho (S5), không nhập nhanh ở đây`,
        )
      }

      const qtyBase = Math.round(input.qtyPurchase * ing.basePerPurchase)
      if (qtyBase <= 0) {
        throw new BadRequestException(
          `Lượng nhập quá nhỏ: quy đổi ra ${ing.baseUnit} thành 0`,
        )
      }

      // Giá bình quân ở cấp chuỗi nên trọng số là tồn của CẢ CHUỖI, không phải
      // tồn của riêng chi nhánh đang nhập
      const [onHand] = await tx
        .select({ qty: sql<number>`coalesce(sum(${stockLevels.qtyBase}), 0)::float8` })
        .from(stockLevels)
        .where(eq(stockLevels.ingredientId, input.ingredientId))

      const nextMilli = movingAverageMilli({
        onHandBase: Number(onHand?.qty ?? 0),
        currentMilli: ing.costPerBaseMilli,
        inBase: qtyBase,
        inTotalVnd: input.totalVnd,
      })

      await tx
        .update(ingredients)
        .set({ costPerBaseMilli: nextMilli })
        .where(eq(ingredients.id, input.ingredientId))

      await bumpStock(tx, input.branchId, input.ingredientId, qtyBase)

      const businessDate = businessDateOf(new Date(), branch.timezone)
      await tx.insert(stockMoves).values({
        branchId: input.branchId,
        ingredientId: input.ingredientId,
        kind: 'receipt',
        qtyBase,
        costVnd: input.totalVnd,
        note: input.note ?? null,
        actorId: actor.kind === 'staff' ? actor.staffId : null,
        businessDate,
      })

      await this.audit.write(tx, {
        actor,
        action: 'stock.received',
        entity: 'ingredient',
        entityId: input.ingredientId,
        payload: {
          qtyBase,
          totalVnd: input.totalVnd,
          costBefore: ing.costPerBaseMilli,
          costAfter: nextMilli,
        },
      })

      return {
        ingredientId: input.ingredientId,
        qtyBase,
        costPerBaseMilli: nextMilli,
        costPerBaseMilliBefore: ing.costPerBaseMilli,
      }
    })
  }

  /**
   * Điều chỉnh tồn có lý do — dòng `stock.write-off` của ma trận §4.2.
   *
   * Đây KHÔNG phải kiểm kê (S8): kiểm kê là đếm cả kho rồi duyệt một lượt. Đây là
   * cửa sửa một con số lệch, và nó tồn tại vì nếu không có thì một số tồn sai sẽ
   * sai vĩnh viễn cho tới khi S8 xong.
   */
  async adjust(
    input: { branchId: string; ingredientId: string; qtyBaseDelta: number; note: string },
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    if (!Number.isSafeInteger(input.qtyBaseDelta) || input.qtyBaseDelta === 0) {
      throw new BadRequestException('Lượng điều chỉnh phải là số nguyên khác 0')
    }
    if (!input.note?.trim()) throw new BadRequestException('Điều chỉnh tồn bắt buộc ghi lý do')

    const branch = await this.requireBranch(input.branchId)
    // Điều chỉnh tồn đổi giá vốn hàng bán, nên kỳ đã khoá sổ không nhận
    await this.locks.assertOpen(
      input.branchId,
      [businessDateOf(new Date(), branch.timezone)],
      'điều chỉnh tồn',
    )

    return this.db.transaction(async (tx) => {
      await this.approvals.authorize(tx, {
        actor,
        action: 'stock.write-off',
        entity: 'ingredient',
        entityId: input.ingredientId,
        approval,
      })

      const [ing] = await tx.select().from(ingredients).where(eq(ingredients.id, input.ingredientId))
      if (!ing) throw new NotFoundException('Không có nguyên liệu này')

      await bumpStock(tx, input.branchId, input.ingredientId, input.qtyBaseDelta)

      await tx.insert(stockMoves).values({
        branchId: input.branchId,
        ingredientId: input.ingredientId,
        kind: 'count_adjust',
        qtyBase: input.qtyBaseDelta,
        costVnd: Math.round((input.qtyBaseDelta * ing.costPerBaseMilli) / 1_000),
        note: input.note.trim(),
        actorId: actor.kind === 'staff' ? actor.staffId : null,
        businessDate: businessDateOf(new Date(), branch.timezone),
      })

      await this.audit.write(tx, {
        actor,
        action: 'stock.adjusted',
        entity: 'ingredient',
        entityId: input.ingredientId,
        payload: { delta: input.qtyBaseDelta, note: input.note.trim() },
      })

      return { ingredientId: input.ingredientId, delta: input.qtyBaseDelta }
    })
  }

  // ============================================= Trừ kho khi bếp bấm Xong

  /**
   * Quyết định nghiệp vụ 2 của §25: **trừ kho khi bếp bấm Xong**.
   *
   * Đơn vị trừ là DÒNG ĐƠN chứ không phải vé. Món đa trạm (Sukiyaki = nồi ST-04 +
   * khay thịt ST-02) sinh hai vé mang cùng `order_line_id`; trừ theo vé là trừ đôi
   * nguyên liệu. Nên ở đây chỉ trừ những dòng đã xong ở MỌI vé của nó, và chỉ số
   * `stock_moves_one_sale_per_line` canh lần cuối — hàng đợi offline của màn bếp
   * gửi lại mù cũng không sinh được bút toán thứ hai.
   *
   * BẤM HOÀN TÁC KHÔNG HOÀN KHO. "Xong" nghĩa là món đã rời bếp, và nguyên liệu
   * thì đã nấu mất rồi — trạng thái trên màn hình đổi lại không làm miếng thịt
   * hiện về trong tủ. Chênh lệch nếu có sẽ lộ ra ở kiểm kê (S8).
   */
  async postSaleForTicket(tx: Tx, ticketId: number, actor: Actor) {
    const doneLines = await tx
      .select({
        orderLineId: ticketItems.orderLineId,
        dishId: orderLines.dishId,
        qty: orderLines.qty,
        branchId: orders.branchId,
        businessDate: orders.businessDate,
      })
      .from(ticketItems)
      .innerJoin(orderLines, eq(orderLines.id, ticketItems.orderLineId))
      .innerJoin(orders, eq(orders.id, orderLines.orderId))
      .where(
        and(
          eq(ticketItems.ticketId, ticketId),
          eq(ticketItems.state, 'done'),
          // Chưa xong ở vé khác thì món chưa ra khỏi bếp
          sql`not exists (
            select 1 from ${ticketItems} other
            where other.order_line_id = ${ticketItems.orderLineId}
              and other.state not in ('done', 'voided')
          )`,
        ),
      )

    if (doneLines.length === 0) return { posted: 0 }

    const recipes = await tx
      .select({ line: dishRecipes, ing: ingredients })
      .from(dishRecipes)
      .innerJoin(ingredients, eq(ingredients.id, dishRecipes.ingredientId))
      .where(inArray(dishRecipes.dishId, [...new Set(doneLines.map((l) => l.dishId))]))

    let posted = 0
    for (const line of doneLines) {
      const forDish = recipes.filter((r) => r.line.dishId === line.dishId)
      if (forDish.length === 0) continue // món chưa khai công thức — không có gì để trừ

      const values = forDish.map(({ line: recipe, ing }) => {
        const qtyOut = effectiveQtyBase(line.qty, recipe.qtyBase, recipe.wasteBp)
        return {
          branchId: line.branchId,
          ingredientId: ing.id,
          kind: 'sale' as const,
          qtyBase: -qtyOut,
          costVnd: -Math.round((qtyOut * ing.costPerBaseMilli) / 1_000),
          orderLineId: line.orderLineId,
          actorId: actor.kind === 'staff' ? actor.staffId : null,
          businessDate: line.businessDate,
        }
      })

      // `onConflictDoNothing` + `returning` = chỉ những bút toán THẬT SỰ mới ghi
      // được mới đi tiếp vào tồn kho. Đây là chỗ chống trừ đôi.
      const inserted = await tx
        .insert(stockMoves)
        .values(values)
        .onConflictDoNothing()
        .returning({ ingredientId: stockMoves.ingredientId, qtyBase: stockMoves.qtyBase })

      for (const move of inserted) {
        await bumpStock(tx, line.branchId, move.ingredientId, Number(move.qtyBase))

        /**
         * Rút lô theo FEFO (S9), SAU khi bút toán đã ghi được.
         *
         * Thứ tự này bắt buộc: `onConflictDoNothing` là chỗ chống trừ đôi, nên
         * chỉ những lượt THẬT SỰ ghi được mới được rút lô. Rút trước rồi mới ghi
         * là hàng đợi offline của màn bếp gửi lại một lần sẽ rút lô thêm một lần
         * nữa dù bút toán bị bỏ qua.
         *
         * Bút toán bán KHÔNG mang `lot_id`, và đó là hệ quả có chủ ý của hai
         * ràng buộc gặp nhau: sổ kho chỉ THÊM (trigger 9004 chặn UPDATE), còn chỉ
         * số chống trừ đôi buộc mỗi dòng đơn × nguyên liệu chỉ có MỘT bút toán
         * bán. Chia nhỏ theo lô sẽ phá chỗ chống trừ đôi; ghi lô sau bằng UPDATE
         * thì đụng sổ bất biến. Đường truy ngược của lô vẫn còn — nó nằm ở lượng
         * còn lại của từng lô và ngày rút, đúng như thẻ kho giấy vẫn làm.
         *
         * Bán KHÔNG bị chặn khi lô không đủ: món đã nấu và đã ra khỏi bếp, từ
         * chối ở đây không làm miếng thịt quay về tủ. Chênh lệch giữa sổ lô và sổ
         * tồn sẽ lộ ra ở kiểm kê — đúng chỗ nó nên lộ ra.
         */
        await consumeLots(tx, line.branchId, move.ingredientId, -Number(move.qtyBase))
      }
      posted += inserted.length
    }

    return { posted }
  }

  // ================================================ S2 tồn kho · S1 tổng quan

  async overview(branchId: string) {
    const branch = await this.requireBranch(branchId)
    const rows = await this.ingredients(branchId)
    const month = this.monthOf(branch.timezone)

    const [consumed] = await this.db
      .select({ cost: sql<number>`coalesce(sum(${stockMoves.costVnd}), 0)::float8` })
      .from(stockMoves)
      .where(
        and(
          eq(stockMoves.branchId, branchId),
          eq(stockMoves.kind, 'sale'),
          gte(stockMoves.businessDate, month.from),
          lte(stockMoves.businessDate, month.to),
        ),
      )

    const [noRecipe] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(dishes)
      .where(
        sql`${dishes.kind} <> 'set' AND ${dishes.active}
            AND not exists (select 1 from ${dishRecipes} r where r.dish_id = ${dishes.id})`,
      )

    return {
      branchId,
      totalValueVnd: rows.reduce((sum, r) => sum + r.valueVnd, 0),
      ingredientCount: rows.length,
      belowMin: rows.filter((r) => r.belowMin),
      /** Nguyên liệu chưa có giá — mỗi dòng ở đây là một món bị hụt giá vốn */
      withoutCost: rows.filter((r) => r.costPerBaseMilli === 0).length,
      dishesWithoutRecipe: Number(noRecipe?.count ?? 0),
      /** Giá vốn đã tiêu thụ trong tháng, đồng nguyên (bút toán bán mang dấu âm) */
      consumedThisMonthVnd: Math.abs(Number(consumed?.cost ?? 0)),
      expiringLots: {
        value: null,
        blockedBy: 'Lô & hạn dùng FEFO (S9) — chưa dựng, nên chưa cảnh báo được hạn',
      },
      wasteThisMonth: {
        value: null,
        blockedBy: 'Báo cáo hao hụt (S11) cần kiểm kê S8 để so tiêu hao lý thuyết với thực tế',
      },
    }
  }

  /** Thẻ kho rút gọn của một nguyên liệu (S12 đầy đủ chưa dựng) */
  async moves(branchId: string, ingredientId: string, limit = 50) {
    return this.db
      .select({
        id: stockMoves.id,
        kind: stockMoves.kind,
        qtyBase: stockMoves.qtyBase,
        costVnd: stockMoves.costVnd,
        note: stockMoves.note,
        orderLineId: stockMoves.orderLineId,
        businessDate: stockMoves.businessDate,
        createdAt: stockMoves.createdAt,
      })
      .from(stockMoves)
      .where(and(eq(stockMoves.branchId, branchId), eq(stockMoves.ingredientId, ingredientId)))
      .orderBy(sql`${stockMoves.id} desc`)
      .limit(limit)
  }

  // --------------------------------------------------------------- phụ trợ

  private async requireBranch(branchId: string) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return branch
  }

  /**
   * Tháng đang chạy theo NGÀY LÀM VIỆC của chi nhánh.
   *
   * Lấy theo giờ máy chủ thì mọi đêm từ 0h đến 7h sáng giờ Việt Nam, S1 sẽ báo
   * tiêu hao của tháng trước — máy chủ chạy UTC nên nó vẫn đang ở ngày hôm qua.
   */
  private monthOf(timezone: string): { from: string; to: string } {
    const today = businessDateOf(new Date(), timezone)
    const [year, month] = today.split('-').map(Number)
    const last = new Date(Date.UTC(year!, month!, 0))
    return { from: `${today.slice(0, 7)}-01`, to: last.toISOString().slice(0, 10) }
  }
}

/**
 * Hai bản chụp có giống nhau không (M9).
 *
 * So theo nguyên liệu, không theo thứ tự dòng — kéo một dòng lên trên không phải
 * là sửa công thức. GIÁ nguyên liệu cố ý KHÔNG tham gia so sánh: giá xương tăng
 * không phải là ai đó sửa công thức, và sinh một phiên bản mới mỗi lần nhập hàng
 * sẽ nhấn chìm những lần sửa thật.
 */
function sameVersionContent(
  latest: { lines: RecipeVersionLine[]; yieldBase: number | null },
  lines: RecipeVersionLine[],
  yieldBase: number | null,
): boolean {
  if (latest.yieldBase !== yieldBase) return false
  if (latest.lines.length !== lines.length) return false

  const before = new Map(latest.lines.map((l) => [l.ingredientId, l]))
  return lines.every((line) => {
    const other = before.get(line.ingredientId)
    return other !== undefined && sameLine(other, line)
  })
}

function sameLine(a: RecipeVersionLine, b: RecipeVersionLine): boolean {
  return a.qtyBase === b.qtyBase && a.wasteBp === b.wasteBp
}
