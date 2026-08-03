/**
 * Nghiệm thu GĐ3 — đặt bàn trên web (W6).
 *
 * Kịch bản: khách xem lưới khung giờ theo sức chứa thật → giữ mềm một suất →
 * người thứ hai giữ nốt suất cuối → người thứ ba thấy khung xám ngay chứ không
 * điền xong mới bị từ chối → khách đầu chốt và nhận mã đặt chỗ.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { eq } from 'drizzle-orm'
import { businessDateOf } from '../common/business-date'
import { ParamsService } from '../common/params.service'
import type { Db } from '../db/client'
import { branches, outboxEvents, reservationBlockedDays } from '../db/schema'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const HANOI = 'Asia/Ho_Chi_Minh'
/** Ngày mai: tránh mọi khung bị đóng vì "đã qua" hay "quá gần" khi test chạy buổi tối */
const TOMORROW = businessDateOf(new Date(Date.now() + 86_400_000), HANOI)
const DAY_AFTER = businessDateOf(new Date(Date.now() + 2 * 86_400_000), HANOI)
const IN_THREE_DAYS = businessDateOf(new Date(Date.now() + 3 * 86_400_000), HANOI)
const AT_1700 = 17 * 60

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)

const availability = async (guests: number, seat: string, date = TOMORROW) => {
  const res = await inject({
    method: 'GET',
    url: `/api/reservations/availability?branch=${fx.branchId}&date=${date}&guests=${guests}&seat=${seat}`,
  })
  return { status: res.statusCode, body: res.json() }
}

const hold = (guests: number, seat: string, minute = AT_1700) =>
  inject({
    method: 'POST',
    url: '/api/reservations/holds',
    payload: {
      branchId: fx.branchId,
      date: TOMORROW,
      guestCount: guests,
      seatKind: seat,
      minute,
    },
  })

const confirm = (body: Record<string, unknown>) =>
  inject({
    method: 'POST',
    url: '/api/reservations',
    payload: {
      branchId: fx.branchId,
      date: TOMORROW,
      guestCount: 4,
      seatKind: 'grill',
      minute: AT_1700,
      name: 'Nguyễn Minh',
      phone: '0912 345 678',
      ...body,
    },
  })

beforeAll(async () => {
  const booted = await bootTestApp()
  app = booted.app
  db = booted.db
  fx = booted.fixtures
  close = booted.close

  // Giờ mở cửa là nguồn duy nhất dựng lưới khung giờ (A10 → W6)
  await db
    .update(branches)
    .set({ openHours: { raw: '11:00–14:00 · 17:00–23:00' } })
    .where(eq(branches.id, fx.branchId))
})

afterAll(async () => {
  await close()
})

describe('W6 bước 2 — lưới khung giờ theo sức chứa thật', () => {
  it('trải đúng hai ca mở cửa và dừng trước giờ đóng', async () => {
    const { status, body } = await availability(4, 'grill')
    expect(status).toBe(200)

    const labels = body.slots.map((s: { label: string }) => s.label)
    expect(labels).toContain('11:00')
    expect(labels).toContain('17:00')
    // Nhóm 4 ăn 120 phút: ca trưa đóng 14:00 nên suất cuối là 12:00
    expect(labels).not.toContain('12:30')
    expect(labels.at(-1)).toBe('21:00')
  })

  it('sức chứa đếm từ bàn thật của chi nhánh', async () => {
    // Fixture có hai bàn nướng 6 chỗ và một bàn thường 4 chỗ
    expect((await availability(4, 'grill')).body.capacity).toBe(2)
    expect((await availability(4, 'standard')).body.capacity).toBe(1)
    // Không bàn nướng nào chứa nổi 8 khách
    expect((await availability(8, 'grill')).body.capacity).toBe(0)
  })

  it('chi nhánh không có phòng riêng thì mọi khung đều kín', async () => {
    const { body } = await availability(4, 'private')
    expect(body.capacity).toBe(0)
    expect(body.slots.every((s: { open: boolean }) => !s.open)).toBe(true)
  })
})

