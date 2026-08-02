import { Inject, Injectable } from '@nestjs/common'
import { and, eq, inArray } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { DbOrTx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  dishAvailability,
  dishBranchOverrides,
  dishes,
  modifierOptions,
  setGroupItems,
  setGroups,
  stations,
} from '../../db/schema'
import type { SetDefinition } from '../kitchen/domain/explode'
import type { DishRouting } from '../kitchen/domain/routing'
import { scheduleOf, type SaleSchedule } from './domain/sale-window'

export interface CatalogDish {
  id: string
  code: string
  kind: 'dish' | 'set' | 'drink'
  name: string
  /** Giá đã áp ghi đè theo chi nhánh — đây là giá sẽ ĐÓNG BĂNG vào dòng đơn */
  price: number
  routing: DishRouting | null
  /** Lịch bán M11 — chỗ duy nhất mọi cửa gọi món đi qua, nên cũng là chỗ cưỡng chế */
  schedule: SaleSchedule
}

/**
 * Đọc danh mục đã áp ghi đè theo chi nhánh (kiến trúc đa chi nhánh §5: món thuộc
 * chuỗi, nhưng giá · có bán không · trạm thì ghi đè được theo chi nhánh).
 *
 * Mọi nơi cần giá hay trạm đều đi qua đây để không có hai nguồn sự thật.
 */
@Injectable()
export class CatalogService {
  constructor(@Inject(DB) private readonly db: Db) {}

  async dishesByIds(
    branchId: string,
    ids: string[],
    tx: DbOrTx = this.db,
  ): Promise<Map<string, CatalogDish>> {
    if (ids.length === 0) return new Map()

    const rows = await tx
      .select({ dish: dishes, override: dishBranchOverrides })
      .from(dishes)
      // Điều kiện chi nhánh nằm TRONG join, không lọc sau: nếu không thì mỗi món
      // trả về một dòng cho mỗi chi nhánh có ghi đè.
      .leftJoin(
        dishBranchOverrides,
        and(
          eq(dishBranchOverrides.dishId, dishes.id),
          eq(dishBranchOverrides.branchId, branchId),
        ),
      )
      .where(inArray(dishes.id, ids))

    const out = new Map<string, CatalogDish>()
    for (const { dish, override: o } of rows) {
      out.set(dish.id, {
        id: dish.id,
        code: dish.code,
        kind: dish.kind as CatalogDish['kind'],
        name: dish.nameVi,
        price: o?.price ?? dish.basePrice,
        routing:
          dish.stationGrill && dish.stationNoGrill
            ? {
                method: (dish.routingMethod ?? 'fixed') as DishRouting['method'],
                stationGrill: o?.stationGrill ?? dish.stationGrill,
                stationNoGrill: o?.stationNoGrill ?? dish.stationNoGrill,
                stationTakeaway: dish.stationTakeaway,
                stationDelivery: dish.stationDelivery,
                secondaryStation: dish.secondaryStation,
                primaryLabel: dish.primaryLabel,
                secondaryLabel: dish.secondaryLabel,
                prepSeconds: dish.prepSeconds,
              }
            : null,
        schedule: scheduleOf(dish),
      })
    }
    return out
  }

  /** Định nghĩa set để nổ thành món thành phần */
  async setDefinition(setDishId: string, tx: DbOrTx = this.db): Promise<SetDefinition | null> {
    const [dish] = await tx.select().from(dishes).where(eq(dishes.id, setDishId))
    if (!dish || dish.kind !== 'set') return null

    const groups = await tx
      .select()
      .from(setGroups)
      .where(eq(setGroups.setDishId, setDishId))
      .orderBy(setGroups.sort)
    if (groups.length === 0) return null

    const items = await tx
      .select()
      .from(setGroupItems)
      .where(
        inArray(
          setGroupItems.groupId,
          groups.map((g) => g.id),
        ),
      )
      .orderBy(setGroupItems.sort)

    return {
      setDishId,
      label: dish.nameVi.toUpperCase(),
      groups: groups.map((g) => ({
        id: g.id,
        label: g.label,
        pickCount: g.pickCount,
        batchOffset: g.batchOffset,
        items: items
          .filter((i) => i.groupId === g.id)
          .map((i) => ({ dishId: i.dishId, qty: i.qty, portionLabel: i.portionLabel })),
      })),
    }
  }

  async modifierOptionsByIds(ids: string[], tx: DbOrTx = this.db) {
    if (ids.length === 0) return new Map<string, { id: string; name: string; priceDelta: number }>()
    const rows = await tx.select().from(modifierOptions).where(inArray(modifierOptions.id, ids))
    return new Map(rows.map((r) => [r.id, { id: r.id, name: r.name, priceDelta: r.priceDelta }]))
  }

  /** Tiền tố mã vé theo trạm (A-0412 ở ST-06, B-0412 ở ST-02) */
  async stationPrefixes(tx: DbOrTx = this.db): Promise<Record<string, string>> {
    const rows = await tx.select().from(stations)
    return Object.fromEntries(rows.map((r) => [r.id, r.ticketPrefix]))
  }

  /** Món đang hết hoặc còn giới hạn ở chi nhánh — bảng thưa, thường rất ít dòng */
  async availability(branchId: string, tx: DbOrTx = this.db) {
    const rows = await tx
      .select()
      .from(dishAvailability)
      .where(eq(dishAvailability.branchId, branchId))
    return new Map(rows.map((r) => [r.dishId, r]))
  }
}
