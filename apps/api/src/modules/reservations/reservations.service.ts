import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common'
import { rooms, WS_TOPICS } from '@sora/contracts'
import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm'
import { businessDateOf, startOfBusinessDay } from '../../common/business-date'
import { DB } from '../../common/db.module'
import { nextDisplayCode } from '../../common/display-code'
import { emit } from '../../common/outbox'
import { ParamsService } from '../../common/params.service'
import type { Tx } from '../../common/tx'
import type { Db } from '../../db/client'
import { branches, reservationHolds, reservations, tables } from '../../db/schema'
import type { Actor } from '../identity/actor'
import { hashToken, newToken } from '../identity/tokens'
import {
  buildReservationSlots,
  checkReservationSlot,
  dateOfMinute,
  minuteOf,
  occupancyMinutes,
  parseOpenHours,
  type Booking,
  type SlotRules,
} from './domain/availability'

export type SeatKind = 'standard' | 'grill' | 'private'
export const SEAT_KINDS: SeatKind[] = ['standard', 'grill', 'private']

export interface AvailabilityQuery {
  branchId: string
  /** Ngày làm việc dạng YYYY-MM-DD */
  date: string
  guestCount: number
  seatKind: SeatKind
}

export interface HoldInput extends AvailabilityQuery {
  /** Phút kể từ đầu ngày làm việc — đúng giá trị lưới trả về */
  minute: number
}

export interface ConfirmInput extends HoldInput {
  name: string
  phone: string
  note?: string | null
  /** Mã suất đang giữ mềm, nếu khách đi đúng luồng W6 */
  holdToken?: string | null
  /**
   * Ai ghi suất này. Mặc định `web`; R2 trên POS truyền `phone` khi nhân viên đặt
   * hộ qua điện thoại. Cố ý KHÔNG nhận từ thân yêu cầu của khách — nguồn là thứ
   * dùng để tính tỉ lệ no-show, để khách tự khai thì con số đó vô nghĩa.
   */
  source?: 'web' | 'phone'
}

/** Trạng thái coi là còn chiếm chỗ — huỷ và no-show thì trả suất về lưới */
const LIVE_STATUSES = ['pending', 'confirmed', 'seated', 'done']

@Injectable()
export class ReservationsService {
  constructor(
    @Inject(DB) private readonly db: Db,
    private readonly params: ParamsService,
  ) {}

  // ------------------------------------------------------------ tham số

  private async rules(branchId: string): Promise<SlotRules> {
    const p = await this.params.bundle(
      {
        'reservation.slotStepMinutes': 30,
        'reservation.mealMinutesSmall': 90,
        'reservation.mealMinutesLarge': 120,
        'reservation.turnBufferMinutes': 15,
        'reservation.leadMinutes': 60,
      },
      branchId,
    )
    return {
      stepMinutes: p['reservation.slotStepMinutes'],
      mealMinutesSmall: p['reservation.mealMinutesSmall'],
      mealMinutesLarge: p['reservation.mealMinutesLarge'],
      turnBufferMinutes: p['reservation.turnBufferMinutes'],
      leadMinutes: p['reservation.leadMinutes'],
    }
  }

  /** Chế độ xác nhận của R3: tự động, hay để nhà hàng duyệt tay */
  private async autoConfirm(branchId: string): Promise<boolean> {
    return (await this.params.get<boolean>('reservation.autoConfirm', branchId)) !== false
  }

  // ------------------------------------------------------- W6 bước 2

