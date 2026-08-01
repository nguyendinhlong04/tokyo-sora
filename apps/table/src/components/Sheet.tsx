import { useEffect, type ReactNode } from 'react'

/**
 * Tấm trượt lên từ đáy màn.
 *
 * Trên điện thoại một tay, nội dung phải bám cạnh dưới — hộp thoại giữa màn của
 * @sora/ui là dạng dành cho POS và Office, ngón cái không với tới nút của nó.
 */
export function Sheet({
  open,
  onClose,
  children,
  full = false,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  /** Tấm cao gần hết màn — dùng cho chi tiết món (T3) có nội dung cuộn */
  full?: boolean
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
    <div className="fixed inset-0 z-100" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Đóng"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/70 animate-[sora-fade_var(--dur-panel)_var(--ease-sora)]"
      />
      <div
        className={[
          'absolute inset-x-0 bottom-0 flex flex-col rounded-t-lg border-t border-line-2 bg-surface-2',
          'animate-[sora-rise_var(--dur-sheet)_var(--ease-sora)]',
          full ? 'top-[10%]' : 'max-h-[90%]',
        ].join(' ')}
      >
        <div className="flex justify-center pt-2.5">
          <span className="h-1 w-11 rounded-pill bg-line-3" />
        </div>
        {children}
      </div>
    </div>
  )
}
