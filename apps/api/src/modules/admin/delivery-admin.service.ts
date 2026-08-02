import { BadRequestException, ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common'
import { and, asc, eq } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import { branches, deliveryZones } from '../../db/schema'
import { foldWard } from '../../common/ward'
import type { Actor } from '../identity/actor'
import { AuditService } from '../identity/audit.service'

export interface ZoneInput {
  branchId: string
  name: string
  wards: string[]
  feeVnd: number
  minOrderVnd: number
  etaMinutes: number
  active: boolean
  sort: number
}

/**
 * O10 — Vùng giao & phí.
 *
 * Vùng giao khớp theo TÊN PHƯỜNG chứ không theo đa giác trên bản đồ: đó là thứ
 * khách gõ ở O1 và là thứ `OnlineService.quote` đối chiếu. Nên ràng buộc quan
 * trọng nhất ở đây là một phường không được nằm trong hai vùng — nếu không,
 * khách nhập địa chỉ đó sẽ nhận lỗi "vùng chồng nhau" ngay giữa lúc đặt món, và
 * lỗi đó chỉ lộ ra ở phía khách.
 */
@Injectable()
export class DeliveryAdminService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async list(branchId: string) {
    const rows = await this.db
      .select()
      .from(deliveryZones)
      .where(eq(deliveryZones.branchId, branchId))
      .orderBy(asc(deliveryZones.sort), asc(deliveryZones.id))
    return rows
  }

  async create(input: ZoneInput, actor: Actor) {
    await this.assertZone(input, null)
    const [row] = await this.db.insert(deliveryZones).values(this.clean(input)).returning()
    await this.write(actor, 'delivery-zone.created', row!.id, { name: row!.name })
    return row!
  }

  async update(id: number, input: Partial<ZoneInput>, actor: Actor) {
    const [current] = await this.db.select().from(deliveryZones).where(eq(deliveryZones.id, id))
    if (!current) throw new NotFoundException('Không có vùng giao này')

    const next = { ...current, ...input } as ZoneInput
    await this.assertZone(next, id)

    const [row] = await this.db
      .update(deliveryZones)
      .set(this.clean(next))
      .where(eq(deliveryZones.id, id))
      .returning()
    await this.write(actor, 'delivery-zone.updated', id, { ...input })
    return row!
  }

  /**
   * Xoá hẳn vùng.
   *
   * Khác với bàn: vùng giao không bị dòng đơn nào tham chiếu — đơn chỉ chụp lại
   * TÊN vùng và phí vào `customer.zone` lúc đặt. Nên xoá ở đây không cắt mất
   * đường truy ngược của đơn cũ.
   */
  async remove(id: number, actor: Actor) {
    const deleted = await this.db
      .delete(deliveryZones)
      .where(eq(deliveryZones.id, id))
      .returning({ name: deliveryZones.name })
    if (deleted.length === 0) throw new NotFoundException('Không có vùng giao này')
    await this.write(actor, 'delivery-zone.deleted', id, { name: deleted[0]!.name })
    return { id, deleted: true }
  }

  // ---------------------------------------------------------------- phụ trợ

  private clean(input: ZoneInput) {
    return {
      branchId: input.branchId,
      name: input.name.trim(),
      // Giữ NGUYÊN chữ người nhập — so khớp là việc của `wardMatches` lúc tra
      wards: input.wards.map((w) => w.trim()).filter(Boolean),
      feeVnd: input.feeVnd,
      minOrderVnd: input.minOrderVnd,
      etaMinutes: input.etaMinutes,
      active: input.active,
      sort: input.sort,
    }
  }

  private async assertZone(input: ZoneInput, ignoreId: number | null) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, input.branchId))
    if (!branch) throw new NotFoundException('Không có chi nhánh này')

    const wards = input.wards.map((w) => w.trim()).filter(Boolean)
    if (wards.length === 0) throw new BadRequestException('Vùng giao phải có ít nhất một phường')
    if (input.feeVnd < 0 || input.minOrderVnd < 0) {
      throw new BadRequestException('Phí giao và đơn tối thiểu không nhận số âm')
    }
    if (input.etaMinutes <= 0) throw new BadRequestException('Thời gian giao dự kiến phải lớn hơn 0')

    const folded = wards.map(foldWard)
    const duplicate = wards.find((_, i) => folded.indexOf(folded[i]!) !== i)
    if (duplicate) throw new BadRequestException(`Phường "${duplicate}" bị nhập hai lần trong vùng`)

    const others = (
      await this.db
        .select()
        .from(deliveryZones)
        .where(and(eq(deliveryZones.branchId, input.branchId), eq(deliveryZones.active, true)))
    ).filter((z) => z.id !== ignoreId)

    for (const other of others) {
      const clash = wards.find((w) =>
        other.wards.some((existing) => foldWard(existing) === foldWard(w)),
      )
      if (clash && input.active) {
        throw new ConflictException({
          code: 'ward_in_two_zones',
          message: `Phường "${clash}" đã nằm trong vùng "${other.name}" — một phường chỉ thuộc một vùng, nếu không khách nhập địa chỉ đó sẽ bị chặn`,
        })
      }
    }
  }

  private async write(actor: Actor, action: string, id: number, payload: Record<string, unknown>) {
    await this.db.transaction(async (tx) => {
      await this.audit.write(tx, {
        actor,
        action,
        entity: 'delivery_zone',
        entityId: String(id),
        payload,
      })
    })
  }
}
