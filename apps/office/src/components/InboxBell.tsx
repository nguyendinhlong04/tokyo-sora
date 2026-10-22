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
 * Có việc hoặc khiếu nại quá hạn thì chấm đếm chuyển đỏ — dòng đỏ trong danh sách
 * nói rõ cái gì quá hạn (màu không là thông tin duy nhất).
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

  const data = inbox.data
  const rows = data
    ? [
        { label: 'Việc quá hạn', count: data.tasks.overdue, to: '/ban-lam-viec', urgent: true },
        {
          label: 'Việc đang chờ bạn làm',
          count: data.tasks.open - data.tasks.overdue,
          to: '/ban-lam-viec',
        },
        { label: 'Việc chờ bạn nghiệm thu', count: data.tasks.toReview, to: '/ban-lam-viec' },
        ...(data.feedback
          ? [
              {
                label: 'Khiếu nại quá hạn phản hồi',
                count: data.feedback.overdue,
                to: '/phan-hoi',
                urgent: true,
              },
              {
                label: 'Khiếu nại bạn đang xử lý',
                count: data.feedback.assigned - data.feedback.overdue,
                to: '/phan-hoi',
              },
            ]
          : []),
        {
          label: 'Báo cáo quá hạn chưa nộp',
          count: data.reports.overdue,
          to: '/ban-lam-viec',
          urgent: true,
        },
        {
          label: 'Báo cáo cần nộp',
          count: data.reports.due - data.reports.overdue,
          to: '/ban-lam-viec',
        },
        {
          label: 'Báo cáo chờ bạn xem',
          count: data.reports.toReview,
          to: '/bao-cao-cong-viec?tab=can-xem',
        },
        ...(data.incidents
          ? [
              {
                label: 'Sự cố nghiêm trọng đang mở',
                count: data.incidents.severeOpen,
                to: '/su-co',
                urgent: true,
              },
              {
                label: 'Sự cố đang mở',
                count: data.incidents.open - data.incidents.severeOpen,
                to: '/su-co',
              },
            ]
          : []),
        { label: 'Văn bản chưa đọc', count: data.documents.unread, to: '/van-ban?tab=gui-toi' },
        {
          label: 'Văn bản cần xác nhận đã đọc',
          count: data.documents.toAck,
          to: '/van-ban?tab=gui-toi',
        },
        { label: 'Văn bản chờ bạn ký', count: data.documents.toSign, to: '/van-ban?tab=can-ky' },
      ]
    : []
  // Cần xác nhận là tập con của chưa đọc / đã đọc — không cộng hai lần
  const total =
    (data?.tasks.open ?? 0) +
    (data?.tasks.toReview ?? 0) +
    (data?.feedback?.assigned ?? 0) +
    (data?.reports.due ?? 0) +
    (data?.reports.toReview ?? 0) +
    (data?.incidents?.open ?? 0) +
    (data?.documents.unread ?? 0) +
    (data?.documents.toSign ?? 0)
  const urgent =
    (data?.tasks.overdue ?? 0) +
      (data?.feedback?.overdue ?? 0) +
      (data?.reports.overdue ?? 0) +
      (data?.incidents?.severeOpen ?? 0) >
    0

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
          <CountBadge
            count={total}
            urgent={urgent}
            label={`${total} việc cần xử lý${urgent ? ', có việc quá hạn' : ''}`}
          />
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
                  <span
                    className={[
                      'min-w-0 flex-1',
                      'urgent' in r && r.urgent ? 'font-semibold text-danger-line' : '',
                    ].join(' ')}
                  >
                    {r.label}
                  </span>
                  <span className="font-mono tabular-nums">{r.count}</span>
                </Link>
              ))}
            {data && rows.every((r) => r.count === 0) ? (
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
