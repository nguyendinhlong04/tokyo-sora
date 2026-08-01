import { randomUUID } from 'node:crypto'
import { Inject, Injectable, NotFoundException } from '@nestjs/common'
import { rooms } from '@sora/contracts'
import { and, desc, eq } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { ParamsService } from '../../common/params.service'
import type { Db } from '../../db/client'
import {
  areas,
  branches,
  categories,
  configBundles,
  dishBranchOverrides,
  dishModifierGroups,
  dishes,
  modifierGroups,
  modifierOptions,
  setGroupItems,
  setGroups,
  stations,
  tables,
} from '../../db/schema'
import type { Actor } from '../identity/actor'

/**
 * Bundle cấu hình phát xuống các app (TRIEN-KHAI §2.3).
 *
 * Office là nguồn duy nhất của cấu hình; Web · Table · POS · Kitchen chỉ ĐỌC.
 * App cache lại theo `version` và chỉ tải mới khi version đổi.
 *
 * Cố tình KHÔNG chứa trạng thái hết món: 86 đổi nhiều lần mỗi ca, nhét vào đây sẽ
 * phá pattern cache 304. Hết món là live state, đi đường riêng (module kitchen).
 */
@Injectable()
export class ConfigBundleService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
  ) {}

  /** Dựng bundle từ dữ liệu hiện tại, đã áp ghi đè theo chi nhánh */
  async build(branchId: string): Promise<Record<string, unknown>> {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)

    const [
      stationRows,
      categoryRows,
      dishRows,
      overrideRows,
      areaRows,
      tableRows,
      groupRows,
      groupItemRows,
      modifierGroupRows,
      modifierOptionRows,
      dishModifierRows,
    ] = await Promise.all([
      this.db.select().from(stations).orderBy(stations.sort),
      this.db.select().from(categories).orderBy(categories.sort),
      this.db.select().from(dishes).orderBy(dishes.sort),
      this.db.select().from(dishBranchOverrides).where(eq(dishBranchOverrides.branchId, branchId)),
      this.db.select().from(areas).where(eq(areas.branchId, branchId)).orderBy(areas.sort),
      this.db.select().from(tables).where(eq(tables.branchId, branchId)),
      this.db.select().from(setGroups).orderBy(setGroups.sort),
      this.db.select().from(setGroupItems).orderBy(setGroupItems.sort),
      this.db.select().from(modifierGroups),
      this.db.select().from(modifierOptions).orderBy(modifierOptions.sort),
      this.db.select().from(dishModifierGroups).orderBy(dishModifierGroups.sort),
    ])

    const overrideByDish = new Map(overrideRows.map((o) => [o.dishId, o]))
    const modifierGroupsByDish = new Map<string, string[]>()
    for (const link of dishModifierRows) {
      modifierGroupsByDish.set(link.dishId, [
        ...(modifierGroupsByDish.get(link.dishId) ?? []),
        link.groupId,
      ])
    }
    const optionsByGroup = new Map<string, typeof modifierOptionRows>()
    for (const option of modifierOptionRows) {
      optionsByGroup.set(option.groupId, [...(optionsByGroup.get(option.groupId) ?? []), option])
    }
    const itemsByGroup = new Map<string, typeof groupItemRows>()
    for (const item of groupItemRows) {
      const list = itemsByGroup.get(item.groupId) ?? []
      list.push(item)
      itemsByGroup.set(item.groupId, list)
    }
    const groupsBySet = new Map<string, typeof groupRows>()
    for (const group of groupRows) {
      const list = groupsBySet.get(group.setDishId) ?? []
      list.push(group)
      groupsBySet.set(group.setDishId, list)
    }

    const menu = dishRows
      .map((d) => {
        const o = overrideByDish.get(d.id)
        const active = o?.active ?? d.active
        if (!active) return null
        return {
          id: d.id,
          code: d.code,
          kind: d.kind,
          categoryId: d.categoryId,
          subCategory: d.subCategory,
          nameVi: d.nameVi,
          nameEn: d.nameEn,
          nameJa: d.nameJa,
          kana: d.kana,
          shortDesc: d.shortDesc,
          allergens: d.allergens,
          tags: d.tags,
          modifierGroupIds: modifierGroupsByDish.get(d.id) ?? [],
          // Giá đã áp ghi đè chi nhánh — đây là giá sẽ đóng băng vào dòng đơn
          price: o?.price ?? d.basePrice,
          routing: {
            method: d.routingMethod,
            stationGrill: o?.stationGrill ?? d.stationGrill,
            stationNoGrill: o?.stationNoGrill ?? d.stationNoGrill,
            stationTakeaway: d.stationTakeaway,
            stationDelivery: d.stationDelivery,
            secondaryStation: d.secondaryStation,
            primaryLabel: d.primaryLabel,
            secondaryLabel: d.secondaryLabel,
            prepSeconds: d.prepSeconds,
          },
          onlineVisible: d.onlineVisible,
          tableOrderable: d.tableOrderable,
          sort: d.sort,
        }
      })
      .filter((d): d is NonNullable<typeof d> => d !== null)

    const sets = dishRows
      .filter((d) => d.kind === 'set')
      .map((d) => ({
        setDishId: d.id,
        label: d.nameVi,
        groups: (groupsBySet.get(d.id) ?? []).map((g) => ({
          id: g.id,
          label: g.label,
          pickCount: g.pickCount,
          batchOffset: g.batchOffset,
          items: (itemsByGroup.get(g.id) ?? []).map((i) => ({
            dishId: i.dishId,
            qty: i.qty,
            portionLabel: i.portionLabel,
          })),
        })),
      }))

    const modifiers = modifierGroupRows.map((g) => ({
      id: g.id,
      name: g.name,
      required: g.required,
      multi: g.multi,
      pickMin: g.pickMin,
      pickMax: g.pickMax,
      options: (optionsByGroup.get(g.id) ?? []).map((o) => ({
        id: o.id,
        name: o.name,
        priceDelta: o.priceDelta,
      })),
    }))

    return {
      branch: {
        id: branch.id,
        name: branch.name,
        address: branch.address,
        phone: branch.phone,
        timezone: branch.timezone,
        openHours: branch.openHours,
      },
      stations: stationRows,
      categories: categoryRows,
      dishes: menu,
      sets,
      modifiers,
      floorplan: {
        areas: areaRows,
        tables: tableRows.map((t) => ({
          id: t.id,
          code: t.code,
          areaId: t.areaId,
          kind: t.kind,
          hasGrill: t.hasGrill,
          grillType: t.grillType,
          seatMin: t.seatMin,
          seatMax: t.seatMax,
          active: t.active,
        })),
      },
      params: await this.params.allForBranch(branchId),
    }
  }

  /** Office bấm "Lưu & phát hành" — sinh version mới và báo cho mọi app */
  async publish(branchId: string, actor: Actor) {
    const payload = await this.build(branchId)

    return this.db.transaction(async (tx) => {
      // Version có dạng `<ISO>#<id>` (TRIEN-KHAI §2.3) nên phải biết id trước khi
      // ghi. Chèn với giá trị tạm duy nhất rồi cập nhật ngay trong cùng transaction
      // — bên ngoài không bao giờ nhìn thấy giá trị tạm này.
      const [row] = await tx
        .insert(configBundles)
        .values({
          branchId,
          version: `pending:${randomUUID()}`,
          payload,
          publishedBy: actor.kind === 'staff' ? actor.staffId : null,
        })
        .returning({ id: configBundles.id, publishedAt: configBundles.publishedAt })

      const version = `${row!.publishedAt.toISOString()}#${row!.id}`
      await tx.update(configBundles).set({ version }).where(eq(configBundles.id, row!.id))

      await emit(tx, {
        branchId,
        topic: 'config.published',
        rooms: [rooms.config(branchId)],
        payload: { version },
      })

      return { version, publishedAt: row!.publishedAt }
    })
  }

  /** Bản đang phát hành; null nếu chi nhánh chưa publish lần nào */
  async latest(branchId: string) {
    const [row] = await this.db
      .select()
      .from(configBundles)
      .where(and(eq(configBundles.branchId, branchId)))
      .orderBy(desc(configBundles.id))
      .limit(1)
    return row ?? null
  }
}
