import type { ReactNode } from 'react'

/**
 * Thanh hành động ghim đáy màn.
 *
 * Cao 44px trở lên và chừa `safe-area` của máy có thanh gạt — nút bị viền máy che
 * mất một nửa là nút không bấm được.
 */
export function BottomBar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-70 border-t border-line-1 bg-surface-4 px-4 pt-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {children}
    </div>
  )
}

/** Chừa chỗ cho thanh ghim đáy để dòng cuối trang không bị che */
export function BottomBarSpacer() {
  return <div className="h-28" />
}
