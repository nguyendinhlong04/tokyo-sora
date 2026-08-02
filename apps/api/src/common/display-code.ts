import { sql } from 'drizzle-orm'
import { displayCounters } from '../db/schema'
import { displayPeriodOf } from './business-date'
import type { Tx } from './tx'

/** Đơn online đọc là ON, đặt chỗ đọc là ĐB — hai sổ số đếm riêng theo ngày */
const PREFIX = { order: 'ON', reservation: 'DB' } as const
export type DisplayCodeKind = keyof typeof PREFIX

/**
 * Sinh mã hiển thị cho khách: `ON-2608-0417`.
 *
 * Mã hiển thị và id nội bộ là HAI THỨ KHÁC NHAU (điểm dễ sai §9.4): khách đọc mã
 * này qua điện thoại, đừng bắt họ đọc id.
 *
 * Cấp số bằng UPSERT … RETURNING trong cùng transaction tạo đơn — hai thu ngân bấm
 * cùng lúc thì Postgres tuần tự hoá trên khoá chính, không ai nhận trùng số.
 */
export async function nextDisplayCode(
  tx: Tx,
  input: {
    branchId: string
    kind: DisplayCodeKind
    businessDate: string
    at: Date
    timezone: string
  },
): Promise<{ code: string; label: string; counter: number }> {
  const [row] = await tx
    .insert(displayCounters)
    .values({
      branchId: input.branchId,
      kind: input.kind,
      businessDate: input.businessDate,
      counter: 1,
    })
    .onConflictDoUpdate({
      target: [displayCounters.branchId, displayCounters.kind, displayCounters.businessDate],
      set: { counter: sql`${displayCounters.counter} + 1` },
    })
    .returning({ counter: displayCounters.counter })

  const counter = row!.counter
  const serial = String(counter).padStart(4, '0')
  const period = displayPeriodOf(input.at, input.timezone)
  const prefix = PREFIX[input.kind]
  return {
    code: `${prefix}-${period}-${serial}`,
    // Nhãn ngắn in trên vé bếp và đọc cho khách
    label: `${prefix}-${serial}`,
    counter,
  }
}

/** Phần số của mã đơn — vé bếp dùng để ghép tiền tố trạm: A-0417, B-0417 */
export function orderNumberOf(displayCode: string): string {
  const parts = displayCode.split('-')
  return parts[parts.length - 1] ?? displayCode
}
