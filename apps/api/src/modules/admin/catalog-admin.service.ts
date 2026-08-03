import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { rooms } from '@sora/contracts'
import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { isUniqueViolation } from '../../common/pg-error'
import type { Db } from '../../db/client'
import {
  branches,
  categories,
  dishBranchOverrides,
  dishStories,
  dishes,
  setGroupItems,
  setGroups,
  stations,
  type DishStoryCondiment,
  type DishStoryCut,
} from '../../db/schema'
import { describeSchedule, scheduleOf } from '../catalog/domain/sale-window'
import { setCostRange } from '../catalog/domain/set-cost'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'
import { foodCost } from '../inventory/domain/costing'
import { InventoryService } from '../inventory/inventory.service'
import type { SetDefinition } from '../kitchen/domain/explode'

export interface DishInput {
  id: string
  code: string
  kind: 'dish' | 'set' | 'drink'
  categoryId: string | null
  subCategory: string | null
  nameVi: string
  nameEn: string | null
  nameJa: string | null
  kana: string | null
  shortDesc: string | null
  longDesc: string | null
  /** Ảnh món dùng chung mọi kênh; đường dẫn, không phải tệp tải lên */
  imageUrl: string | null
  allergens: string[] | null
  tags: string[] | null
  routingMethod: 'fixed' | 'song' | 'nuong' | 'linh_hoat' | null
  stationGrill: string | null
  stationNoGrill: string | null
  stationTakeaway: string | null
  stationDelivery: string | null
  secondaryStation: string | null
  primaryLabel: string | null
  secondaryLabel: string | null
  prepSeconds: number
  basePrice: number
  /** Giá riêng khi bán qua kênh online; null = bán bằng giá tại quán */
  onlinePrice: number | null
  vatCode: string
  onlineVisible: boolean
  tableOrderable: boolean
  signature: boolean
  active: boolean
  /** Lịch bán (M11) — xem `catalog/domain/sale-window.ts` */
  saleFrom: string | null
  saleTo: string | null
  saleDays: number
  saleStartMinute: number | null
  saleEndMinute: number | null
  sort: number
}

export interface CategoryInput {
  id: string
  parentId: string | null
  nameVi: string
  nameEn: string | null
  nameJa: string | null
  kanji: string | null
  imageUrl: string | null
  onlineVisible: boolean
  tableVisible: boolean
}

/** Một dòng của cây M10: bản ghi nhóm + vị trí trong cây + số món */
export type CategoryTreeRow = typeof categories.$inferSelect & {
  /** 0 = nhóm gốc; màn M10 thụt lề theo con số này */
  depth: number
  /** Món gắn thẳng vào nhóm này */
  dishCount: number
  /** Gồm cả món nằm trong nhóm con — con số phải nhìn trước khi xoá */
  totalDishCount: number
  childCount: number
}

export interface SetCourseInput {
  label: string
  kanji: string | null
  pickCount: number | null
  batchOffset: number
  items: { dishId: string; qty: number; portionLabel: string | null }[]
}

/**
 * Phần biên tập của trang chi tiết món trên web (W3), nhập ở M1.
 *
 * Mọi trường đều bỏ trống được: trang web tự lùi về bản gọn cho món chưa kể, và
 * người nhập không phải điền cho đủ hai mươi ô mới lưu được một dòng lưu ý.
 */
export interface DishStoryInput {
  chapterNo: string | null
  portionLabel: string | null
  nameJaFull: string | null
  intro: string | null
  note: string | null
  craft: string | null
  footerImageUrl: string | null
  bannerJa: string | null
  bannerVi: string | null
  closing: string | null
  pairingDishIds: string[] | null
  origin: string | null
  originKanji: string | null
  originImageUrl: string | null
  flavours: string[] | null
  cutsLabel: string | null
  cuts: DishStoryCut[] | null
  fire: string | null
  fireImageUrl: string | null
  dip: string | null
  dipImageUrl: string | null
  condiments: DishStoryCondiment[] | null
  serves: string | null
  duration: string | null
  flow: string[] | null
  extraDishIds: string[] | null
}

/**
 * M1 — Món và set. Cửa GHI duy nhất của trung tâm sản phẩm.
 *
 * "Chỉ một nơi ghi dữ liệu món… Web, Table, POS, KDS, Online, kho, kế toán đều là
 * NGƯỜI ĐỌC" (§18.1). Nên mọi ràng buộc phải chặn ở đây, không phải ở từng kênh:
 * món thiếu trạm thì vé bếp không biết in ở đâu, món bật bán online mà không có
 * mô tả thì trang web hiện một ô trống.
 */
