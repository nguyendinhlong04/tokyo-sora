import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { formatVnd, rooms } from '@sora/contracts'
import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { businessDateOf, startOfBusinessDay } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { nextDisplayCode } from '../../common/display-code'
import { emit } from '../../common/outbox'
import { ParamsService } from '../../common/params.service'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import { branches, deliveryZones, dishes, orderLines, orders } from '../../db/schema'
import type { Actor } from '../identity/actor'
import { hashToken, newToken } from '../identity/tokens'
import { OrderingService, type AddLineInput } from '../ordering/ordering.service'
import { buildSlots, checkSlot, earliestOpenSlot, slotStart, type SlotOptions } from './domain/slots'

export type OnlineOrderType = 'takeaway' | 'delivery'

export interface OnlineCustomer {
  name: string
  phone: string
  /** Chỉ đơn giao hàng */
  address?: string | null
  ward?: string | null
  note?: string | null
}

export interface CreateOnlineOrderInput {
  branchId: string
  type: OnlineOrderType
  customer: OnlineCustomer
  lines: AddLineInput[]
  slotMode: 'asap' | 'scheduled'
  /** ISO của khung giờ khách chọn, chỉ với `scheduled` */
  slotAt?: string | null
  channel?: 'web' | 'grab' | 'shopee' | 'be'
}

