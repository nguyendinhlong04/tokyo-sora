import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { rooms } from '@sora/contracts'
import { asc, eq, inArray, sql } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import { emit } from '../../common/outbox'
import { isUniqueViolation } from '../../common/pg-error'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import {
  branches,
  dishModifierGroups,
  dishes,
  modifierGroups,
  modifierOptions,
} from '../../db/schema'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'

export interface ModifierOptionInput {
  /** Rỗng = lựa chọn mới, để dịch vụ tự sinh mã */
  id?: string | null
  name: string
  priceDelta: number
  affectsStock: boolean
}

export interface ModifierGroupInput {
  id: string
  name: string
  required: boolean
  multi: boolean
  pickMin: number
  pickMax: number | null
  options: ModifierOptionInput[]
}

/**
 * M5 — Tuỳ chọn.
 *
 * Nhóm tuỳ chọn là thứ DÙNG CHUNG cho nhiều món ("sửa ở đây là mọi món dùng nhóm
 * đó đổi theo"), nên nó có màn riêng chứ không nằm gọn trong trình sửa món. Trình
 * sửa món chỉ chọn dùng nhóm nào — khai lại danh sách vị nướng ở từng món là cách
 * chắc chắn để mười ba món nướng có mười ba bảng vị lệch nhau.
 *
 * Hai ràng buộc nghiệp vụ cưỡng chế ở đây chứ không ở CSDL, vì chúng là quy tắc
 * của màn khai báo chứ không phải bất biến của dữ liệu:
 *   · nhóm BẮT BUỘC phải có ít nhất hai lựa chọn — một lựa chọn duy nhất mà bắt
 *     khách chọn thì đó là thuộc tính của món, không phải câu hỏi;
 *   · nhóm chọn một thì `pickMax` phải là 1 — POS đọc `multi` để vẽ nút tròn hay
 *     ô vuông, còn máy chủ đọc `pickMax` để chặn; hai số lệch nhau thì màn hình
 *     nói một đằng, máy chủ chặn một nẻo.
 */
