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
import type { Db } from '../db/client'
import { branches, outboxEvents } from '../db/schema'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const HANOI = 'Asia/Ho_Chi_Minh'
/** Ngày mai: tránh mọi khung bị đóng vì "đã qua" hay "quá gần" khi test chạy buổi tối */
const TOMORROW = businessDateOf(new Date(Date.now() + 86_400_000), HANOI)
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
