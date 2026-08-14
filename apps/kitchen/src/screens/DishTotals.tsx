import { elapsedSeconds, emberColor } from '@sora/core'
import { EmptyState } from '@sora/ui'
import { useState } from 'react'
import type { Queue } from '../api'
import { RecipeSheet } from './RecipeSheet'

interface Row {
  name: string
  /** Món nào — để mở đúng thẻ công thức; gộp theo tên nên lấy mã của dòng đầu */
  dishId: string
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
  const [recipeOf, setRecipeOf] = useState<string | null>(null)
  const live = (queue?.tickets ?? []).filter((t) => t.state === 'queued' || t.state === 'cooking')

  const byDish = new Map<string, Row>()
  for (const ticket of live) {
    const ratio = ticket.prepSeconds > 0 ? elapsedSeconds(ticket.queuedAt) / ticket.prepSeconds : 0
    for (const item of ticket.items) {
      if (item.state === 'done' || item.state === 'voided') continue
      const row = byDish.get(item.nameSnapshot) ?? {
        name: item.nameSnapshot,
        dishId: item.dishId,
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

          {/*
            Lối tắt vào quy trình đặt ở ĐÂY chứ không ở dòng món trên vé K2: ở
            đó cả dòng đã là một đích chạm để bấm trạng thái món, thêm nút thứ
            hai vào trong là mời người ta bấm nhầm thành "Xong". Màn này chỉ để
            đọc, và cũng chính là chỗ bếp đứng khi quyết định nấu gì trước.
          */}
          <button
            type="button"
            onClick={() => setRecipeOf(row.dishId)}
            className="h-[var(--hit-target)] flex-none self-start rounded-sm border border-line-3 px-4 text-[length:var(--fs-b1)] text-ink-mute active:bg-surface-3"
          >
            Cách làm
          </button>
        </div>
      ))}

      <RecipeSheet dishId={recipeOf} onClose={() => setRecipeOf(null)} />
    </div>
  )
}