  /**
   * Lưới khung giờ của một ngày.
   *
   * Sức chứa đếm từ bảng bàn thật của chi nhánh: bao nhiêu chỗ đúng kiểu và đủ
   * lớn cho nhóm này. Chi nhánh chưa khai sơ đồ bàn thì `capacity` bằng 0 và mọi
   * khung đều kín — thà nói thẳng là chưa nhận đặt online còn hơn nhận rồi không
   * có bàn.
   */
  async availability(query: AvailabilityQuery) {
    const branch = await this.branch(query.branchId)
    await this.assertGuestCount(query.guestCount)
    const businessDate = await this.assertDateInHorizon(query.date, branch.timezone)

    const dayStart = startOfBusinessDay(businessDate, branch.timezone)
    const now = new Date()
    const today = businessDateOf(now, branch.timezone)

    const rules = await this.rules(query.branchId)
    const [capacity, existing] = await Promise.all([
      this.capacityFor(query.branchId, query.seatKind, query.guestCount),
      this.liveBookings(this.db, query, businessDate, dayStart),
    ])

    const slots = buildReservationSlots({
      windows: parseOpenHours((branch.openHours as { raw?: string } | null)?.raw),
      nowMinute: businessDate === today ? minuteOf(now, dayStart) : null,
      guestCount: query.guestCount,
      capacity,
      existing,
      rules,
    })

    return {
      branchId: branch.id,
      businessDate,
      seatKind: query.seatKind,
      guestCount: query.guestCount,
      capacity,
      holdMinutes: await this.params.getNumber('reservation.softHoldMinutes', 10, branch.id),
      tableHoldMinutes: await this.params.getNumber('reservation.tableHoldMinutes', 15, branch.id),
      autoConfirm: await this.autoConfirm(branch.id),
      slots: slots.map((s) => ({
        minute: s.minute,
        label: s.label,
        at: dateOfMinute(s.minute, dayStart).toISOString(),
        open: s.open,
        closedReason: s.closedReason,
      })),
    }
  }

  // ------------------------------------------------------- W6 bước 3

  /**
   * Giữ chỗ mềm trong lúc khách điền tên và số điện thoại (§23.5).
   *
   * "Hai người giành cùng suất thì người sau thấy khung xám ngay, không phải
   * điền xong mới báo lỗi" — nên suất bị trừ khỏi lưới ngay khi bước sang bước 3,
   * và tự rơi ra khi hết hạn mà không cần job dọn.
   */
  async hold(input: HoldInput) {
    const branch = await this.branch(input.branchId)
    await this.assertGuestCount(input.guestCount)
    const businessDate = await this.assertDateInHorizon(input.date, branch.timezone)
    const dayStart = startOfBusinessDay(businessDate, branch.timezone)
    const rules = await this.rules(input.branchId)
    const holdMinutes = await this.params.getNumber('reservation.softHoldMinutes', 10, branch.id)

    return this.db.transaction(async (tx) => {
      await this.lockSlotGrid(tx, input.branchId, businessDate, input.seatKind)
      await this.assertSlotOpen(tx, input, branch.timezone, businessDate, dayStart, rules)

      const token = newToken()
      const slotAt = dateOfMinute(input.minute, dayStart)
      const expiresAt = new Date(Date.now() + holdMinutes * 60_000)

      await tx.insert(reservationHolds).values({
        tokenHash: hashToken(token),
        branchId: input.branchId,
        seatKind: input.seatKind,
        guestCount: input.guestCount,
        slotAt,
        endAt: new Date(slotAt.getTime() + occupancyMinutes(input.guestCount, rules) * 60_000),
        expiresAt,
        businessDate,
      })

      return {
        token,
        expiresAt: expiresAt.toISOString(),
        holdSeconds: holdMinutes * 60,
        slotAt: slotAt.toISOString(),
      }
    })
  }

  /** Khách bấm Quay lại — trả suất về lưới ngay thay vì đợi hết mười phút */
  async releaseHold(token: string): Promise<{ released: boolean }> {
    const result = await this.db
      .delete(reservationHolds)
      .where(and(eq(reservationHolds.tokenHash, hashToken(token)), isNull(reservationHolds.reservationId)))
      .returning({ id: reservationHolds.id })
    return { released: result.length > 0 }
  }

