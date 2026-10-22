import { CountBadge, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { api } from '../api'
import { IconBell } from './icons'

/**
 * Chuông "Việc cần xử lý" ở đầu cột trái.
 *
 * Chưa có realtime nên hỏi máy chủ mỗi 60 giây (TanStack tự ngừng khi tab ẩn và
 * hỏi lại khi quay về). Chỉ ĐẾM — mỗi dòng là một đường dẫn tới màn xử lý.
 * Nhóm nào máy chủ chưa trả là tính năng đó chưa có, chuông không tự bịa số 0.
 */
export function InboxBell() {
  const inbox = useQuery({
    queryKey: ['org-inbox'],
    queryFn: api.inbox,
    refetchInterval: 60_000,
    staleTime: 30_000,
  })
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  useEffect(() => setOpen(false), [pathname])
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const docs = inbox.data?.documents
  const rows = docs
    ? [
        { label: 'Văn bản chưa đọc', count: docs.unread, to: '/van-ban?tab=gui-toi' },
        { label: 'Văn bản cần xác nhận đã đọc', count: docs.toAck, to: '/van-ban?tab=gui-toi' },
        { label: 'Văn bản chờ bạn ký', count: docs.toSign, to: '/van-ban?tab=can-ky' },
      ]
    : []
  const total = (docs?.unread ?? 0) + (docs?.toSign ?? 0)

  return (
    <div className="relative">
      <button
        type="button"
        aria-label={`Việc cần xử lý${total ? `: ${total}` : ''}`}
        aria-expanded={open}
        onClick={() => setOpen(!open)}
        className="relative grid size-9 place-items-center rounded-sm border border-line-1 text-ink-hi transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
      >
        <IconBell />
        <span className="absolute -top-2 -right-2">
          <CountBadge count={total} label={`${total} việc cần xử lý`} />
        </span>
      </button>

      {open ? (
        <>
          <div className="fixed inset-0 z-[105]" onClick={() => setOpen(false)} />
          <div className="absolute top-0 left-[calc(100%+12px)] z-[110] w-[320px] rounded-md border border-line-2 bg-surface-1 py-2">
            <p className="px-4 pt-1 pb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Việc cần xử lý
            </p>
            {inbox.isError ? (
              <div className="px-3 pb-2">
                <ErrorState message="Chưa tải được — thử lại sau ít phút." />
              </div>
            ) : null}
            {rows
              .filter((r) => r.count > 0)
              .map((r) => (
                <Link
                  key={r.label}
                  to={r.to}
                  className="flex items-center gap-3 px-4 py-2.5 text-[length:var(--fs-b2)] text-ink-hi transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
                >
                  <span className="min-w-0 flex-1">{r.label}</span>
                  <span className="font-mono tabular-nums">{r.count}</span>
                </Link>
              ))}
            {docs && rows.every((r) => r.count === 0) ? (
              <p className="px-4 py-3 text-[length:var(--fs-b2)] text-ink-mute">
                Không có việc nào cần xử lý.
              </p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )
}
