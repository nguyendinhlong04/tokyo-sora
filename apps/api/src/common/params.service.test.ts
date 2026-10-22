import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../db/client'
import { ParamsService } from './params.service'

/**
 * CSDL giả: chỉ đủ cho `select().from(parameters)`, đếm số lần bị hỏi.
 * `hold()` giữ lượt hỏi kế tiếp như pool đang bị một transaction chiếm, trả về
 * hàm nhả; `failNext()` làm lượt hỏi kế tiếp hỏng.
 */
function fakeDb(rows: { key: string; branchId: string | null; value: unknown }[]) {
  const calls = { count: 0 }
  let gate: Promise<void> | null = null
  let fail = false
  const db = {
    select: () => ({
      from: async () => {
        calls.count++
        if (gate) await gate
        if (fail) {
          fail = false
          throw new Error('timeout exceeded when trying to connect')
        }
        return rows.map((r) => ({ ...r }))
      },
    }),
  }
  const hold = () => {
    let release = () => {}
    gate = new Promise<void>((resolve) => {
      release = () => {
        gate = null
        resolve()
      }
    })
    return release
  }
  const failNext = () => {
    fail = true
  }
  return { db: db as unknown as Db, calls, rows, hold, failNext }
}

describe('ParamsService — cache theo từng instance', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-22T08:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('trong 60 giây đọc từ cache, không hỏi lại CSDL', async () => {
    const { db, calls } = fakeDb([{ key: 'sales.vatRate', branchId: null, value: 0.08 }])
    const params = new ParamsService(db)

    expect(await params.getNumber('sales.vatRate', 0)).toBe(0.08)
    vi.advanceTimersByTime(59_000)
    expect(await params.getNumber('sales.vatRate', 0)).toBe(0.08)
    expect(calls.count).toBe(1)
  })

  it('quá 60 giây thì nạp lại nền — instance khác đổi tham số cũng tới được đây', async () => {
    const { db, rows } = fakeDb([{ key: 'sales.vatRate', branchId: null, value: 0.08 }])
    const params = new ParamsService(db)
    expect(await params.getNumber('sales.vatRate', 0)).toBe(0.08)

    // Kế toán đổi ở A6 qua một instance khác — instance này không được báo
    rows[0]!.value = 0.1
    vi.advanceTimersByTime(60_000)
    await params.getNumber('sales.vatRate', 0)
    await vi.waitFor(async () => expect(await params.getNumber('sales.vatRate', 0)).toBe(0.1))
  })

  it('lượt đọc lúc hết hạn KHÔNG chờ kết nối đang bị transaction giữ (pool 1 trên Vercel)', async () => {
    const { db, rows, hold } = fakeDb([{ key: 'sales.vatRate', branchId: null, value: 0.08 }])
    const params = new ParamsService(db)
    expect(await params.getNumber('sales.vatRate', 0)).toBe(0.08)

    rows[0]!.value = 0.1
    const release = hold()
    vi.advanceTimersByTime(60_000)
    // Lượt nạp đang xếp hàng sau transaction — lượt đọc trả ngay bản đang có
    expect(await params.getNumber('sales.vatRate', 0)).toBe(0.08)

    release()
    await vi.waitFor(async () => expect(await params.getNumber('sales.vatRate', 0)).toBe(0.1))
  })

  it('nạp lại hỏng thì giữ bản cũ, lượt đọc sau thử lại', async () => {
    const { db, rows, calls, failNext } = fakeDb([
      { key: 'sales.vatRate', branchId: null, value: 0.08 },
    ])
    const params = new ParamsService(db)
    expect(await params.getNumber('sales.vatRate', 0)).toBe(0.08)

    failNext()
    vi.advanceTimersByTime(60_000)
    expect(await params.getNumber('sales.vatRate', 0)).toBe(0.08)
    await vi.waitFor(() => expect(calls.count).toBe(2))

    rows[0]!.value = 0.1
    await vi.waitFor(async () => expect(await params.getNumber('sales.vatRate', 0)).toBe(0.1))
  })

  it('nhiều lời gọi cùng lúc lúc chưa nạp chỉ nạp một lần', async () => {
    const { db, calls } = fakeDb([{ key: 'kitchen.undoSeconds', branchId: null, value: 30 }])
    const params = new ParamsService(db)

    const values = await Promise.all([
      params.getNumber('kitchen.undoSeconds', 0),
      params.getNumber('kitchen.undoSeconds', 0),
      params.get('kitchen.undoSeconds'),
    ])
    expect(values).toEqual([30, 30, 30])
    expect(calls.count).toBe(1)
  })

  it('ghi đè theo chi nhánh vẫn thắng giá trị cấp chuỗi', async () => {
    const { db } = fakeDb([
      { key: 'einvoice.serial', branchId: null, value: 'C26MAA' },
      { key: 'einvoice.serial', branchId: 'cg', value: 'C26MBA' },
    ])
    const params = new ParamsService(db)
    expect(await params.get('einvoice.serial', 'cg')).toBe('C26MBA')
    expect(await params.get('einvoice.serial', 'hn')).toBe('C26MAA')
  })
})
