import { elapsedSeconds, emberColor } from '@sora/core'
import { EmptyState } from '@sora/ui'
import type { Queue } from '../api'

interface Row {
  name: string
  qty: number
  /** Vé nào đang chờ món này — bếp biết nấu xong thì chia về đâu */
  tickets: { code: string; tableCode: string | null; qty: number }[]
  /** Vé gấp nhất trong nhóm, để xếp thứ tự nấu */
  hottest: number
  notes: string[]
}

/**
 * K3 Bảng tổng món.
 *
 * Cùng dữ liệu hàng vé nhưng nhìn theo MÓN thay vì theo VÉ: "Cơm chiên hải sản ×7"
 * để bếp nấu gộp một mẻ thay vì bảy lần. Đây là chỗ tiết kiệm thời gian lớn nhất
 * giờ cao điểm.
 *
 * Xếp theo độ gấp của vé nóng nhất trong nhóm — nấu gộp nhưng vẫn phải ưu tiên
 * đúng bàn đang chờ lâu nhất.
 */
export function DishTotals({ queue }: { queue: Queue | undefined }) {
  const live = (queue?.tickets ?? []).filter((t) => t.state === 'queued' || t.state === 'cooking')

  const byDish = new Map<string, Row>()
  for (const ticket of live) {
    const ratio = ticket.prepSeconds > 0 ? elapsedSeconds(ticket.queuedAt) / ticket.prepSeconds : 0
    for (const item of ticket.items) {
      if (item.state === 'done' || item.state === 'voided') continue
      const row = byDish.get(item.nameSnapshot) ?? {
        name: item.nameSnapshot,
        qty: 0,
        tickets: [],
        hottest: 0,
        notes: [],
      }
      row.qty += item.qty
      row.tickets.push({ code: ticket.displayCode, tableCode: ticket.tableCode, qty: item.qty })
      row.hottest = Math.max(row.hottest, ratio)
      if (item.note) row.notes.push(`${ticket.tableCode ?? 'mang về'}: ${item.note}`)
      byDish.set(item.nameSnapshot, row)
    }
  }

  const rows = [...byDish.values()].sort((a, b) => b.hottest - a.hottest)

  if (rows.length === 0) {
    return <EmptyState title="Chưa có món nào đang chờ nấu." />
  }

  return (
    <div className="flex flex-col gap-2 overflow-y-auto">
      {rows.map((row) => (
        <div
          key={row.name}
          className="flex items-start gap-4 rounded-md border-l-4 border-line-2 bg-surface-1 p-4"
          style={{ borderLeftColor: emberColor(row.hottest) }}
        >
          <span className="min-w-[4ch] font-mono text-[length:var(--fs-ticket-qty)] font-semibold text-accent-ink">
            {row.qty}×
          </span>

          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[length:var(--fs-ticket-dish)] font-semibold text-ink-hi uppercase">
              {row.name}
            </span>
            <div className="flex flex-wrap gap-x-3 gap-y-1">
              {row.tickets.map((t, i) => (
                <span key={`${t.code}-${i}`} className="font-mono text-[length:var(--fs-b2)] text-ink-mute">
                  {t.tableCode ? `Bàn ${t.tableCode}` : t.code} ×{t.qty}
                </span>
              ))}
            </div>
            {/* Ghi chú khách không bao giờ bị ẩn, kể cả ở màn gộp món */}
            {row.notes.map((note, i) => (
              <span key={i} className="text-[length:var(--fs-t2)] text-warn">
                {note}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
