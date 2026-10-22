import { useEffect, type ReactNode } from 'react'
import { IconClose } from './icons'

/**
 * Ngăn kéo bên phải — chi tiết một bản ghi mà không rời bảng/sơ đồ đang xem.
 *
 * Gom kiểu ngăn kéo tự dựng ở DishEditor và Parameters (cùng khung: nền mờ
 * `bg-canvas/60`, khung `surface-1` viền trái, đầu – thân cuộn – chân). Hai chỗ
 * cũ chưa chuyển sang đây; màn mới dùng cái này.
 *
 * Esc và bấm ra ngoài đều đóng — form dở dang là việc của nơi gọi (giữ nháp hay
 * hỏi lại), ngăn kéo không tự đoán.
 */
export function Drawer({
  open,
  onClose,
  title,
  subtitle,
  width = 640,
  footer,
  children,
}: {
  open: boolean
  onClose: () => void
  title: string
  subtitle?: ReactNode
  width?: 420 | 640 | 720
  footer?: ReactNode
  children: ReactNode
}) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-100 flex justify-end bg-canvas/60" onClick={onClose}>
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        style={{ width }}
        className="flex h-full max-w-full animate-[sora-slide_var(--dur-panel)_var(--ease-sora)] flex-col border-l border-line-1 bg-surface-1"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex flex-none items-start gap-3 border-b border-line-1 px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">{title}</h2>
            {subtitle ? (
              <div className="mt-1 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                {subtitle}
              </div>
            ) : null}
          </div>
          <button
            type="button"
            aria-label="Đóng"
            onClick={onClose}
            className="grid size-9 flex-none place-items-center rounded-sm text-ink-mute transition-colors hover:bg-surface-3 hover:text-ink-hi focus-visible:outline-2 focus-visible:outline-accent"
          >
            <IconClose />
          </button>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">{children}</div>
        {footer ? (
          <footer className="flex flex-none items-center justify-end gap-2 border-t border-line-1 px-5 py-4">
            {footer}
          </footer>
        ) : null}
      </aside>
    </div>
  )
}