describe('W6 bước 3 — giữ chỗ mềm', () => {
  let firstToken: string
  let secondToken: string

  it('giữ suất và trả về đồng hồ đếm ngược', async () => {
    const res = await hold(4, 'grill')
    expect(res.statusCode).toBe(201)
    const body = res.json()
    firstToken = body.token
    expect(body.holdSeconds).toBe(600)
    expect(new Date(body.expiresAt).getTime()).toBeGreaterThan(Date.now())
  })

  it('suất đang giữ bị trừ khỏi lưới ngay, không đợi khách điền xong', async () => {
    const { body } = await availability(4, 'grill')
    const slot = body.slots.find((s: { label: string }) => s.label === '17:00')
    // Còn một bàn nướng nữa nên khung vẫn nhận được
    expect(slot.open).toBe(true)

    const res = await hold(4, 'grill')
    expect(res.statusCode).toBe(201)
    secondToken = res.json().token

    const after = await availability(4, 'grill')
    const now1700 = after.body.slots.find((s: { label: string }) => s.label === '17:00')
    expect(now1700.open).toBe(false)
    expect(now1700.closedReason).toBe('full')
  })

  it('khung sau còn chồng lấn cũng kín theo, khung đã dọn xong thì mở lại', async () => {
    const { body } = await availability(4, 'grill')
    const label = (l: string) => body.slots.find((s: { label: string }) => s.label === l)
    // 17:00 + 120 phút ăn + 15 phút dọn = 19:15
    expect(label('19:00').open).toBe(false)
    expect(label('19:30').open).toBe(true)
  })

  it('người đến sau bị từ chối ngay ở bước giữ chỗ', async () => {
    const res = await hold(4, 'grill')
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('full')
  })

  it('nhả suất thì khung trở lại lưới', async () => {
    const res = await inject({
      method: 'DELETE',
      url: `/api/reservations/holds/${secondToken}`,
    })
    expect(res.statusCode).toBe(200)
    expect(res.json().released).toBe(true)

    const { body } = await availability(4, 'grill')
    expect(body.slots.find((s: { label: string }) => s.label === '17:00').open).toBe(true)
  })

  it('chốt đặt chỗ bằng suất đang giữ của chính mình', async () => {
    const res = await confirm({ holdToken: firstToken, note: 'Sinh nhật, cần nến' })
    expect(res.statusCode).toBe(201)
    const body = res.json()
    expect(body.displayCode).toMatch(/^DB-\d{4}-\d{4}$/)
    expect(body.status).toBe('confirmed')
    expect(body.tableHoldMinutes).toBe(15)
  })

  it('nhà hàng nhận được sự kiện ngay, không phụ thuộc khách có nhắn hay không', async () => {
    const events = await db
      .select()
      .from(outboxEvents)
      .where(eq(outboxEvents.topic, 'reservation.created'))
    expect(events).toHaveLength(1)
    expect(events[0]!.rooms).toContain(`branch:${fx.branchId}:tables`)
    expect((events[0]!.payload as { guestCount: number }).guestCount).toBe(4)
  })

  it('suất đã chốt vẫn chiếm chỗ — người tiếp theo chỉ còn một bàn', async () => {
    const first = await hold(4, 'grill')
    expect(first.statusCode).toBe(201)

    const second = await hold(4, 'grill')
    expect(second.statusCode).toBe(409)
  })
})

