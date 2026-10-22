import { CountBadge } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { api } from './api'
import { IconBell, IconCalendar, IconWallet } from './icons'

/**
 * Thanh tab dính đáy — trong tầm ngón cái khi cầm máy một tay. Thay cho hai nút
 * ở đầu màn của bản H8 · H9: thêm Thông báo (và sau này Việc, KPI) thì đầu màn
 * không còn chỗ, mà nút ở đầu màn là nút xa tay nhất.
 *
 * Huy hiệu hỏi máy chủ mỗi 60 giây — chưa có thông báo đẩy.
 */
export function TabBar() {
  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: api.inbox,
    refetchInterval: 60_000,
  })
  const unread = inbox.data?.documents.unread ?? 0

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line-2 bg-surface-1 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg">
        <Tab to="/" icon={<IconCalendar />} label="Lịch" />
        <Tab
          to="/thong-bao"
          icon={<IconBell />}
          label="Thông báo"
          badge={<CountBadge count={unread} label={`${unread} văn bản chưa đọc`} />}
        />
        <Tab to="/phieu-luong" icon={<IconWallet />} label="Lương" />
      </div>
    </nav>
  )
}

function Tab({
  to,
  icon,
  label,
  badge,
}: {
  to: string
  icon: ReactNode
  label: string
  badge?: ReactNode
}) {
  return (
    <NavLink
      to={to}
      end={to === '/'}
      className={({ isActive }) =>
        [
          'relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[length:var(--fs-c1)]',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent',
          isActive ? 'text-accent-ink shadow-[inset_0_2px_0_var(--color-accent)]' : 'text-ink-mute',
        ].join(' ')
      }
    >
      <span className="relative">
        {icon}
        {badge ? <span className="absolute -top-1.5 -right-3">{badge}</span> : null}
      </span>
      {label}
    </NavLink>
  )
}
