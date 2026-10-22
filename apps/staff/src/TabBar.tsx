import { CountBadge } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router'
import { api } from './api'
import { IconBell, IconCalendar, IconChart, IconTasks, IconWallet } from './icons'

/**
 * Thanh tab dính đáy — trong tầm ngón cái khi cầm máy một tay. Thay cho hai nút
 * ở đầu màn của bản H8 · H9: thêm Việc, Thông báo, KPI thì đầu màn không còn chỗ,
 * mà nút ở đầu màn là nút xa tay nhất.
 *
 * Huy hiệu hỏi máy chủ mỗi 60 giây — chưa có thông báo đẩy. Có việc quá hạn thì
 * chấm đếm của tab Việc chuyển đỏ, nhãn đọc màn hình nói rõ "quá hạn".
 */
export function TabBar() {
  const inbox = useQuery({
    queryKey: ['inbox'],
    queryFn: api.inbox,
    refetchInterval: 60_000,
  })
  const unread = inbox.data?.documents.unread ?? 0
  const tasks = inbox.data?.tasks
  const reports = inbox.data?.reports
  // Tab Việc gồm cả báo cáo ca phải nộp — cùng là "việc của ca này"
  const pending = (tasks?.open ?? 0) + (tasks?.toReview ?? 0) + (reports?.due ?? 0)
  const kpiDue = inbox.data?.kpi.selfDue ?? 0
  const overdue = (tasks?.overdue ?? 0) + (reports?.overdue ?? 0)

  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line-2 bg-surface-1 pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto flex max-w-lg">
        <Tab to="/" icon={<IconCalendar />} label="Lịch" />
        <Tab
          to="/viec"
          icon={<IconTasks />}
          label="Việc"
          badge={
            <CountBadge
              count={pending}
              urgent={overdue > 0}
              label={`${pending} việc đang chờ${overdue > 0 ? `, ${overdue} quá hạn` : ''}`}
            />
          }
        />
        <Tab
          to="/thong-bao"
          icon={<IconBell />}
          label="Thông báo"
          badge={<CountBadge count={unread} label={`${unread} văn bản chưa đọc`} />}
        />
        <Tab to="/phieu-luong" icon={<IconWallet />} label="Lương" />
        <Tab
          to="/kpi"
          icon={<IconChart />}
          label="KPI"
          badge={<CountBadge count={kpiDue} label={`${kpiDue} phiếu KPI cần tự đánh giá`} />}
        />
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
