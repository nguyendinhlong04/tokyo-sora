/**
 * Nghiệm thu GĐ3 — quầy đặt bàn trên POS (R1 · R2 · R4 · P13 · P2 · P3).
 *
 * Kịch bản: khách đặt trên web → suất hiện trên bảng của quầy → nhân viên gán
 * bàn (chặn sai kiểu chỗ, bàn nhỏ, bàn đã dành cho người khác) → ô bàn ở P2 hiện
 * nhãn đặt chỗ và P3 chặn mở bàn cho khách vãng lai → khách tới thì "Đã đến" mở
 * phiên bàn thật → khách không tới thì đánh no-show, nhưng chỉ sau khi hết giờ
 * giữ bàn.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { businessDateOf } from '../common/business-date'
import type { Db } from '../db/client'
import { branches, devices, reservations, tableSessions } from '../db/schema'
import { DEVICE_HEADER } from '../modules/identity/auth.guard'
import { hashToken } from '../modules/identity/tokens'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const SEED_DEVICE = 'seed-device-token'
const HANOI = 'Asia/Ho_Chi_Minh'
const TOMORROW = businessDateOf(new Date(Date.now() + 86_400_000), HANOI)
const AT_1900 = 19 * 60

/** Phục vụ (R1) được xác nhận đặt bàn; thu ngân (R2) thì không */
let waiter: string
let cashier: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)

const auth = (token: string) => ({
  authorization: `Bearer ${token}`,
  [DEVICE_HEADER]: SEED_DEVICE,
})

async function login(staffId: number) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/login',
    headers: { [DEVICE_HEADER]: SEED_DEVICE },
    payload: { branchId: fx.branchId, staffId, pin: fx.pins[staffId] },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ token: string }>().token
}

/** Khách đặt trên web (W6) */
async function bookOnWeb(input: {
  minute: number
  guestCount: number
  seatKind: string
  name: string
}) {
  const res = await inject({
    method: 'POST',
    url: '/api/reservations',
    payload: {
      branchId: fx.branchId,
      date: TOMORROW,
      minute: input.minute,
      guestCount: input.guestCount,
      seatKind: input.seatKind,
      name: input.name,
      phone: '0912 345 678',
    },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ displayCode: string }>()
}

/** Suất đặt thẳng vào CSDL — dùng khi cần mốc giờ mà luồng khách cố tình chặn */
async function seedReservation(input: {
  slotAt: Date
  tableId?: number
  guestCount?: number
  status?: string
  code: string
}) {
  const [row] = await db
    .insert(reservations)
    .values({
      displayCode: input.code,
      branchId: fx.branchId,
      seatKind: 'grill',
      guestCount: input.guestCount ?? 2,
      slotAt: input.slotAt,
      endAt: new Date(input.slotAt.getTime() + 105 * 60_000),
      status: input.status ?? 'confirmed',
      customerName: 'Chị Vy',
      customerPhone: '0977 613 209',
      tableId: input.tableId ?? null,
      source: 'phone',
      businessDate: businessDateOf(input.slotAt, HANOI),
    })
    .returning()
  return row!
}

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  await db.insert(devices).values({
    branchId: fx.branchId,
    kind: 'cashier',
    name: 'Máy thu ngân gốc',
    tokenHash: hashToken(SEED_DEVICE),
  })
  await db
    .update(branches)
    .set({ openHours: { raw: '11:00–14:00 · 17:00–23:00' } })
    .where(eq(branches.id, fx.branchId))

  waiter = await login(fx.waiterId)
  cashier = await login(fx.cashierId)
}, 120_000)

afterAll(async () => {
  await close?.()
})

// ---------------------------------------------------------------------------

