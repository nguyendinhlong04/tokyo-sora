import { subscribeOutbox, type OutboxState } from '@sora/core'
import { useEffect, useState } from 'react'

/**
 * Trạng thái hàng đợi offline, luôn hiện trên thanh trên cùng của POS/KDS.
 *
 * Ba tình huống phải phân biệt rõ ràng, vì phản ứng của nhân viên khác hẳn nhau:
 *   · Mất mạng, còn lệnh chờ  → cứ làm tiếp, máy tự gửi khi có mạng
 *   · Có lệnh LỖI             → phải xử lý tay, không tự khỏi
 *   · Bình thường             → không hiện gì, đừng làm nhiễu
 */
export function OutboxBanner({ onOpenFailed }: { onOpenFailed?: () => void }) {
  const [state, setState] = useState<OutboxState>({
    pending: 0,
    failed: 0,
    online: true,
    draining: false,
  })

  useEffect(() => subscribeOutbox(setState), [])

  if (state.failed > 0) {
    return (
      <button
        type="button"
        onClick={onOpenFailed}
        className="flex items-center gap-2 rounded-sm border border-danger px-3 py-1.5 text-[length:var(--fs-b2)] text-danger"
      >
        {state.failed} lệnh chưa gửi được — bấm để xử lý
      </button>
    )
  }

  if (!state.online) {
    return (
      <span className="flex items-center gap-2 rounded-sm border border-warn px-3 py-1.5 text-[length:var(--fs-b2)] text-warn">
        Mất mạng
        {state.pending > 0 ? ` · ${state.pending} lệnh đang chờ gửi` : ' · vẫn gọi món được'}
      </span>
    )
  }

  if (state.pending > 0) {
    return (
      <span className="flex items-center gap-2 rounded-sm border border-line-3 px-3 py-1.5 text-[length:var(--fs-b2)] text-ink-mute">
        Đang gửi {state.pending} lệnh…
      </span>
    )
  }

  return null
}
