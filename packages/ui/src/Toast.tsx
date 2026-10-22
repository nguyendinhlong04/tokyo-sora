import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

export type ToastTone = 'ok' | 'warn' | 'danger' | 'info'

interface ToastItem {
  id: number
  message: string
  tone: ToastTone
}

const ToastContext = createContext<((message: string, tone?: ToastTone) => void) | null>(null)

export function useToast() {
  const push = useContext(ToastContext)
  if (!push) throw new Error('useToast phải nằm trong <ToastProvider>')
  return push
}

const TONES: Record<ToastTone, string> = {
  ok: 'border-ok',
  warn: 'border-warn',
  danger: 'border-danger',
  info: 'border-info',
}

export function ToastProvider({
  children,
  placement = 'bottom-right',
}: {
  children: ReactNode
  /**
   * `bottom-center` cho iPad gọi món tại bàn: cột phải ở đó là giỏ với nút Gửi
   * bếp, lời báo góc phải đè đúng lên nút — mà lời báo lỗi gửi bếp thì luôn
   * hiện đúng lúc khách cần bấm lại.
   */
  placement?: 'bottom-right' | 'bottom-center'
}) {
  const [items, setItems] = useState<ToastItem[]>([])

  const push = useCallback((message: string, tone: ToastTone = 'info') => {
    const id = Date.now() + Math.random()
    setItems((list) => [...list, { id, message, tone }])
    // Lỗi ở lại lâu hơn: người dùng cần đọc kịp và quyết định
    const ttl = tone === 'danger' ? 6000 : 3000
    setTimeout(() => setItems((list) => list.filter((i) => i.id !== id)), ttl)
  }, [])

  const value = useMemo(() => push, [push])

  return (
    <ToastContext.Provider value={value}>
      {children}
      {/* Trên MỌI thứ, kể cả ngăn kéo và tấm phủ: ngăn kéo sửa món ở Office và
          tấm trượt ở Table đều ghim z-100, tấm phủ thực đơn Table còn 110. Ở 60
          thì lời báo nằm sau chúng — mà "đã lưu" thì luôn được bấm từ trong ngăn
          kéo, tức là đúng lúc cần báo nhất lại là lúc không thấy gì. */}
      <div
        className={[
          'pointer-events-none fixed bottom-6 z-[200] flex flex-col gap-2',
          placement === 'bottom-center' ? 'left-1/2 -translate-x-1/2 items-center' : 'right-6',
        ].join(' ')}
      >
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={[
              'animate-[sora-slide_var(--dur-panel)_var(--ease-sora)] rounded-md border-l-4 bg-surface-3 px-4 py-3',
              'text-[length:var(--fs-b2)] text-ink-hi shadow-lg',
              TONES[item.tone],
            ].join(' ')}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