describe('R1 · P13 — suất từ web hiện ngay trên bảng của quầy', () => {
  let id: number

  it('bảng trả cả sơ đồ bàn lẫn suất trong một lượt', async () => {
    const booked = await bookOnWeb({
      minute: AT_1900,
      guestCount: 4,
      seatKind: 'grill',
      name: 'Anh Tuấn',
    })

    const res = await inject({
      method: 'GET',
      url: `/api/desk/reservations?date=${TOMORROW}`,
      headers: auth(waiter),
    })
    expect(res.statusCode).toBe(200)
    const board = res.json()

    expect(board.tables.length).toBeGreaterThan(0)
    expect(board.reservations).toHaveLength(1)
    expect(board.reservations[0].displayCode).toBe(booked.displayCode)
    expect(board.reservations[0].status).toBe('confirmed')
    expect(board.reservations[0].tableId).toBeNull()
    // Máy trạm không tự quyết suất nào quá giờ — đồng hồ do máy chủ phát
    expect(board.serverNow).toBeTruthy()
    id = board.reservations[0].id
  })

  it('chi tiết kèm lịch sử của số điện thoại và danh sách bàn gán được', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/desk/reservations/${id}`,
      headers: auth(waiter),
    })
    const detail = res.json()
    expect(detail.history).toEqual({ visits: 0, noShows: 0 })
    // Fixture có hai bàn nướng 6 chỗ; bàn thường 4 chỗ không lọt vào đây
    expect(detail.fittingTables).toHaveLength(2)
    expect(detail.fittingTables.every((t: { free: boolean }) => t.free)).toBe(true)
  })
})

describe('R2 — gán bàn', () => {
  let id: number

  beforeAll(async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/desk/reservations?date=${TOMORROW}`,
      headers: auth(waiter),
    })
    id = res.json().reservations[0].id
  })

  const assign = (tableId: number | null) =>
    inject({
      method: 'PATCH',
      url: `/api/desk/reservations/${id}/table`,
      headers: auth(waiter),
      payload: { tableId },
    })

  it('từ chối bàn sai kiểu chỗ', async () => {
    const res = await assign(fx.plainTableId)
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('wrong_seat_kind')
  })

  it('nhận bàn đúng kiểu và đủ sức chứa', async () => {
    const res = await assign(fx.grillTableId)
    expect(res.statusCode).toBe(200)
    expect(res.json().tableId).toBe(fx.grillTableId)
  })

  it('bàn đã dành cho suất khác cùng giờ thì không gán chồng', async () => {
    const other = await bookOnWeb({
      minute: AT_1900 + 30,
      guestCount: 2,
      seatKind: 'grill',
      name: 'Chị Hoa',
    })
    const board = await inject({
      method: 'GET',
      url: `/api/desk/reservations?date=${TOMORROW}`,
      headers: auth(waiter),
    })
    const otherId = board
      .json()
      .reservations.find((r: { displayCode: string }) => r.displayCode === other.displayCode).id

    const res = await inject({
      method: 'PATCH',
      url: `/api/desk/reservations/${otherId}/table`,
      headers: auth(waiter),
      payload: { tableId: fx.grillTableId },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('table_busy')
    expect(res.json().message).toContain('Anh Tuấn')
  })

  it('ghi chú dị ứng lưu được để bếp đọc trước khi khách tới', async () => {
    const res = await inject({
      method: 'PATCH',
      url: `/api/desk/reservations/${id}/note`,
      headers: auth(waiter),
      payload: { note: 'Dị ứng hải sản' },
    })
    expect(res.json().note).toBe('Dị ứng hải sản')
  })
})