/** Bỏ dấu và hạ chữ để "Phường Dịch Vọng" khớp "dich vong" trong bảng vùng giao */
function foldWard(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .replaceAll('đ', 'd')
    .replaceAll('Đ', 'D')
    .toLowerCase()
    .replace(/\b(phuong|xa|thi tran|quan|huyen)\b/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

@Injectable()
export class OnlineService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
    private readonly ordering: OrderingService,
  ) {}

  // --------------------------------------------------------- O1 vùng giao

  /** Danh sách vùng giao đang bật — màn O1 đổ vào ô chọn phường */
  async zones(branchId: string) {
    const rows = await this.db
      .select()
      .from(deliveryZones)
      .where(and(eq(deliveryZones.branchId, branchId), eq(deliveryZones.active, true)))
      .orderBy(asc(deliveryZones.sort))

    return rows.map((z) => ({
      id: z.id,
      name: z.name,
      wards: z.wards,
      feeVnd: z.feeVnd,
      minOrderVnd: z.minOrderVnd,
      etaMinutes: z.etaMinutes,
    }))
  }

  /**
   * Phí giao cho một địa chỉ (O1 "kiểm tra vùng, hiện phí + thời gian").
   *
   * Ngoài vùng thì trả lời DỨT KHOÁT là không giao, kèm danh sách vùng đang giao
   * — để khách biết ngay chứ không phải điền hết giỏ hàng rồi mới bị chặn.
   */
  async quote(branchId: string, ward: string) {
    const matches = (await this.zones(branchId)).filter((z) =>
      z.wards.some((w) => foldWard(w) === foldWard(ward)),
    )

    if (matches.length > 1) {
      throw new ConflictException({
        code: 'zone_overlap',
        message: `Phường "${ward}" đang nằm trong ${matches.length} vùng giao — cấu hình vùng bị chồng nhau`,
      })
    }

    const zone = matches[0]
    if (!zone) {
      return {
        inZone: false as const,
        zones: (await this.zones(branchId)).map((z) => ({ name: z.name, wards: z.wards })),
      }
    }

    return {
      inZone: true as const,
      zone: { id: zone.id, name: zone.name },
      feeVnd: zone.feeVnd,
      minOrderVnd: zone.minOrderVnd,
      etaMinutes: zone.etaMinutes,
    }
  }

  // ------------------------------------------------------- O4 khung giờ

  private async slotOptions(branchId: string): Promise<SlotOptions> {
    return {
      openMinute: await this.params.getNumber('online.openMinute', 10 * 60, branchId),
      lastOrderMinute: await this.params.getNumber('online.lastOrderMinute', 21 * 60, branchId),
      leadMinutes: await this.params.getNumber('online.leadMinutes', 30, branchId),
      capacity: await this.params.getNumber('online.slotCapacity', 6, branchId),
    }
  }

  /** Số đơn đã nhận theo từng khung của một ngày làm việc */
  private async takenBySlot(db: Db | Tx, branchId: string, businessDate: string) {
    const rows = await db
      .select({ slotAt: orders.slotAt, count: sql<number>`count(*)::int` })
      .from(orders)
      .where(
        and(
          eq(orders.branchId, branchId),
          eq(orders.businessDate, businessDate),
          sql`${orders.slotAt} IS NOT NULL`,
          sql`${orders.status} <> 'cancelled'`,
        ),
      )
      .groupBy(orders.slotAt)

    return new Map(rows.map((r) => [r.slotAt!.toISOString(), Number(r.count)]))
  }

  async slots(branchId: string, at: Date = new Date()) {
    const branch = await this.branch(branchId)
    const businessDate = businessDateOf(at, branch.timezone)
    const dayStart = startOfBusinessDay(businessDate, branch.timezone)

    const slots = buildSlots({
      now: at,
      dayStart,
      takenBySlot: await this.takenBySlot(this.db, branchId, businessDate),
      options: await this.slotOptions(branchId),
    })

    return { businessDate, slots }
  }

  // --------------------------------------------------------- O6 đặt đơn

  /**
   * Tạo đơn online.
   *
   * Mọi con số quyết định tiền đều tính LẠI ở đây từ danh mục và bảng vùng giao —
   * giá, phí ship, khung giờ. Thứ khách gửi lên chỉ là ý định: món nào, mấy phần,
   * giao đi đâu, hẹn lúc nào.
   */
  async create(input: CreateOnlineOrderInput, actor: Actor) {
    if (input.lines.length === 0) throw new BadRequestException('Chưa chọn món nào')

    const branch = await this.branch(input.branchId)
    const now = new Date()
    const businessDate = businessDateOf(now, branch.timezone)
    const dayStart = startOfBusinessDay(businessDate, branch.timezone)
    const options = await this.slotOptions(input.branchId)

    await this.assertOnlineSellable(input.lines.map((l) => l.dishId))

    // Phí giao chốt TRƯỚC khi tạo đơn: đơn giao mà không biết phí thì không có
    // con số nào để khách xác nhận.
    let ship = 0
    let zoneName: string | null = null
    let etaMinutes = 0
    let minOrder = 0

    /**
     * Vùng giao và phí ship chỉ áp cho đơn của CHÍNH quán.
     *
     * GrabFood/ShopeeFood/Be tự lo giao và tự thu phí của khách; nhân viên nhập
     * tay đơn của họ vào đây chỉ để bếp có một hàng đợi duy nhất (§23.3). Bắt họ
     * điền phường theo bảng vùng của quán là bắt nhập một thứ không dùng vào đâu.
     */
    if (input.type === 'delivery' && (input.channel ?? 'web') === 'web') {
      const ward = input.customer.ward?.trim()
      if (!ward || !input.customer.address?.trim()) {
        throw new BadRequestException('Đơn giao hàng cần địa chỉ và phường/xã')
      }
      const quote = await this.quote(input.branchId, ward)
      if (!quote.inZone) {
        throw new BadRequestException({
          code: 'out_of_zone',
          message: 'Địa chỉ nằm ngoài vùng giao của chi nhánh',
        })
      }
      ship = quote.feeVnd
      zoneName = quote.zone.name
      etaMinutes = quote.etaMinutes
      minOrder = quote.minOrderVnd
    }

    return this.db.transaction(async (tx) => {
      const taken = await this.takenBySlot(tx, input.branchId, businessDate)

      const slotAt = this.resolveSlot({
        input,
        now,
        dayStart,
        taken,
        options,
      })

      const { code } = await nextDisplayCode(tx, {
        branchId: input.branchId,
        kind: 'order',
        businessDate,
        at: now,
        timezone: branch.timezone,
      })

      const trackToken = newToken()
      const [created] = await tx
        .insert(orders)
        .values({
          displayCode: code,
          branchId: input.branchId,
          channel: input.channel ?? 'web',
          type: input.type,
          status: 'new',
          customer: {
            name: input.customer.name,
            phone: input.customer.phone,
            address: input.customer.address ?? null,
            ward: input.customer.ward ?? null,
            note: input.customer.note ?? null,
            zone: zoneName,
            etaMinutes,
          },
          slotMode: input.slotMode,
          slotAt,
          moneyShip: ship,
          trackTokenHash: hashToken(trackToken),
          createdByKind: actor.kind === 'staff' ? 'staff' : 'customer',
          createdById: actor.kind === 'staff' ? String(actor.staffId) : null,
          businessDate,
        })
        .returning()

      await this.ordering.appendLines(tx, {
        order: created!,
        branchId: input.branchId,
        inputs: input.lines,
        actor,
      })

      const money = await this.ordering.recomputeTotals(tx, created!.id, input.branchId)

      // Kiểm sau khi tính tiền: đơn tối thiểu so trên tiền MÓN, chưa gồm phí ship
      if (money.sub < minOrder) {
        throw new BadRequestException({
          code: 'below_min_order',
          message: `Vùng ${zoneName} nhận đơn từ ${formatVnd(minOrder)} trở lên`,
        })
      }

      await emit(tx, {
        branchId: input.branchId,
        topic: 'order.created',
        rooms: [rooms.orders(input.branchId)],
        payload: {
          orderId: created!.id,
          displayCode: code,
          channel: created!.channel,
          type: input.type,
          slotAt,
          money,
        },
      })

      return {
        id: created!.id,
        displayCode: code,
        trackToken,
        slotAt,
        etaMinutes,
        money,
      }
    })
  }

  /** Đơn "nhận ngay" lấy khung mở sớm nhất; đơn hẹn giờ kiểm đúng khung khách chọn */
  private resolveSlot(ctx: {
    input: CreateOnlineOrderInput
    now: Date
    dayStart: Date
    taken: ReadonlyMap<string, number>
    options: SlotOptions
  }): Date {
    const { input, now, dayStart, taken, options } = ctx

    if (input.slotMode === 'asap') {
      const slots = buildSlots({ now, dayStart, takenBySlot: taken, options })
      const first = earliestOpenSlot(slots)
      if (!first) {
        throw new ConflictException({
          code: 'no_slot',
          message: 'Hôm nay bếp đã kín lịch — nhờ bạn chọn ngày khác hoặc gọi trực tiếp',
        })
      }
      return first.at
    }

    if (!input.slotAt) throw new BadRequestException('Đơn hẹn giờ phải chọn khung giờ')
    const slotAt = new Date(input.slotAt)
    if (Number.isNaN(slotAt.getTime())) throw new BadRequestException('Giờ hẹn không hợp lệ')

    const result = checkSlot({
      slotAt,
      now,
      dayStart,
      taken: taken.get(slotStart(slotAt, dayStart).toISOString()) ?? 0,
      options,
    })
    if (!result.ok) throw new ConflictException({ code: result.code, message: result.message })
    return slotAt
  }

  /**
   * Món phải được bật "bán online" mới nhận đơn.
   *
   * Danh mục có 78 món nhưng chỉ ~40 món bán online (§23.1): món dễ nguội, món
   * phải nướng tại bàn thì mang về là hỏng trải nghiệm.
   */
  private async assertOnlineSellable(dishIds: string[]) {
    const rows = await this.db
      .select({ id: dishes.id, nameVi: dishes.nameVi, onlineVisible: dishes.onlineVisible })
      .from(dishes)
      .where(inArray(dishes.id, [...new Set(dishIds)]))

    const offline = rows.filter((r) => !r.onlineVisible)
    if (offline.length > 0) {
      throw new BadRequestException({
        code: 'not_online_sellable',
        message: `Món chỉ phục vụ tại quán: ${offline.map((o) => o.nameVi).join(', ')}`,
      })
    }
  }

  // ---------------------------------------------------- O7 theo dõi đơn

  /**
   * Khách xem đơn của mình bằng mã theo dõi.
   *
   * Không có tài khoản, cũng không tra theo mã đơn: mã đơn ngắn và đoán được
   * (ON-2608-0417 thì 0418 là đơn của người khác). Mã theo dõi là chuỗi ngẫu
   * nhiên, chỉ giữ bản băm trong CSDL.
   */
  async orderIdOfTrackToken(token: string) {
    const [order] = await this.db
      .select({ id: orders.id, branchId: orders.branchId })
      .from(orders)
      .where(eq(orders.trackTokenHash, hashToken(token)))
    if (!order) throw new NotFoundException('Không tìm thấy đơn với mã theo dõi này')
    return order
  }

  async track(token: string) {
    const [order] = await this.db
      .select()
      .from(orders)
      .where(eq(orders.trackTokenHash, hashToken(token)))
    if (!order) throw new NotFoundException('Không tìm thấy đơn với mã theo dõi này')

    const lines = await this.db
      .select()
      .from(orderLines)
      .where(and(eq(orderLines.orderId, order.id), sql`${orderLines.parentLineId} IS NULL`))
      .orderBy(asc(orderLines.id))

    const customer = (order.customer ?? {}) as Record<string, unknown>
    return {
      displayCode: order.displayCode,
      status: order.status,
      type: order.type,
      paymentState: order.paymentState,
      slotMode: order.slotMode,
      slotAt: order.slotAt,
      etaMinutes: typeof customer.etaMinutes === 'number' ? customer.etaMinutes : 0,
      money: {
        sub: order.moneySub,
        vat: order.moneyVat,
        ship: order.moneyShip,
        total: order.moneyTotal,
      },
      lines: lines.map((l) => ({
        nameSnapshot: l.nameSnapshot,
        qty: l.qty,
        priceTotal: l.priceTotal,
        state: l.state,
      })),
      // Đơn đã huỷ phải nói vì sao — khách không phải gọi điện hỏi
      cancelReason: order.cancelReason,
    }
  }

  private async branch(branchId: string) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return branch
  }
}