@Injectable()
export class CatalogAdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly approvals: ApprovalService,
    private readonly audit: AuditService,
    // M11 đọc giá vốn món thành phần bằng ĐÚNG hàm mà M4 dùng — hai bản cài đặt
    // của cùng một phép tính sẽ trôi lệch, và lệch ở giá vốn thì không ai nhìn ra
    private readonly inventory: InventoryService,
  ) {}

  // ------------------------------------------------------------------- đọc

  /** Danh sách món kèm ghi đè của chi nhánh đang xem */
  async list(branchId: string | null) {
    const [rows, overrides] = await Promise.all([
      this.db.select().from(dishes).orderBy(asc(dishes.categoryId), asc(dishes.sort), asc(dishes.nameVi)),
      branchId
        ? this.db.select().from(dishBranchOverrides).where(eq(dishBranchOverrides.branchId, branchId))
        : Promise.resolve([]),
    ])

    const byDish = new Map(overrides.map((o) => [o.dishId, o]))
    return rows.map((d) => {
      const override = byDish.get(d.id)
      return {
        ...d,
        override: override
          ? {
              price: override.price,
              active: override.active,
              onlineVisible: override.onlineVisible,
              onlinePrice: override.onlinePrice,
            }
          : null,
        /** Giá và trạng thái mà chi nhánh này thật sự bán */
        effectivePrice: override?.price ?? d.basePrice,
        effectiveActive: override?.active ?? d.active,
        /** Cùng thứ tự ưu tiên với thực đơn online mà khách nhìn thấy */
        effectiveOnlineVisible: override?.onlineVisible ?? d.onlineVisible,
        effectiveOnlinePrice:
          override?.onlinePrice ?? override?.price ?? d.onlinePrice ?? d.basePrice,
      }
    })
  }

  async detail(id: string) {
    const [dish] = await this.db.select().from(dishes).where(eq(dishes.id, id))
    if (!dish) throw new NotFoundException('Không có món này')

    const [groups, overrides, storyRows] = await Promise.all([
      this.db.select().from(setGroups).where(eq(setGroups.setDishId, id)).orderBy(asc(setGroups.sort)),
      this.db.select().from(dishBranchOverrides).where(eq(dishBranchOverrides.dishId, id)),
      this.db.select().from(dishStories).where(eq(dishStories.dishId, id)),
    ])
    const items = groups.length
      ? await this.db
          .select()
          .from(setGroupItems)
          .where(inArray(setGroupItems.groupId, groups.map((g) => g.id)))
          .orderBy(asc(setGroupItems.sort))
      : []

    return {
      dish,
      courses: groups.map((g) => ({
        label: g.label,
        kanji: g.kanji,
        pickCount: g.pickCount,
        batchOffset: g.batchOffset,
        items: items
          .filter((i) => i.groupId === g.id)
          .map((i) => ({ dishId: i.dishId, qty: i.qty, portionLabel: i.portionLabel })),
      })),
      overrides: overrides.map((o) => ({
        branchId: o.branchId,
        price: o.price,
        active: o.active,
        onlineVisible: o.onlineVisible,
        onlinePrice: o.onlinePrice,
      })),
      /** `null` = món chưa được kể; trang chi tiết dựng bản gọn */
      story: storyRows[0] ?? null,
    }
  }

  /** Nhóm và trạm bếp — hai bộ chọn của trình sửa món */
  async pickers() {
    const [categoryRows, stationRows] = await Promise.all([
      this.db.select().from(categories).orderBy(asc(categories.sort)),
      this.db.select().from(stations).orderBy(asc(stations.sort)),
    ])
    return {
      categories: categoryRows.map((c) => ({ id: c.id, nameVi: c.nameVi, kanji: c.kanji })),
      stations: stationRows.map((s) => ({ id: s.id, name: s.name, kanji: s.kanji })),
    }
  }

  // -------------------------------------------------------------------- ghi

  async create(input: DishInput, actor: Actor) {
    assertDish(input)
    if (!/^[a-z0-9-]{2,40}$/.test(input.id)) {
      throw new BadRequestException('Mã định danh chỉ gồm chữ thường, số và dấu gạch ngang')
    }

    try {
      const [row] = await this.db.insert(dishes).values(input).returning()
      await this.write(actor, 'dish.created', row!.id, { code: row!.code, name: row!.nameVi })
      await this.announce(row!.id)
      return row!
    } catch (err) {
      if (isUniqueViolation(err)) {
        throw new ConflictException(`Đã có món mang mã ${input.code} hoặc định danh ${input.id}`)
      }
      throw err
    }
  }

  /**
   * Sửa món.
   *
   * Đổi giá là hành động có dòng riêng trong ma trận §4.2 (`menu.edit-price`,
   * R7 phải xin duyệt) nên nó được tách ra kiểm riêng: sửa mô tả thì không ai
   * phải gọi quản lý, còn đổi giá thì có.
   */
  async update(
    id: string,
    input: Partial<DishInput>,
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    const [current] = await this.db.select().from(dishes).where(eq(dishes.id, id))
    if (!current) throw new NotFoundException('Không có món này')

    const next = { ...current, ...input } as DishInput
    assertDish(next)

    const priceChanged = input.basePrice !== undefined && input.basePrice !== current.basePrice

    return this.db.transaction(async (tx) => {
      if (priceChanged) {
        await this.approvals.authorize(tx, {
          actor,
          action: 'menu.edit-price',
          entity: 'dish',
          entityId: id,
          approval,
        })
      }

      const { id: _ignored, ...patch } = next
      await tx.update(dishes).set(patch).where(eq(dishes.id, id))
      await this.audit.write(tx, {
        actor,
        action: priceChanged ? 'dish.price.changed' : 'dish.updated',
        entity: 'dish',
        entityId: id,
        payload: priceChanged
          ? { from: current.basePrice, to: next.basePrice }
          : { ...input },
      })
      await this.emitUpdate(tx, id)
      return { ...next, id }
    })
  }

  /**
   * Giá và trạng thái riêng của một chi nhánh (§5 kiến trúc đa chi nhánh).
   *
   * Ghi đè `active = false` là cách tắt món ở ĐÚNG một chi nhánh mà không đụng
   * hai chi nhánh kia — khác hẳn với 86 (hết món trong ca), thứ tự hết hạn cuối
   * ngày và nằm ở bảng khác.
   */
  async setBranchOverride(
    dishId: string,
    branchId: string,
    input: {
      price: number | null
      active: boolean | null
      onlineVisible?: boolean | null
      onlinePrice?: number | null
    },
    actor: Actor,
    approval?: ApprovalInput | null,
  ) {
    const [dish] = await this.db.select().from(dishes).where(eq(dishes.id, dishId))
    if (!dish) throw new NotFoundException('Không có món này')
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException('Không có chi nhánh này')
    if ((input.price !== null && input.price < 0) || (input.onlinePrice ?? 0) < 0) {
      throw new BadRequestException('Giá không nhận số âm')
    }

    return this.db.transaction(async (tx) => {
      if (input.price !== null || input.onlinePrice != null) {
        await this.approvals.authorize(tx, {
          actor,
          action: 'menu.edit-price',
          entity: 'dish',
          entityId: dishId,
          approval,
        })
      }

      const row = {
        dishId,
        branchId,
        price: input.price,
        active: input.active,
        onlineVisible: input.onlineVisible ?? null,
        onlinePrice: input.onlinePrice ?? null,
      }
      await tx
        .insert(dishBranchOverrides)
        .values(row)
        .onConflictDoUpdate({
          target: [dishBranchOverrides.dishId, dishBranchOverrides.branchId],
          set: {
            price: row.price,
            active: row.active,
            onlineVisible: row.onlineVisible,
            onlinePrice: row.onlinePrice,
          },
        })
      await this.audit.write(tx, {
        actor,
        action: 'dish.branch-override.set',
        entity: 'dish',
        entityId: dishId,
        payload: { branchId, ...input },
      })
      await this.emitUpdate(tx, dishId, branchId)
      return row
    })
  }

  async clearBranchOverride(dishId: string, branchId: string, actor: Actor) {
    const deleted = await this.db
      .delete(dishBranchOverrides)
      .where(
        and(eq(dishBranchOverrides.dishId, dishId), eq(dishBranchOverrides.branchId, branchId)),
      )
      .returning({ dishId: dishBranchOverrides.dishId })
    if (deleted.length === 0) {
      throw new NotFoundException('Chi nhánh này không có ghi đè cho món đó')
    }
    await this.write(actor, 'dish.branch-override.cleared', dishId, { branchId })
    await this.announce(dishId, branchId)
    return { dishId, branchId, cleared: true }
  }

  /**
   * Thay toàn bộ chặng của set.
   *
   * Thay cả cụm chứ không sửa từng dòng: set là một mâm dọn theo nhịp, đổi một
   * chặng thường kéo theo đổi thứ tự và định lượng chặng khác. Dòng đơn đã bán
   * giữ bản chụp tên và giá riêng nên không bị ảnh hưởng.
   */
  async setCourses(setDishId: string, courses: SetCourseInput[], actor: Actor) {
    const [dish] = await this.db.select().from(dishes).where(eq(dishes.id, setDishId))
    if (!dish) throw new NotFoundException('Không có món này')
    if (dish.kind !== 'set') throw new BadRequestException('Chỉ set mới có chặng')

    const dishIds = [...new Set(courses.flatMap((c) => c.items.map((i) => i.dishId)))]
    if (dishIds.length > 0) {
      const found = await this.db
        .select({ id: dishes.id })
        .from(dishes)
        .where(inArray(dishes.id, dishIds))
      const missing = dishIds.filter((id) => !found.some((f) => f.id === id))
      if (missing.length > 0) {
        throw new BadRequestException(`Chưa có món trong danh mục: ${missing.join(', ')}`)
      }
    }
    for (const course of courses) {
      if (course.items.length === 0) {
        throw new BadRequestException(`Chặng "${course.label}" chưa có món nào`)
      }
      if (course.pickCount !== null && course.pickCount > course.items.length) {
        throw new BadRequestException(
          `Chặng "${course.label}" cho chọn ${course.pickCount} món nhưng chỉ liệt kê ${course.items.length}`,
        )
      }
    }

    return this.db.transaction(async (tx) => {
      const old = await tx.select({ id: setGroups.id }).from(setGroups).where(eq(setGroups.setDishId, setDishId))
      if (old.length > 0) {
        await tx.delete(setGroupItems).where(inArray(setGroupItems.groupId, old.map((g) => g.id)))
        await tx.delete(setGroups).where(eq(setGroups.setDishId, setDishId))
      }

      for (const [index, course] of courses.entries()) {
        const groupId = `${setDishId}-c${index + 1}`
        await tx.insert(setGroups).values({
          id: groupId,
          setDishId,
          label: course.label,
          kanji: course.kanji,
          pickCount: course.pickCount,
          batchOffset: course.batchOffset,
          sort: index,
        })
        for (const [itemIndex, item] of course.items.entries()) {
          await tx.insert(setGroupItems).values({
            groupId,
            dishId: item.dishId,
            qty: item.qty,
            portionLabel: item.portionLabel,
            sort: itemIndex,
          })
        }
      }

      await this.audit.write(tx, {
        actor,
        action: 'dish.set-courses.replaced',
        entity: 'dish',
        entityId: setDishId,
        payload: { courses: courses.length },
      })
      await this.emitUpdate(tx, setDishId)
      return { setDishId, courses: courses.length }
    })
  }

  /**
   * Thay toàn bộ phần biên tập của trang chi tiết món (W3).
   *
   * Ghi cả cụm giống `setCourses`: form ở M1 gửi lên nguyên trạng những gì người
   * nhập đang nhìn, nên PATCH từng trường chỉ đẻ ra câu hỏi "bỏ trống nghĩa là
   * xoá hay nghĩa là không đụng tới".
   *
   * Mã món dùng kèm và món gọi thêm được kiểm có thật: một mã gõ sai ở đây thành
   * một ô trống lặng lẽ trên trang web, không ai nhận ra cho tới khi khách hỏi.
   */
  async setStory(dishId: string, input: DishStoryInput, actor: Actor) {
    const [dish] = await this.db.select().from(dishes).where(eq(dishes.id, dishId))
    if (!dish) throw new NotFoundException('Không có món này')

    const linked = [...new Set([...(input.pairingDishIds ?? []), ...(input.extraDishIds ?? [])])]
    if (linked.length > 0) {
      const found = await this.db
        .select({ id: dishes.id })
        .from(dishes)
        .where(inArray(dishes.id, linked))
      const missing = linked.filter((id) => !found.some((f) => f.id === id))
      if (missing.length > 0) {
        throw new BadRequestException(`Chưa có món trong danh mục: ${missing.join(', ')}`)
      }
      if (linked.includes(dishId)) {
        throw new BadRequestException('Món không dùng kèm với chính nó')
      }
    }

    const row = { dishId, ...input }
    return this.db.transaction(async (tx) => {
      await tx
        .insert(dishStories)
        .values(row)
        .onConflictDoUpdate({ target: dishStories.dishId, set: input })
      await this.audit.write(tx, {
        actor,
        action: 'dish.story.saved',
        entity: 'dish',
        entityId: dishId,
        payload: { dishId },
      })
      await this.emitUpdate(tx, dishId)
      return row
    })
  }

  /** Bỏ hẳn phần kể chuyện — trang chi tiết quay về bản gọn */
  async clearStory(dishId: string, actor: Actor) {
    const deleted = await this.db
      .delete(dishStories)
      .where(eq(dishStories.dishId, dishId))
      .returning({ dishId: dishStories.dishId })
    if (deleted.length === 0) throw new NotFoundException('Món này chưa có nội dung giới thiệu')
    await this.write(actor, 'dish.story.cleared', dishId, {})
    await this.announce(dishId)
    return { dishId, cleared: true }
  }

  // ============================================== M10 · Cây danh mục

  /**
   * Cả cây, phẳng, đã sắp theo thứ tự duyệt trước — màn M10 chỉ việc thụt lề theo
   * `depth`. Kèm số món TRỰC TIẾP trong nhóm và tổng gồm cả nhóm con: xoá nhóm cha
   * rỗng nhưng có 40 món nằm trong nhóm con là chuyện phải thấy trước khi bấm.
   */
  async categoryTree() {
    const [rows, counts] = await Promise.all([
      this.db.select().from(categories).orderBy(asc(categories.sort), asc(categories.nameVi)),
      this.db
        .select({ categoryId: dishes.categoryId, count: sql<number>`count(*)::int` })
        .from(dishes)
        .groupBy(dishes.categoryId),
    ])

    const directCount = new Map(counts.map((c) => [c.categoryId ?? '', Number(c.count)]))
    const childrenOf = new Map<string, typeof rows>()
    for (const row of rows) {
      const key = row.parentId ?? ''
      childrenOf.set(key, [...(childrenOf.get(key) ?? []), row])
    }

    const out: CategoryTreeRow[] = []

    const walk = (parentId: string, depth: number): number => {
      let subtree = 0
      for (const row of childrenOf.get(parentId) ?? []) {
        const index = out.length
        const direct = directCount.get(row.id) ?? 0
        out.push({
          ...row,
          depth,
          dishCount: direct,
          totalDishCount: direct,
          childCount: (childrenOf.get(row.id) ?? []).length,
        })
        // Tổng của cây con chỉ biết được sau khi đi hết cây con — quay lại điền
        const below = walk(row.id, depth + 1)
        out[index]!.totalDishCount = direct + below
        subtree += direct + below
      }
      return subtree
    }
    walk('', 0)

    /**
     * Nhóm mồ côi (cha đã bị xoá bằng tay ngoài ứng dụng) sẽ không xuất hiện trong
     * lượt duyệt trên. Đẩy chúng ra cuối thay vì để mất hẳn: một nhóm không nhìn
     * thấy trên M10 nhưng vẫn gắn với 12 món là thứ tệ hơn một nhóm xếp sai chỗ.
     */
    for (const row of rows) {
      if (!out.some((o) => o.id === row.id)) {
        const direct = directCount.get(row.id) ?? 0
        out.push({ ...row, depth: 0, dishCount: direct, totalDishCount: direct, childCount: 0 })
      }
    }

    return out
  }

  async createCategory(input: CategoryInput, actor: Actor) {
    if (!/^[a-z0-9-]{2,40}$/.test(input.id)) {
      throw new BadRequestException('Mã nhóm chỉ gồm chữ thường, số và dấu gạch ngang')
    }
    if (!input.nameVi.trim()) throw new BadRequestException('Nhóm phải có tên tiếng Việt')
    if (input.parentId) await this.requireCategory(input.parentId)

    try {
      const [row] = await this.db
        .insert(categories)
        .values({ ...this.cleanCategory(input), sort: await this.nextSort(input.parentId) })
        .returning()
      await this.write(actor, 'category.created', row!.id, { nameVi: row!.nameVi }, 'category')
      await this.announceCategories(row!.id)
      return row!
    } catch (err) {
      if (isUniqueViolation(err)) throw new ConflictException(`Đã có nhóm mang mã ${input.id}`)
      throw err
    }
  }

  /**
   * Sửa nội dung nhóm. KHÔNG đổi cha ở đây — chuyển chỗ là `moveCategory`, vì nó
   * phải đánh số lại hai danh sách anh em và kiểm vòng lặp.
   */
  async updateCategory(id: string, patch: Partial<CategoryInput>, actor: Actor) {
    const current = await this.requireCategory(id)
    const next = { ...current, ...patch, id, parentId: current.parentId } as CategoryInput
    if (!next.nameVi.trim()) throw new BadRequestException('Nhóm phải có tên tiếng Việt')

    const [row] = await this.db
      .update(categories)
      .set(this.cleanCategory(next))
      .where(eq(categories.id, id))
      .returning()

    await this.write(actor, 'category.updated', id, { ...patch }, 'category')
    await this.announceCategories(id)
    return row!
  }

  /**
   * Kéo thả: chuyển nhóm sang cha mới, chèn vào vị trí thứ `position`.
   *
   * Đánh số lại CẢ danh sách anh em thay vì nhét một số ở giữa: thứ tự thưa
   * (0, 10, 20…) sẽ hết chỗ sau vài lần kéo và người dùng không hiểu vì sao lần
   * này thả không ăn. Vài chục nhóm thì viết lại cả cột `sort` là chuyện rẻ.
   *
   * "Đổi danh mục KHÔNG ảnh hưởng định tuyến bếp" (§24 M10): đúng theo cấu trúc,
   * vì trạm nằm trên `dishes` chứ không trên nhóm. Không có gì phải làm thêm ở
   * đây — chỉ có một thứ phải giữ: đừng bao giờ đem trạm về bảng này.
   */
  async moveCategory(id: string, parentId: string | null, position: number, actor: Actor) {
    const current = await this.requireCategory(id)
    if (parentId) {
      await this.requireCategory(parentId)
      await this.assertNotDescendant(id, parentId)
    }

    return this.db.transaction(async (tx) => {
      const siblings = await tx
        .select({ id: categories.id })
        .from(categories)
        .where(parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId))
        .orderBy(asc(categories.sort), asc(categories.nameVi))

      const order = siblings.map((s) => s.id).filter((s) => s !== id)
      order.splice(Math.max(0, Math.min(position, order.length)), 0, id)

      for (const [index, siblingId] of order.entries()) {
        await tx
          .update(categories)
          .set(siblingId === id ? { parentId, sort: index } : { sort: index })
          .where(eq(categories.id, siblingId))
      }

      // Danh sách anh em CŨ cũng phải liền số lại, nếu không lần kéo sau tính sai vị trí
      if (current.parentId !== parentId) {
        const old = await tx
          .select({ id: categories.id })
          .from(categories)
          .where(
            current.parentId === null
              ? isNull(categories.parentId)
              : eq(categories.parentId, current.parentId),
          )
          .orderBy(asc(categories.sort), asc(categories.nameVi))
        for (const [index, sibling] of old.entries()) {
          await tx.update(categories).set({ sort: index }).where(eq(categories.id, sibling.id))
        }
      }

      await this.audit.write(tx, {
        actor,
        action: 'category.moved',
        entity: 'category',
        entityId: id,
        payload: { from: current.parentId, to: parentId, position },
      })
      return { id, parentId, position: order.indexOf(id) }
    })
  }

  /**
   * Xoá nhóm — chỉ khi nó rỗng cả hai chiều.
   *
   * Cho xoá nhóm còn món thì `dishes.category_id` thành NULL và mười mấy món rơi
   * xuống "Chưa xếp nhóm" mà không ai bấm gì thêm; cho xoá nhóm còn nhóm con thì
   * khoá ngoại chặn và người dùng nhận một lỗi Postgres. Nói trước bằng tiếng Việt
   * dễ hơn cả hai.
   */
  async deleteCategory(id: string, actor: Actor) {
    await this.requireCategory(id)

    const [child] = await this.db
      .select({ id: categories.id })
      .from(categories)
      .where(eq(categories.parentId, id))
      .limit(1)
    if (child) throw new ConflictException('Nhóm còn nhóm con — chuyển hoặc xoá nhóm con trước')

    const [dish] = await this.db
      .select({ id: dishes.id })
      .from(dishes)
      .where(eq(dishes.categoryId, id))
      .limit(1)
    if (dish) throw new ConflictException('Nhóm còn món — chuyển món sang nhóm khác trước')

    await this.db.delete(categories).where(eq(categories.id, id))
    await this.write(actor, 'category.deleted', id, {}, 'category')
    await this.announceCategories(id)
    return { id, deleted: true }
  }

  private cleanCategory(input: CategoryInput) {
    return {
      id: input.id,
      parentId: input.parentId,
      nameVi: input.nameVi.trim(),
      nameEn: input.nameEn?.trim() || null,
      nameJa: input.nameJa?.trim() || null,
      kanji: input.kanji?.trim() || null,
      imageUrl: input.imageUrl?.trim() || null,
      onlineVisible: input.onlineVisible,
      tableVisible: input.tableVisible,
    }
  }

  private async requireCategory(id: string) {
    const [row] = await this.db.select().from(categories).where(eq(categories.id, id))
    if (!row) throw new NotFoundException(`Không có nhóm ${id}`)
    return row
  }

  private async nextSort(parentId: string | null) {
    const [row] = await this.db
      .select({ max: sql<number>`coalesce(max(${categories.sort}), -1)::int` })
      .from(categories)
      .where(parentId === null ? isNull(categories.parentId) : eq(categories.parentId, parentId))
    return Number(row?.max ?? -1) + 1
  }

  /** Thả một nhóm vào chính cây con của nó là cắt cả nhánh đó khỏi cây */
  private async assertNotDescendant(id: string, candidateParentId: string) {
    const rows = await this.db
      .select({ id: categories.id, parentId: categories.parentId })
      .from(categories)
    const parentOf = new Map(rows.map((r) => [r.id, r.parentId]))

    let cursor: string | null = candidateParentId
    const seen = new Set<string>()
    while (cursor !== null) {
      if (cursor === id) {
        throw new BadRequestException('Không thả được một nhóm vào chính nhóm con của nó')
      }
      if (seen.has(cursor)) break // dữ liệu đã vòng sẵn — không phải lỗi của lần thả này
      seen.add(cursor)
      cursor = parentOf.get(cursor) ?? null
    }
  }

  // ============================================== M11 · Set & Combo

  /**
   * Danh sách set kèm DẢI giá vốn min–max và food cost tương ứng (§24 M11).
   *
   * Một con số giá vốn duy nhất cho set là con số bịa: set "chọn 4 trong 10" có
   * giá vốn khác nhau tuỳ khách gọi ba chỉ hay dẻ sườn. Màn này hiện cả hai đầu
   * dải, và food cost ở đầu đắt nhất mới là con số dùng để quyết định giá bán —
   * khách chọn đắt nhất không phải trường hợp hiếm, đó là trường hợp mặc định.
   */
  async setsOverview(branchId: string | null) {
    const [setRows, overrides, groupRows, itemRows, costIndex] = await Promise.all([
      this.db.select().from(dishes).where(eq(dishes.kind, 'set')).orderBy(asc(dishes.sort), asc(dishes.nameVi)),
      branchId
        ? this.db.select().from(dishBranchOverrides).where(eq(dishBranchOverrides.branchId, branchId))
        : Promise.resolve([]),
      this.db.select().from(setGroups).orderBy(asc(setGroups.sort)),
      this.db.select().from(setGroupItems).orderBy(asc(setGroupItems.sort)),
      this.inventory.dishCostIndex(),
    ])

    const componentIds = [...new Set(itemRows.map((i) => i.dishId))]
    const componentRows = componentIds.length
      ? await this.db
          .select({ id: dishes.id, nameVi: dishes.nameVi })
          .from(dishes)
          .where(inArray(dishes.id, componentIds))
      : []
    const nameOf = new Map(componentRows.map((c) => [c.id, c.nameVi]))
    const overrideByDish = new Map(overrides.map((o) => [o.dishId, o]))
    const costOf = (dishId: string) => costIndex.get(dishId)?.costVnd ?? null

    return setRows.map((set) => {
      const groups = groupRows.filter((g) => g.setDishId === set.id)
      const definition: SetDefinition = {
        setDishId: set.id,
        label: set.nameVi,
        groups: groups.map((g) => ({
          id: g.id,
          label: g.label,
          pickCount: g.pickCount,
          batchOffset: g.batchOffset,
          items: itemRows
            .filter((i) => i.groupId === g.id)
            .map((i) => ({ dishId: i.dishId, qty: i.qty, portionLabel: i.portionLabel })),
        })),
      }

      const range = setCostRange(definition, costOf)
      const override = overrideByDish.get(set.id)
      const price = override?.price ?? set.basePrice
      const schedule = scheduleOf(set)

      return {
        id: set.id,
        code: set.code,
        nameVi: set.nameVi,
        active: override?.active ?? set.active,
        priceVnd: price,
        onlineVisible: override?.onlineVisible ?? set.onlineVisible,
        tableOrderable: set.tableOrderable,
        branchOverride: override ? { price: override.price, active: override.active } : null,
        courses: range.courses,
        courseCount: groups.length,
        costMinVnd: range.minVnd,
        costMaxVnd: range.maxVnd,
        /** null khi còn món thành phần chưa có công thức — dải chưa đọc được */
        foodCostMin: range.unknownDishIds.length > 0 ? null : foodCost(range.minVnd, price, true).percent,
        foodCostMax: range.unknownDishIds.length > 0 ? null : foodCost(range.maxVnd, price, true).percent,
        unknownDishes: range.unknownDishIds.map((id) => nameOf.get(id) ?? id),
        schedule,
        scheduleLabel: describeSchedule(schedule),
      }
    })
  }

  // ---------------------------------------------------------------- phụ trợ

  /**
   * Báo cho mọi kênh biết món vừa đổi.
   *
   * "Sự kiện `mon.cap-nhat` làm mới cache mọi kênh trong ≤ 60 giây" (§18.1).
   * Phát vào kênh cấu hình của từng chi nhánh vì đó là kênh mọi thiết bị trong
   * quán đều nghe.
   */
  private async emitUpdate(tx: Parameters<typeof emit>[0], dishId: string, branchId?: string) {
    const targets = branchId
      ? [branchId]
      : (await this.db.select({ id: branches.id }).from(branches)).map((b) => b.id)
    for (const id of targets) {
      await emit(tx, {
        branchId: id,
        topic: 'mon.cap-nhat',
        rooms: [rooms.config(id)],
        payload: { dishId },
      })
    }
  }

  private async announce(dishId: string, branchId?: string) {
    await this.db.transaction(async (tx) => {
      await this.emitUpdate(tx, dishId, branchId)
    })
  }

  /**
   * Cây danh mục vừa đổi — cùng sự kiện, cùng kênh với món.
   *
   * Nhóm nằm trong config bundle của mọi thiết bị: đổi tên nhóm mà không báo thì
   * POS còn hiện tên cũ cho tới lần khởi động sau, và bảng phím món của thu ngân
   * lệch hẳn với màn Office mà không ai giải thích được vì sao.
   */
  private async announceCategories(categoryId: string) {
    await this.db.transaction(async (tx) => {
      const targets = (await this.db.select({ id: branches.id }).from(branches)).map((b) => b.id)
      for (const id of targets) {
        await emit(tx, {
          branchId: id,
          topic: 'mon.cap-nhat',
          rooms: [rooms.config(id)],
          payload: { categoryId },
        })
      }
    })
  }

  private async write(
    actor: Actor,
    action: string,
    entityId: string,
    payload: Record<string, unknown>,
    entity: 'dish' | 'category' = 'dish',
  ) {
    await this.db.transaction(async (tx) => {
      await this.audit.write(tx, { actor, action, entity, entityId, payload })
    })
  }
}

