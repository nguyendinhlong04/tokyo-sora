import { sql } from 'drizzle-orm'
import { displayCounters } from '../db/schema'
import type { Tx } from './tx'

/** Đơn online đọc là ON, đặt chỗ đọc là ĐB — hai sổ số đếm riêng */
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
 *
 * **Kỳ đánh số phải trùng với phần in trên mã.** Mã in `yyMM` nên số đếm cũng chạy
 * theo THÁNG của ngày làm việc; đếm theo ngày mà in theo tháng là hai khách khác
 * ngày cùng nhận `ON-2608-0001`. Đặt bàn dính đòn này nặng nhất vì ngày làm việc
 * của một suất là ngày khách ĐẾN ĂN, không phải ngày đặt: hai người cùng đặt hôm
 * nay cho hai tối khác nhau sẽ tranh nhau đúng một mã.
 */
export async function nextDisplayCode(
  tx: Tx,
  input: {
    branchId: string
    kind: DisplayCodeKind
    /** Ngày làm việc của đơn/suất, `YYYY-MM-DD` theo giờ chi nhánh */
    businessDate: string
  },
): Promise<{ code: string; label: string; counter: number }> {
  const period = `${input.businessDate.slice(2, 4)}${input.businessDate.slice(5, 7)}`

  const [row] = await tx
    .insert(displayCounters)
    .values({
      branchId: input.branchId,
      kind: input.kind,
      // Mốc kỳ, không phải ngày của đơn: ngày đầu tháng đại diện cho cả tháng
      businessDate: `${input.businessDate.slice(0, 7)}-01`,
      counter: 1,
    })
    .onConflictDoUpdate({
      target: [displayCounters.branchId, displayCounters.kind, displayCounters.businessDate],
      set: { counter: sql`${displayCounters.counter} + 1` },
    })
    .returning({ counter: displayCounters.counter })

  const counter = row!.counter
  const serial = String(counter).padStart(4, '0')
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
