/**
 * B15 — Tuổi nợ. Phần TÍNH, không chạm CSDL.
 *
 * §25 B15 chia ba khoang: 0–30 / 31–60 / trên 60 ngày. Bản dựng này thêm khoang
 * thứ tư ở đầu — **chưa tới hạn** — vì gộp nó vào khoang "0–30" là điều khiến bảng
 * tuổi nợ nói dối: một hoá đơn NET 30 phát hôm qua không phải là nợ quá hạn 1
 * ngày, nó là nợ chưa tới hạn, và kế toán không được gọi điện đòi nó.
 *
 * Mốc đếm là NGÀY ĐẾN HẠN (`dueOn`), không phải ngày ghi nợ: đó là ngày mà điều
 * khoản NET 15/30 đã hết, nên cũng là ngày mà con nợ bắt đầu là con nợ.
 */

export interface AgingBuckets {
  /** Chưa tới hạn trả */
  currentVnd: number
  /** Quá hạn 1–30 ngày */
  d0to30Vnd: number
  /** Quá hạn 31–60 ngày */
  d31to60Vnd: number
  /** Quá hạn trên 60 ngày */
  over60Vnd: number
  totalVnd: number
  /** Khoản quá hạn LÂU NHẤT — con số quyết định có chặn ghi nợ mới hay không */
  maxOverdueDays: number
}

/** Cộng một dòng nợ còn lại vào bảng tuổi nợ đang dựng */
export function agingOf(
  current: AgingBuckets,
  remainingVnd: number,
  dueOn: string,
  today: string,
): AgingBuckets {
  const overdueDays = daysBetween(dueOn, today)
  const next: AgingBuckets = { ...current }

  if (overdueDays <= 0) next.currentVnd += remainingVnd
  else if (overdueDays <= 30) next.d0to30Vnd += remainingVnd
  else if (overdueDays <= 60) next.d31to60Vnd += remainingVnd
  else next.over60Vnd += remainingVnd

  next.totalVnd += remainingVnd
  next.maxOverdueDays = Math.max(next.maxOverdueDays, Math.max(0, overdueDays))
  return next
}

/** Số ngày từ `from` tới `to`; âm nghĩa là `to` còn trước `from` */
export function daysBetween(from: string, to: string): number {
  return Math.round(
    (new Date(`${to}T00:00:00Z`).getTime() - new Date(`${from}T00:00:00Z`).getTime()) / 86_400_000,
  )
}
