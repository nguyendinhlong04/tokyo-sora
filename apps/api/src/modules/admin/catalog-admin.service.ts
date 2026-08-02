import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { rooms } from '@sora/contracts'
import { and, asc, eq, inArray } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { isUniqueViolation } from '../../common/pg-error'
import type { Db } from '../../db/client'
import {
  branches,
  categories,
  dishBranchOverrides,
  dishes,
  setGroupItems,
  setGroups,
  stations,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { ApprovalService, type ApprovalInput } from '../identity/approval.service'
import { AuditService } from '../identity/audit.service'

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
  sort: number
}

export interface SetCourseInput {
  label: string
  kanji: string | null
  pickCount: number | null
  batchOffset: number
  items: { dishId: string; qty: number; portionLabel: string | null }[]
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

    const [groups, overrides] = await Promise.all([
      this.db.select().from(setGroups).where(eq(setGroups.setDishId, id)).orderBy(asc(setGroups.sort)),
      this.db.select().from(dishBranchOverrides).where(eq(dishBranchOverrides.dishId, id)),
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

  private async write(actor: Actor, action: string, entityId: string, payload: Record<string, unknown>) {
    await this.db.transaction(async (tx) => {
      await this.audit.write(tx, { actor, action, entity: 'dish', entityId, payload })
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
   * "Món bật bán online phải có ảnh + mô tả" (§18.1). Ảnh chưa kiểm được vì danh
   * mục chưa có cột ảnh — ảnh đang theo quy ước `dish-<mã>-main` ở CDN. Nửa kiểm
   * được thì kiểm.
   */
  if (input.onlineVisible && !input.shortDesc?.trim()) {
    throw new BadRequestException(
      'Món bán online phải có mô tả ngắn — trang đặt món hiện thẳng dòng này dưới tên món',
    )
  }
}
