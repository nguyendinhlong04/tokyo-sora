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
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  dishRecipes,
  dishes,
  ingredients,
  orderLines,
  orders,
  stockLevels,
  stockMoves,
  ticketItems,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import {
  dishCost,
  effectiveQtyBase,
  foodCost,
  movingAverageMilli,
  stockRatio,
  type DishCostBreakdown,
  type RecipeLineInput,
} from './domain/costing'

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
 *   2. Trừ kho khi bếp bấm Xong        → `postSaleForTicket`
 *   3. Bắt buộc lô với hải sản/bò/keg  → CHƯA CƯỠNG CHẾ: cờ `lotRequired` đã có
 *      trên nguyên liệu nhưng bảng lô (S9) chưa dựng nên chưa ai đọc tới.
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

      await this.approvals.authorize(tx, {
        actor,
        action: 'recipe.edit',
        entity: 'ingredient',
        entityId: id,
        approval,
      })

      const [row] = await tx
        .update(ingredients)
        .set(this.cleanIngredient(next as IngredientInput))
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

      // M9 (lịch sử phiên bản công thức) chưa dựng; ghi chênh lệch giá vốn vào nhật
      // ký A7 để ít nhất còn truy được "ai sửa, giá vốn đổi bao nhiêu"
      await this.audit.write(tx, {
        actor,
        action: 'recipe.updated',
        entity: 'dish_recipe',
        entityId: dishId,
        payload: { lines: lines.length, costBefore, costAfter, delta: costAfter - costBefore },
      })

      return { dishId, lines: lines.length, costBefore, costAfter }
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

  // ================================================= Nhập kho & điều chỉnh

  /**
   * Nhập kho (rút gọn của S5) — cửa DUY NHẤT làm đổi giá bình quân.
   *
   * Chưa có: số lô, hạn dùng, nhiệt độ nhận, ảnh chứng từ, cảnh báo lệch giá so
   * với lần nhập trước, và ràng buộc `lotRequired`. Tất cả nằm ở S5/S9.
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

      await this.bumpStock(tx, input.branchId, input.ingredientId, qtyBase)

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

      await this.bumpStock(tx, input.branchId, input.ingredientId, input.qtyBaseDelta)

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
        await this.bumpStock(tx, line.branchId, move.ingredientId, Number(move.qtyBase))
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

  private async bumpStock(tx: Tx, branchId: string, ingredientId: string, delta: number) {
    await tx
      .insert(stockLevels)
      .values({ branchId, ingredientId, qtyBase: delta })
      .onConflictDoUpdate({
        target: [stockLevels.branchId, stockLevels.ingredientId],
        set: {
          qtyBase: sql`${stockLevels.qtyBase} + ${delta}`,
          updatedAt: new Date(),
        },
      })
  }

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
