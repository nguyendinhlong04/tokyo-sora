import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Db } from '../db/client'
import { ParamsService } from './params.service'

/** CSDL giả: chỉ đủ cho `select().from(parameters)`, đếm số lần bị hỏi */
function fakeDb(rows: { key: string; branchId: string | null; value: unknown }[]) {
  const calls = { count: 0 }
  const db = {
    select: () => ({
      from: async () => {
        calls.count++
        return rows.map((r) => ({ ...r }))
      },
    }),
  }
  return { db: db as unknown as Db, calls, rows }
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

  it('quá 60 giây thì tự nạp lại — instance khác đổi tham số cũng tới được đây', async () => {
    const { db, rows } = fakeDb([{ key: 'sales.vatRate', branchId: null, value: 0.08 }])
    const params = new ParamsService(db)
    expect(await params.getNumber('sales.vatRate', 0)).toBe(0.08)

    // Kế toán đổi ở A6 qua một instance khác — instance này không được báo
    rows[0]!.value = 0.1
    vi.advanceTimersByTime(60_000)
    expect(await params.getNumber('sales.vatRate', 0)).toBe(0.1)
  })

  it('nhiều lời gọi cùng lúc lúc cache hết hạn chỉ nạp một lần', async () => {
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