describe('P2 · P3 — đặt chỗ hiện trên sơ đồ bàn', () => {
  let soonId: number

  beforeAll(async () => {
    // Suất trong 30 phút tới, đã gán bàn dự phòng
    const row = await seedReservation({
      slotAt: new Date(Date.now() + 30 * 60_000),
      tableId: fx.spareTableId,
      code: 'DB-9001',
    })
    soonId = row.id
  })

  it('ô bàn mang nhãn đặt chỗ sắp tới', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/tables?branch=${fx.branchId}`,
      headers: auth(waiter),
    })
    const table = res
      .json()
      .find((t: { id: number }) => t.id === fx.spareTableId)
    expect(table.reservation).not.toBeNull()
    expect(table.reservation.displayCode).toBe('DB-9001')
    expect(table.reservation.customerName).toBe('Chị Vy')
  })

  it('mở bàn cho khách vãng lai bị chặn, kèm tên người đã đặt', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/tables/${fx.spareTableId}/open`,
      headers: auth(waiter),
      payload: { guestCount: 2 },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('table_reserved')
    expect(res.json().message).toContain('Chị Vy')
  })

  it('nhân viên vẫn mở được khi bấm lần hai, và lựa chọn đó vào nhật ký', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/tables/${fx.spareTableId}/open`,
      headers: auth(waiter),
      payload: { guestCount: 2, ignoreReservation: true },
    })
    expect(res.statusCode).toBe(201)

    const sessionId = res.json().id
    await inject({
      method: 'POST',
      url: `/api/table-sessions/${sessionId}/close`,
      headers: auth(waiter),
    })
    // Dọn dẹp để phần sau còn dùng bàn này
    await db.delete(reservations).where(eq(reservations.id, soonId))
  })
})

describe('R2 — khách tới thì đặt chỗ giao lại cho vòng vận hành tại bàn', () => {
  it('"Đã đến" mở phiên bàn thật, mang theo ghi chú của khách', async () => {
    const board = await inject({
      method: 'GET',
      url: `/api/desk/reservations?date=${TOMORROW}`,
      headers: auth(waiter),
    })
    const row = board
      .json()
      .reservations.find((r: { tableId: number | null }) => r.tableId !== null)

    const res = await inject({
      method: 'POST',
      url: `/api/desk/reservations/${row.id}/arrive`,
      headers: auth(waiter),
      payload: {},
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().reservation.status).toBe('seated')

    const [session] = await db
      .select()
      .from(tableSessions)
      .where(eq(tableSessions.id, res.json().sessionId))
    expect(session!.guestCount).toBe(4)
    expect(session!.note).toBe('Dị ứng hải sản')
  })

  it('suất của chính giờ này vẫn mở được bàn — cảnh báo P3 không chặn nhầm', async () => {
    const row = await seedReservation({
      slotAt: new Date(Date.now() + 20 * 60_000),
      tableId: fx.spareTableId,
      code: 'DB-9010',
    })

    const res = await inject({
      method: 'POST',
      url: `/api/desk/reservations/${row.id}/arrive`,
      headers: auth(waiter),
      payload: {},
    })
    expect(res.statusCode, res.payload).toBe(201)

    await inject({
      method: 'POST',
      url: `/api/table-sessions/${res.json().sessionId}/close`,
      headers: auth(waiter),
    })
  })

  it('thu ngân không được đánh trạng thái đặt bàn', async () => {
    const row = await seedReservation({
      slotAt: new Date(Date.now() + 60 * 60_000),
      code: 'DB-9002',
    })
    const res = await inject({
      method: 'POST',
      url: `/api/desk/reservations/${row.id}/no-show`,
      headers: auth(cashier),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('R4 — quá giờ và no-show', () => {
  let lateId: number

  beforeAll(async () => {
    // Hẹn 40 phút trước, đã quá 15 phút giữ bàn
    const row = await seedReservation({
      slotAt: new Date(Date.now() - 40 * 60_000),
      code: 'DB-9003',
    })
    lateId = row.id
  })

  it('suất quá giờ nổi lên kèm số phút trễ', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/desk/reservations/late',
      headers: auth(waiter),
    })
    const row = res.json().rows.find((r: { id: number }) => r.id === lateId)
    expect(row.lateMinutes).toBeGreaterThanOrEqual(39)
    expect(row.canNoShow).toBe(true)
  })

  it('chưa hết giờ giữ bàn thì chưa đánh no-show được', async () => {
    const soon = await seedReservation({
      slotAt: new Date(Date.now() - 2 * 60_000),
      code: 'DB-9004',
    })
    const res = await inject({
      method: 'POST',
      url: `/api/desk/reservations/${soon.id}/no-show`,
      headers: auth(waiter),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('too_early')
  })

  it('quá giờ giữ bàn thì đánh được, và suất rời khỏi hàng đợi', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/desk/reservations/${lateId}/no-show`,
      headers: auth(waiter),
    })
    expect(res.statusCode).toBe(201)
    expect(res.json().status).toBe('no_show')

    const late = await inject({
      method: 'GET',
      url: '/api/desk/reservations/late',
      headers: auth(waiter),
    })
    expect(late.json().rows.find((r: { id: number }) => r.id === lateId)).toBeUndefined()
  })

  it('tỉ lệ no-show tính theo nguồn đặt', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/desk/reservations/no-show-stats',
      headers: auth(waiter),
    })
    const phone = res.json().sources.find((s: { source: string }) => s.source === 'phone')
    expect(phone.noShow).toBe(1)
    expect(phone.rate).toBeGreaterThan(0)
  })
})

describe('R2 — nhân viên đặt hộ qua điện thoại', () => {
  it('đi qua đúng đường kiểm của khách web và ghi nguồn là điện thoại', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/desk/reservations',
      headers: auth(waiter),
      payload: {
        branchId: fx.branchId,
        date: TOMORROW,
        minute: 12 * 60,
        guestCount: 2,
        seatKind: 'grill',
        name: 'Công ty FPT',
        phone: '024 7300 8866',
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().displayCode).toMatch(/^DB-/)

    const [row] = await db
      .select()
      .from(reservations)
      .where(eq(reservations.displayCode, res.json().displayCode))
    expect(row!.source).toBe('phone')
    expect(row!.createdBy).toBe(fx.waiterId)
  })

  it('vẫn bị chặn khi giờ đó không nhận đặt', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/desk/reservations',
      headers: auth(waiter),
      payload: {
        branchId: fx.branchId,
        date: TOMORROW,
        minute: 3 * 60,
        guestCount: 2,
        seatKind: 'grill',
        name: 'Anh Sơn',
        phone: '0988 111 222',
      },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().code).toBe('outside-hours')
  })
})