  /**
   * Chốt đặt chỗ.
   *
   * Suất được kiểm LẠI trong transaction dù bước 2 đã tô xám khung kín: giữa lúc
   * lưới hiện ra và lúc bấm xác nhận có thể có người khác lấy mất, và không gì
   * ngăn ai đó gọi thẳng API với mốc giờ tự chế.
   */
  async confirm(input: ConfirmInput, actor?: Actor) {
    const branch = await this.branch(input.branchId)
    await this.assertGuestCount(input.guestCount)
    const businessDate = await this.assertDateInHorizon(input.date, branch.timezone)
    const dayStart = startOfBusinessDay(businessDate, branch.timezone)
    const rules = await this.rules(input.branchId)
    const auto = await this.autoConfirm(branch.id)
    const now = new Date()

    return this.db.transaction(async (tx) => {
      await this.lockSlotGrid(tx, input.branchId, businessDate, input.seatKind)

      // Suất của chính khách này không được tính là chướng ngại của chính nó
      const ownHold = input.holdToken ? await this.liveHold(tx, input.holdToken) : null
      await this.assertSlotOpen(tx, input, branch.timezone, businessDate, dayStart, rules, ownHold?.id)

      const slotAt = dateOfMinute(input.minute, dayStart)
      const endAt = new Date(slotAt.getTime() + occupancyMinutes(input.guestCount, rules) * 60_000)

      const { code } = await nextDisplayCode(tx, {
        branchId: input.branchId,
        kind: 'reservation',
        businessDate,
        at: now,
        timezone: branch.timezone,
      })

      const [created] = await tx
        .insert(reservations)
        .values({
          displayCode: code,
          branchId: input.branchId,
          seatKind: input.seatKind,
          guestCount: input.guestCount,
          slotAt,
          endAt,
          status: auto ? 'confirmed' : 'pending',
          confirmedAt: auto ? now : null,
          customerName: input.name.trim(),
          customerPhone: input.phone.trim(),
          note: input.note?.trim() || null,
          source: input.source ?? 'web',
          createdBy: actor?.kind === 'staff' ? actor.staffId : null,
          businessDate,
        })
        .returning()

      // Suất giữ mềm chuyển thành đặt chỗ thật — giữ lại dòng để không đếm hai lần
      if (ownHold) {
        await tx
          .update(reservationHolds)
          .set({ reservationId: created!.id })
          .where(eq(reservationHolds.id, ownHold.id))
      }

      /**
       * Nhà hàng phải biết ngay, không phụ thuộc việc khách có nhắn hay không
       * (§30.3). Sự kiện đi vào kênh sơ đồ bàn của chi nhánh — đúng nơi P2 vẽ
       * viền chấm brass "Đặt 19:00" và P13 đếm badge đặt bàn hôm nay.
       */
      await emit(tx, {
        branchId: input.branchId,
        topic: WS_TOPICS.reservationCreated,
        rooms: [rooms.tables(input.branchId)],
        payload: {
          reservationId: created!.id,
          displayCode: code,
          slotAt: slotAt.toISOString(),
          guestCount: input.guestCount,
          seatKind: input.seatKind,
          status: created!.status,
          customerName: created!.customerName,
        },
      })

      return {
        displayCode: code,
        status: created!.status as 'pending' | 'confirmed',
        slotAt: slotAt.toISOString(),
        businessDate,
        tableHoldMinutes: await this.params.getNumber(
          'reservation.tableHoldMinutes',
          15,
          branch.id,
        ),
      }
    })
  }

  // ------------------------------------------------------------- phụ trợ