describe('W6 — những gì phải chặn ở máy chủ', () => {
  it('từ chối khung đã kín dù khách gọi thẳng API', async () => {
    const res = await confirm({})
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('full')
  })

  it('từ chối mốc giờ không có trong lưới', async () => {
    const res = await confirm({ minute: 3 * 60 })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('outside-hours')
  })

  it('nói rõ khi không có chỗ nào đủ sức chứa', async () => {
    const res = await confirm({ seatKind: 'private' })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('no-seat')
  })

  it('nhóm quá đông thì mời gọi trực tiếp', async () => {
    const res = await confirm({ guestCount: 20 })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('party_too_large')
  })

  it('không nhận đặt cho ngày đã qua', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reservations/availability?branch=${fx.branchId}&date=2020-01-01&guests=2&seat=grill`,
    })
    expect(res.statusCode).toBe(400)
  })

  it('số điện thoại phải là số', async () => {
    const res = await confirm({ phone: 'gọi cho tôi nhé' })
    expect(res.statusCode).toBe(400)
  })
})

describe('R3 — cấu hình nhận đặt có hệ quả thật', () => {
  const params = () => app.get(ParamsService)

  afterAll(async () => {
    await params().set('reservation.slotCapGrill', 0, { branchId: fx.branchId })
    await params().set('reservation.depositGrillVnd', 0, { branchId: fx.branchId })
    await db.delete(reservationBlockedDays)
  })

  it('ngày bị chặn thì cả lưới xám kèm lý do, và API vẫn chặn nếu gọi thẳng', async () => {
    await db
      .insert(reservationBlockedDays)
      .values({ branchId: fx.branchId, day: IN_THREE_DAYS, reason: 'Tiệc công ty bao trọn quán' })

    const { body } = await availability(2, 'grill', IN_THREE_DAYS)
    expect(body.blocked.reason).toBe('Tiệc công ty bao trọn quán')
    expect(body.slots.every((s: { open: boolean }) => !s.open)).toBe(true)
    expect(body.slots[0].closedReason).toBe('blocked')

    const res = await inject({
      method: 'POST',
      url: '/api/reservations/holds',
      payload: {
        branchId: fx.branchId,
        date: IN_THREE_DAYS,
        guestCount: 2,
        seatKind: 'grill',
        minute: AT_1700,
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('blocked_day')

    await db.delete(reservationBlockedDays)
  })

  it('trần suất mỗi khung cắt bớt sức chứa dù bàn còn trống', async () => {
    // Fixture có hai bàn nướng; trần 1 nghĩa là mỗi khung chỉ nhận một suất
    await params().set('reservation.slotCapGrill', 1, { branchId: fx.branchId })
    const { body } = await availability(2, 'grill', IN_THREE_DAYS)
    expect(body.capacity).toBe(1)

    await params().set('reservation.slotCapGrill', 0, { branchId: fx.branchId })
    expect((await availability(2, 'grill', IN_THREE_DAYS)).body.capacity).toBe(2)
  })

  it('kiểu chỗ có cọc thì suất nằm chờ, dù chi nhánh đang tự động xác nhận', async () => {
    await params().set('reservation.depositGrillVnd', 300_000, { branchId: fx.branchId })
    expect((await availability(2, 'grill', IN_THREE_DAYS)).body.depositVnd).toBe(300_000)

    const res = await confirm({
      date: IN_THREE_DAYS,
      minute: AT_1700,
      guestCount: 2,
      name: 'Anh Vũ',
      phone: '0977 444 555',
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().status).toBe('pending')
    expect(res.json().depositVnd).toBe(300_000)
  })
})

describe('Mã đặt chỗ — hai suất khác ngày ăn không được trùng mã', () => {
  /**
   * Ngày làm việc của một suất là ngày khách ĐẾN ĂN, không phải ngày đặt. Đếm số
   * theo ngày ăn mà in `yyMM` lên mã thì hai người cùng đặt hôm nay cho hai tối
   * khác nhau đều nhận `DB-2608-0001` — người thứ hai đâm vào ràng buộc duy nhất
   * và W6 trả 500 ngay lúc khách bấm xác nhận.
   */
  it('cùng ngày đặt, khác ngày ăn, vẫn ra hai mã khác nhau', async () => {
    const first = await confirm({
      minute: 11 * 60,
      guestCount: 2,
      name: 'Anh Đức',
      phone: '0906 222 333',
    })
    const second = await confirm({
      date: DAY_AFTER,
      minute: 11 * 60,
      guestCount: 2,
      name: 'Anh Đức',
      phone: '0906 222 333',
    })

    expect(first.statusCode, first.payload).toBe(201)
    expect(second.statusCode, second.payload).toBe(201)
    expect(second.json().displayCode).not.toBe(first.json().displayCode)
  })
})

describe('R4 — khách mở lại suất bằng liên kết nhắc hẹn', () => {
  let token: string
  let code: string

  it('chốt xong thì khách cầm luôn chìa mở lại suất của mình', async () => {
    const res = await confirm({
      minute: 11 * 60,
      guestCount: 2,
      seatKind: 'standard',
      name: 'Chị Lan',
      phone: '0906 111 222',
    })
    expect(res.statusCode, res.payload).toBe(201)
    token = res.json().guestToken
    code = res.json().displayCode
    expect(token).toHaveLength(22)
  })

  it('liên kết mở đúng suất đó mà không cần đăng nhập', async () => {
    const res = await inject({ method: 'GET', url: `/api/reservations/track/${token}` })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.displayCode).toBe(code)
    expect(body.customerName).toBe('Chị Lan')
    expect(body.branchName).toBeTruthy()
    expect(body.guestConfirmedAt).toBeNull()
  })

  it('một chạm là xác nhận lại — bấm lần nữa chỉ dời dấu thời gian, không báo lỗi', async () => {
    const first = await inject({
      method: 'POST',
      url: `/api/reservations/track/${token}/confirm`,
    })
    expect(first.statusCode).toBe(201)
    expect(first.json().guestConfirmedAt).toBeTruthy()
    // Quyền nhận hay không vẫn là của quán: một chạm không tự duyệt suất
    expect(first.json().status).toBe('confirmed')

    const again = await inject({
      method: 'POST',
      url: `/api/reservations/track/${token}/confirm`,
    })
    expect(again.statusCode).toBe(201)
    expect(new Date(again.json().guestConfirmedAt).getTime()).toBeGreaterThanOrEqual(
      new Date(first.json().guestConfirmedAt).getTime(),
    )
  })

  it('chìa sai thì không mở suất nào', async () => {
    const res = await inject({ method: 'GET', url: '/api/reservations/track/khong-co-that' })
    expect(res.statusCode).toBe(404)
  })
})
