import { useEffect, type ReactNode } from 'react'

interface ModalProps {
  open: boolean
  title: string
  onClose: () => void
  children: ReactNode
  footer?: ReactNode
  /** Rộng hơn cho popup modifier nhiều lựa chọn */
  wide?: boolean
}

export function Modal({ open, title, onClose, children, footer, wide = false }: ModalProps) {
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
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={onClose}
    >
      <div
        className={[
          'flex max-h-full w-full flex-col rounded-lg border border-line-2 bg-surface-2',
          'animate-[sora-rise_var(--dur-panel)_var(--ease-sora)]',
          wide ? 'max-w-3xl' : 'max-w-md',
        ].join(' ')}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="border-b border-line-1 px-6 py-4">
          <h2 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">{title}</h2>
        </header>
        <div className="flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer ? (
          <footer className="flex justify-end gap-3 border-t border-line-1 px-6 py-4">{footer}</footer>
        ) : null}
      </div>
    </div>
  )
}