  /**
   * Chốt cửa cho từng (chi nhánh · ngày · kiểu chỗ) trong lúc kiểm rồi ghi.
   *
   * Không có nó thì hai người bấm xác nhận cùng lúc cho suất cuối cùng đều thấy
   * "còn chỗ" rồi cùng ghi. Khoá cấp transaction nên tự nhả khi commit hoặc
   * rollback, và chỉ chặn đúng những người tranh cùng một lưới.
   */
  private async lockSlotGrid(tx: Tx, branchId: string, businessDate: string, seatKind: SeatKind) {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`${branchId}:${businessDate}:${seatKind}`}))`,
    )
  }

  private async assertSlotOpen(
    tx: Tx,
    query: HoldInput,
    timezone: string,
    businessDate: string,
    dayStart: Date,
    rules: SlotRules,
    ignoreHoldId?: number,
  ) {
    const branch = await this.branch(query.branchId)
    const now = new Date()
    const capacity = await this.capacityFor(query.branchId, query.seatKind, query.guestCount)
    const existing = await this.liveBookings(tx, query, businessDate, dayStart, ignoreHoldId)

    const slots = buildReservationSlots({
      windows: parseOpenHours((branch.openHours as { raw?: string } | null)?.raw),
      nowMinute: businessDate === businessDateOf(now, timezone) ? minuteOf(now, dayStart) : null,
      guestCount: query.guestCount,
      capacity,
      existing,
      rules,
    })

    const verdict = checkReservationSlot({ minute: query.minute, slots })
    if (!verdict.ok) throw new ConflictException({ code: verdict.code, message: verdict.message })
  }

  /** Số chỗ đúng kiểu và đủ lớn cho nhóm — bàn nhỏ hơn nhóm thì không tính */
  private async capacityFor(branchId: string, seatKind: SeatKind, guestCount: number) {
    const [row] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(tables)
      .where(
        and(
          eq(tables.branchId, branchId),
          eq(tables.kind, seatKind),
          eq(tables.active, true),
          sql`${tables.seatMax} >= ${guestCount}`,
        ),
      )
    return Number(row?.count ?? 0)
  }

  /** Đặt chỗ còn hiệu lực + suất đang giữ mềm, quy về phút kể từ đầu ngày */
  private async liveBookings(
    db: Db | Tx,
    query: AvailabilityQuery,
    businessDate: string,
    dayStart: Date,
    ignoreHoldId?: number,
  ): Promise<Booking[]> {
    const [booked, held] = await Promise.all([
      db
        .select({ slotAt: reservations.slotAt, endAt: reservations.endAt })
        .from(reservations)
        .where(
          and(
            eq(reservations.branchId, query.branchId),
            eq(reservations.businessDate, businessDate),
            eq(reservations.seatKind, query.seatKind),
            inArray(reservations.status, LIVE_STATUSES),
          ),
        ),
      db
        .select({
          id: reservationHolds.id,
          slotAt: reservationHolds.slotAt,
          endAt: reservationHolds.endAt,
        })
        .from(reservationHolds)
        .where(
          and(
            eq(reservationHolds.branchId, query.branchId),
            eq(reservationHolds.businessDate, businessDate),
            eq(reservationHolds.seatKind, query.seatKind),
            // Suất đã thành đặt chỗ thật đếm ở vế trên rồi
            isNull(reservationHolds.reservationId),
            gt(reservationHolds.expiresAt, new Date()),
          ),
        ),
    ])

    return [...booked, ...held.filter((h) => h.id !== ignoreHoldId)].map((b) => ({
      startMinute: minuteOf(b.slotAt, dayStart),
      endMinute: minuteOf(b.endAt, dayStart),
    }))
  }

  private async liveHold(tx: Tx, token: string) {
    const [hold] = await tx
      .select()
      .from(reservationHolds)
      .where(
        and(
          eq(reservationHolds.tokenHash, hashToken(token)),
          isNull(reservationHolds.reservationId),
          gt(reservationHolds.expiresAt, new Date()),
        ),
      )
    return hold ?? null
  }

  /**
   * Nhóm đông hơn trần đặt online thì mời gọi điện.
   *
   * Bàn ghép cho mười hai người là việc phải nhìn sơ đồ mới xếp được — hứa qua
   * web rồi tối đó không ghép nổi là hỏng cả bữa của khách.
   */
  private async assertGuestCount(guestCount: number) {
    const max = await this.params.getNumber('reservation.maxGuestsOnline', 10)
    if (!Number.isInteger(guestCount) || guestCount < 1) {
      throw new BadRequestException('Số khách không hợp lệ')
    }
    if (guestCount > max) {
      throw new BadRequestException({
        code: 'party_too_large',
        message: `Nhóm trên ${max} khách nhờ bạn gọi trực tiếp chi nhánh để chúng tôi ghép bàn`,
      })
    }
  }

  /**
   * Chỉ nhận đặt trong tầm nhìn đã cấu hình.
   *
   * Nhận đặt cho ngày cách đây một tuần hay cách đây một năm đều là dữ liệu rác:
   * ngày quá khứ không phục vụ được, còn quá xa thì thực đơn và giá đã khác.
   */
  private async assertDateInHorizon(date: string, timezone: string): Promise<string> {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new BadRequestException('Ngày không hợp lệ')

    const now = new Date()
    const today = businessDateOf(now, timezone)
    if (date < today) throw new BadRequestException('Ngày đã qua')

    const horizonDays = await this.params.getNumber('reservation.horizonDays', 30)
    const last = businessDateOf(new Date(now.getTime() + horizonDays * 86_400_000), timezone)
    if (date > last) {
      throw new BadRequestException(`Chúng tôi nhận đặt trước tối đa ${horizonDays} ngày`)
    }
    return date
  }

  private async branch(branchId: string) {
    const [branch] = await this.db.select().from(branches).where(eq(branches.id, branchId))
    if (!branch) throw new NotFoundException(`Không có chi nhánh ${branchId}`)
    return branch
  }
}