@Injectable()
export class ModifierAdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  /** Danh sách nhóm kèm số món đang dùng và dải chênh giá (cột của M5) */
  async list() {
    const groups = await this.db.select().from(modifierGroups).orderBy(asc(modifierGroups.name))
    if (groups.length === 0) return []

    const ids = groups.map((g) => g.id)
    const [options, usage] = await Promise.all([
      this.db
        .select()
        .from(modifierOptions)
        .where(inArray(modifierOptions.groupId, ids))
        .orderBy(asc(modifierOptions.sort), asc(modifierOptions.name)),
      this.db
        .select({
          groupId: dishModifierGroups.groupId,
          dishes: sql<number>`count(*)::int`,
        })
        .from(dishModifierGroups)
        .where(inArray(dishModifierGroups.groupId, ids))
        .groupBy(dishModifierGroups.groupId),
    ])

    const usageByGroup = new Map(usage.map((u) => [u.groupId, Number(u.dishes)]))
    return groups.map((group) => {
      const own = options.filter((o) => o.groupId === group.id)
      const deltas = own.map((o) => o.priceDelta)
      return {
        ...group,
        options: own,
        dishCount: usageByGroup.get(group.id) ?? 0,
        priceMin: deltas.length ? Math.min(...deltas) : 0,
        priceMax: deltas.length ? Math.max(...deltas) : 0,
      }
    })
  }

  /**
   * Tạo mới hoặc sửa một nhóm, kèm trọn danh sách lựa chọn.
   *
   * Lựa chọn cũ giữ NGUYÊN MÃ khi sửa tên hay chênh giá: mã lựa chọn nằm trong
   * bản chụp `modifiers` của dòng đơn và trong giỏ hàng đang mở trên máy POS.
   * Sinh mã mới mỗi lần lưu là làm hỏng phiếu order mà nhân viên đang dựng dở.
   */
  async save(input: ModifierGroupInput, actor: Actor) {
    if (input.required && input.options.length < 2) {
      throw new BadRequestException(
        'Nhóm bắt buộc phải có ít nhất hai lựa chọn — một lựa chọn duy nhất là thuộc tính của món, không phải câu hỏi',
      )
    }
    if (input.options.length === 0) {
      throw new BadRequestException('Nhóm phải có ít nhất một lựa chọn')
    }

    const pickMin = input.required ? Math.max(1, input.pickMin) : 0
    const pickMax = input.multi ? (input.pickMax ?? null) : 1
    if (pickMax !== null && pickMax < pickMin) {
      throw new BadRequestException('Chọn tối đa không được nhỏ hơn chọn tối thiểu')
    }
    if (pickMax !== null && pickMax > input.options.length) {
      throw new BadRequestException(
        `Nhóm chỉ có ${input.options.length} lựa chọn — không đặt tối đa ${pickMax} được`,
      )
    }

    return this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(modifierGroups)
        .where(eq(modifierGroups.id, input.id))

      /**
       * Chỉ soi dạng mã khi TẠO MỚI.
       *
       * Dữ liệu nền có sẵn những mã kiểu `modYaki-vi` từ đợt seed đầu; bắt chúng
       * theo dạng mới nghĩa là không ai sửa lại được bảng vị của mười ba món
       * nướng, mà đổi mã thì hỏng bản chụp trên đơn cũ.
       */
      if (!existing && !/^[a-z0-9-]{2,40}$/.test(input.id)) {
        throw new BadRequestException('Mã nhóm chỉ gồm chữ thường, số và dấu gạch ngang')
      }

      const row = {
        id: input.id,
        name: input.name.trim(),
        required: input.required,
        multi: input.multi,
        pickMin,
        pickMax,
      }
      if (existing) {
        await tx.update(modifierGroups).set(row).where(eq(modifierGroups.id, input.id))
      } else {
        await tx.insert(modifierGroups).values(row)
      }

      const kept = new Set<string>()
      let sort = 0
      for (const option of input.options) {
        const id = option.id?.trim() || (await this.nextOptionId(tx, input.id, option.name))
        kept.add(id)
        const values = {
          id,
          groupId: input.id,
          name: option.name.trim(),
          priceDelta: option.priceDelta,
          affectsStock: option.affectsStock,
          sort: sort++,
        }
        const [old] = await tx.select().from(modifierOptions).where(eq(modifierOptions.id, id))
        if (old) {
          if (old.groupId !== input.id) {
            throw new ConflictException(`Mã lựa chọn ${id} đang thuộc nhóm khác`)
          }
          await tx.update(modifierOptions).set(values).where(eq(modifierOptions.id, id))
        } else {
          try {
            await tx.insert(modifierOptions).values(values)
          } catch (err) {
            if (isUniqueViolation(err)) throw new ConflictException(`Mã lựa chọn ${id} đã tồn tại`)
            throw err
          }
        }
      }

      // Lựa chọn bị bỏ khỏi danh sách thì xoá — bản chụp trên đơn cũ đã đóng băng
      // tên và chênh giá nên hoá đơn cũ không đọc lại bảng này.
      const dropped = (
        await tx.select().from(modifierOptions).where(eq(modifierOptions.groupId, input.id))
      ).filter((o) => !kept.has(o.id))
      if (dropped.length > 0) {
        await tx.delete(modifierOptions).where(
          inArray(
            modifierOptions.id,
            dropped.map((o) => o.id),
          ),
        )
      }

      await this.audit.write(tx, {
        actor,
        action: existing ? 'modifier-group.updated' : 'modifier-group.created',
        entity: 'modifier_group',
        entityId: input.id,
        payload: { name: row.name, options: input.options.length, dropped: dropped.length },
      })
      await this.announce(tx, input.id)

      return { id: input.id, options: kept.size, dropped: dropped.length }
    })
  }

  /** Xoá nhóm — chặn khi còn món dùng, vì xoá là món mất câu hỏi mà không ai biết */
  async remove(id: string, actor: Actor) {
    return this.db.transaction(async (tx) => {
      const [group] = await tx.select().from(modifierGroups).where(eq(modifierGroups.id, id))
      if (!group) throw new NotFoundException('Không có nhóm này')

      const links = await tx
        .select({ dishId: dishModifierGroups.dishId })
        .from(dishModifierGroups)
        .where(eq(dishModifierGroups.groupId, id))
      if (links.length > 0) {
        throw new ConflictException(
          `Còn ${links.length} món đang dùng nhóm này — bỏ khỏi các món đó trước`,
        )
      }

      await tx.delete(modifierOptions).where(eq(modifierOptions.groupId, id))
      await tx.delete(modifierGroups).where(eq(modifierGroups.id, id))

      await this.audit.write(tx, {
        actor,
        action: 'modifier-group.deleted',
        entity: 'modifier_group',
        entityId: id,
        payload: { name: group.name },
      })
      await this.announce(tx, id)
      return { id, deleted: true }
    })
  }

  /** Món này đang hỏi khách những nhóm nào (tab Tuỳ chọn của trình sửa món) */
  async groupsOfDish(dishId: string) {
    const [dish] = await this.db.select().from(dishes).where(eq(dishes.id, dishId))
    if (!dish) throw new NotFoundException('Không có món này')

    const rows = await this.db
      .select()
      .from(dishModifierGroups)
      .where(eq(dishModifierGroups.dishId, dishId))
      .orderBy(asc(dishModifierGroups.sort))
    return { dishId, groupIds: rows.map((r) => r.groupId) }
  }

  async setDishGroups(dishId: string, groupIds: string[], actor: Actor) {
    const unique = [...new Set(groupIds)]

    return this.db.transaction(async (tx) => {
      const [dish] = await tx.select().from(dishes).where(eq(dishes.id, dishId))
      if (!dish) throw new NotFoundException('Không có món này')

      if (unique.length > 0) {
        const found = await tx
          .select({ id: modifierGroups.id })
          .from(modifierGroups)
          .where(inArray(modifierGroups.id, unique))
        if (found.length !== unique.length) throw new BadRequestException('Có nhóm không tồn tại')
      }

      await tx.delete(dishModifierGroups).where(eq(dishModifierGroups.dishId, dishId))
      if (unique.length > 0) {
        await tx.insert(dishModifierGroups).values(
          unique.map((groupId, sort) => ({ dishId, groupId, sort })),
        )
      }

      await this.audit.write(tx, {
        actor,
        action: 'dish.modifier-groups.set',
        entity: 'dish',
        entityId: dishId,
        payload: { groups: unique },
      })
      await this.announce(tx, dishId)
      return { dishId, groupIds: unique }
    })
  }

  /**
   * Mã lựa chọn sinh từ tên, có tiền tố nhóm: `yaki-them-toi-nuong`.
   *
   * Đọc được bằng mắt khi soi một dòng đơn cũ — mã ngẫu nhiên thì phải tra bảng
   * mới biết khách đã chọn gì.
   */
  private async nextOptionId(tx: Tx, groupId: string, name: string) {
    const base = `${groupId}-${slugify(name)}`.slice(0, 36) || `${groupId}-lc`
    for (let i = 0; i < 50; i++) {
      const candidate = i === 0 ? base : `${base}-${i + 1}`
      const [taken] = await tx
        .select({ id: modifierOptions.id })
        .from(modifierOptions)
        .where(eq(modifierOptions.id, candidate))
      if (!taken) return candidate
    }
    throw new ConflictException('Không sinh được mã lựa chọn — đổi tên khác giúp bạn')
  }

  /**
   * Nhóm tuỳ chọn nằm trong config bundle của mọi thiết bị, nên sửa xong phải báo
   * đúng kênh mà món dùng — POS đang mở không tự biết bảng vị vừa đổi.
   */
  private async announce(tx: Tx, entityId: string) {
    const targets = await this.db.select({ id: branches.id }).from(branches)
    for (const branch of targets) {
      await emit(tx, {
        branchId: branch.id,
        topic: 'mon.cap-nhat',
        rooms: [rooms.config(branch.id)],
        payload: { modifierGroupId: entityId },
      })
    }
  }
}

/** Bỏ dấu tiếng Việt rồi rút về chữ thường có gạch ngang */
function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'd')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}
