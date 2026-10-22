import { TASK_STATE_LABELS, type TaskRow, type TaskState } from '@sora/contracts'
import { dueLabel } from '@sora/core'
import { Badge } from '@sora/ui'

/** Màu trạng thái việc — luôn kèm chữ, màu không bao giờ là thông tin duy nhất */
const STATE_TONES: Record<TaskState, 'neutral' | 'info' | 'ok' | 'warn'> = {
  open: 'info',
  submitted: 'warn',
  done: 'ok',
  cancelled: 'neutral',
}

export function TaskStateBadge({ state }: { state: TaskState }) {
  return <Badge tone={STATE_TONES[state]}>{TASK_STATE_LABELS[state]}</Badge>
}

export const formatDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString('vi-VN', {
        timeZone: 'Asia/Ho_Chi_Minh',
        hour: '2-digit',
        minute: '2-digit',
        day: '2-digit',
        month: '2-digit',
      })
    : '—'

/**
 * Hạn của việc: còn đang làm thì nói "còn bao lâu / trễ bao lâu", đã nộp hay đã
 * xong thì chỉ ghi mốc. Trễ = chữ đỏ đậm VÀ chữ "Quá hạn" — không chỉ đổi màu.
 */
export function DueText({ task }: { task: Pick<TaskRow, 'dueAt' | 'state' | 'overdue'> }) {
  if (task.state !== 'open') {
    return (
      <span className="font-mono text-ink-mute tabular-nums">{formatDateTime(task.dueAt)}</span>
    )
  }
  return (
    <span className={task.overdue ? 'font-semibold text-danger-line' : 'text-ink-body'}>
      {dueLabel(task.dueAt)}
    </span>
  )
}

/** Ai làm: tên người, hoặc chức danh (việc định kỳ) */
export const assigneeOf = (t: Pick<TaskRow, 'assigneeName' | 'assigneePositionTitle'>) =>
  t.assigneeName ?? (t.assigneePositionTitle ? `Ghế ${t.assigneePositionTitle}` : '—')

export const reviewerOf = (t: Pick<TaskRow, 'reviewerName' | 'reviewerPositionTitle'>) =>
  t.reviewerName ?? (t.reviewerPositionTitle ? `Ghế ${t.reviewerPositionTitle}` : 'Không cần')

/** Tiến độ checklist "3/6" — ẩn khi việc không có checklist */
export function ChecklistProgress({ checklist }: { checklist: TaskRow['checklist'] }) {
  if (checklist.total === 0) return <span className="text-ink-mute">—</span>
  return (
    <span className="font-mono tabular-nums">
      {checklist.checked}/{checklist.total}
    </span>
  )
}