/**
 * Ràng buộc khi lưu món (§18.1).
 *
 * Cùng luật với check của CSDL nhưng nói bằng tiếng người: lỗi ràng buộc Postgres
 * đọc lên màn hình là một chuỗi tên constraint, không giúp được ai đang sửa món.
 */
function assertDish(input: DishInput) {
  if (!input.nameVi.trim()) throw new BadRequestException('Món phải có tên tiếng Việt')
  if (!input.code.trim()) throw new BadRequestException('Món phải có mã')
  if (input.basePrice < 0) throw new BadRequestException('Giá không nhận số âm')
  if (input.prepSeconds < 0) throw new BadRequestException('Thời gian chuẩn không nhận số âm')

  // Set là vỏ chứa giá, món thành phần mới đi bếp — nên set miễn khai trạm
  if (input.kind !== 'set' && (!input.stationGrill || !input.stationNoGrill)) {
    throw new BadRequestException(
      'Món đi bếp phải khai cả trạm khi bàn CÓ bếp và trạm khi bàn KHÔNG bếp — thiếu thì vé không biết in ở đâu',
    )
  }

  /**
   * "Món bật bán online phải có ảnh + mô tả" (§18.1). Chỉ kiểm mô tả: cột ảnh mới
   * có nên phần lớn món đang bán vẫn để trống, và chặn ở đây là khoá luôn nút lưu
   * của những món đó. Bật kiểm ảnh khi bộ ảnh đã nhập xong.
   */
  if (input.onlineVisible && !input.shortDesc?.trim()) {
    throw new BadRequestException(
      'Món bán online phải có mô tả ngắn — trang đặt món hiện thẳng dòng này dưới tên món',
    )
  }

  assertSaleSchedule(input)
}

/**
 * Lịch bán (M11). Nói trước bằng tiếng Việt những gì CHECK của CSDL cũng chặn —
 * "dishes_sale_window_check" trên màn hình không giúp ai sửa được lịch.
 */
function assertSaleSchedule(input: DishInput) {
  if (input.saleDays < 1 || input.saleDays > 127) {
    throw new BadRequestException(
      'Lịch bán phải còn ít nhất một ngày trong tuần — không bán ngày nào thì tắt món (Đang bán)',
    )
  }
  if ((input.saleStartMinute === null) !== (input.saleEndMinute === null)) {
    throw new BadRequestException('Khung giờ bán phải khai cả giờ mở lẫn giờ đóng')
  }
  if (input.saleStartMinute !== null && input.saleEndMinute! <= input.saleStartMinute) {
    throw new BadRequestException(
      'Giờ đóng phải sau giờ mở — quán đóng cửa trong đêm nên khung giờ không vắt qua nửa đêm',
    )
  }
  if (input.saleFrom !== null && input.saleTo !== null && input.saleTo < input.saleFrom) {
    throw new BadRequestException('Ngày kết thúc lịch bán phải sau ngày bắt đầu')
  }
}
