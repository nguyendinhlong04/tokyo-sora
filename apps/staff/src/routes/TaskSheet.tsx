import type { TaskDetail } from '@sora/contracts'
import { dueLabel, safeHref } from '@sora/core'
import { Badge, Button, ErrorState, Sheet, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'

/**
 * N12 — Một việc, mở từ đáy màn. Checklist là phần chính: mỗi mục một hàng to
 * (chạm được khi đang cầm khăn, cầm khay), tích là gửi ngay — mất sóng thì hàng
 * tự bỏ tích và báo lỗi, không giả vờ đã lưu.
 *
 * Nghiệm thu ở đây chỉ hiện khi máy chủ nói bạn là người ĐƯỢC CHỈ ĐỊNH (trưởng
 * ca nghiệm thu checklist ngay trên sàn) — mọi việc quản lý khác làm ở Office.
 */
export function TaskSheet({ taskId, onClose }: { taskId: number | null; onClose: () => void }) {
  const detail = useQuery({
    queryKey: ['task', taskId],
    queryFn: () => api.myTask(taskId!),
    enabled: taskId !== null,
  })

  return (
    <Sheet open={taskId !== null} onClose={onClose} full>
      <div className="flex min-h-0 flex-1 flex-col">
        {detail.isPending ? (
          <div className="flex flex-col gap-3 px-5 pt-4">
            <Skeleton className="h-7 w-3/4" />
            <Skeleton className="h-14" />
            <Skeleton className="h-14" />
          </div>
        ) : null}
        {detail.isError ? (
          <div className="px-5 pt-4">
            <ErrorState message={(detail.error as Error).message} />
          </div>
        ) : null}
        {detail.data ? <Body task={detail.data} onClose={onClose} /> : null}
      </div>
    </Sheet>
  )
}

function Body({ task, onClose }: { task: TaskDetail; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [returning, setReturning] = useState(false)
  const key = ['task', task.id]
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['my-tasks'] })
    void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    void queryClient.invalidateQueries({ queryKey: key })
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const toggle = useMutation({
    mutationFn: (v: { idx: number; checked: boolean }) => api.checkTask(task.id, v.idx, v.checked),
    onMutate: async (v) => {
      await queryClient.cancelQueries({ queryKey: key })
      const before = queryClient.getQueryData<TaskDetail>(key)
      queryClient.setQueryData<TaskDetail>(key, (old) =>
        old
          ? {
              ...old,
              items: old.items.map((i) =>
                i.idx === v.idx
                  ? {
                      ...i,
                      checkedAt: v.checked ? new Date().toISOString() : null,
                      checkedByName: v.checked ? 'Bạn' : null,
                    }
                  : i,
              ),
            }
          : old,
      )
      return { before }
    },
    onError: (err: Error, _v, ctx) => {
      if (ctx?.before) queryClient.setQueryData(key, ctx.before)
      toast(`Chưa lưu được: ${err.message}`, 'danger')
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  })

  const accept = useMutation({
    mutationFn: () => api.acceptTask(task.id),
    onSuccess: () => {
      toast('Đã nhận việc', 'ok')
      refresh()
    },
    onError: fail,
  })
  const submit = useMutation({
    mutationFn: () => api.submitTask(task.id, note.trim() || null, null),
    onSuccess: (r) => {
      toast(r.state === 'done' ? 'Đã báo xong' : 'Đã nộp — chờ nghiệm thu', 'ok')
      refresh()
      onClose()
    },
    onError: fail,
  })
  const review = useMutation({
    mutationFn: (v: { accept: boolean; note: string | null }) =>
      api.reviewTask(task.id, v.accept, v.note),
    onSuccess: (r) => {
      toast(r.state === 'done' ? 'Đã nghiệm thu đạt' : 'Đã trả lại', 'ok')
      refresh()
      onClose()
    },
    onError: fail,
  })

  const unchecked = task.items.filter((i) => !i.checkedAt).length
  const hasReviewer = Boolean(task.reviewerName || task.reviewerPositionTitle)

  return (
    <>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {task.priority === 'gap' && task.state === 'open' ? (
            <Badge tone="danger">Gấp</Badge>
          ) : null}
          {task.shiftLabel ? (
            <span className="text-[length:var(--fs-c1)] text-ink-mute">{task.shiftLabel}</span>
          ) : null}
        </div>
        <h2 className="mt-1 text-[length:var(--fs-t1)] font-semibold text-ink-hi">{task.title}</h2>
        <p
          className={[
            'mt-1 text-[length:var(--fs-b2)]',
            task.state === 'open' && task.overdue ? 'font-semibold text-danger' : 'text-ink-body',
          ].join(' ')}
        >
          {task.state === 'open' ? dueLabel(task.dueAt) : stateLine(task)}
        </p>
        <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
          {task.createdByName ? `Giao bởi ${task.createdByName}` : 'Việc định kỳ'}
          {hasReviewer
            ? ` · nghiệm thu: ${task.reviewerName ?? task.reviewerPositionTitle}`
            : ' · nộp là xong'}
        </p>

        {task.managerNote && task.state === 'open' ? (
          <p className="mt-4 rounded-sm border border-warn px-4 py-3 text-[length:var(--fs-b1)] text-ink-hi">
            Bị trả lại: {task.managerNote}
          </p>
        ) : null}

        {task.note ? (
          <p className="mt-4 text-[length:var(--fs-b1)] leading-relaxed whitespace-pre-wrap text-ink-hi">
            {task.note}
          </p>
        ) : null}

        {task.attachments.length > 0 ? (
          <div className="mt-4 flex flex-col">
            {task.attachments.map((a, i) => {
              const href = safeHref(a.url)
              return href ? (
                <a
                  key={i}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex min-h-[var(--hit-target)] items-center text-[length:var(--fs-b1)] text-accent-ink underline"
                >
                  {a.name}
                </a>
              ) : (
                <span key={i} className="text-[length:var(--fs-b2)] text-ink-mute">
                  {a.name}
                </span>
              )
            })}
          </div>
        ) : null}

        {task.items.length > 0 ? (
          <ul className="mt-5 flex flex-col gap-2">
            {task.items.map((item) => {
              const checked = item.checkedAt !== null
              return (
                <li key={item.idx}>
                  <button
                    type="button"
                    role="checkbox"
                    aria-checked={checked}
                    disabled={!task.canCheck}
                    onClick={() => toggle.mutate({ idx: item.idx, checked: !checked })}
                    className={[
                      'flex min-h-[52px] w-full items-center gap-3 rounded-md border px-4 py-2 text-left',
                      'focus-visible:outline-2 focus-visible:outline-accent disabled:cursor-default',
                      checked ? 'border-ok/50 bg-surface-2' : 'border-line-2 bg-surface-1',
                    ].join(' ')}
                  >
                    <span
                      aria-hidden="true"
                      className={[
                        'grid size-6 flex-none place-items-center rounded-sm border',
                        checked ? 'border-ok bg-ok text-canvas' : 'border-line-4',
                      ].join(' ')}
                    >
                      {checked ? (
                        <svg
                          viewBox="0 0 24 24"
                          width={20}
                          height={20}
                          fill="none"
                          stroke="currentColor"
                          strokeWidth={1.5}
                        >
                          <path
                            d="M5 12.5l4.5 4.5L19 7.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      ) : null}
                    </span>
                    <span className="min-w-0 flex-1 text-[length:var(--fs-b1)] text-ink-hi">
                      {item.label}
                    </span>
                    {item.checkedByName ? (
                      <span className="flex-none text-[length:var(--fs-c1)] text-ink-mute">
                        {item.checkedByName}
                      </span>
                    ) : null}
                  </button>
                </li>
              )
            })}
          </ul>
        ) : null}

        {task.resultNote && task.state !== 'open' ? (
          <p className="mt-4 text-[length:var(--fs-b2)] text-ink-body">
            Người làm ghi: {task.resultNote}
          </p>
        ) : null}
      </div>

      {/* Phím chính ở đáy, trong tầm ngón cái */}
      {task.canAccept || task.canSubmit || task.canReview ? (
        <div className="flex flex-col gap-2 border-t border-line-2 bg-surface-2 px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          {task.canSubmit && unchecked > 0 ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder={`Còn ${unchecked} mục chưa tích — ghi lý do`}
              className="w-full rounded-sm border border-line-3 bg-canvas px-3 py-2 text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute"
            />
          ) : null}
          {returning ? (
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={2}
              placeholder="Cần làm lại gì"
              className="w-full rounded-sm border border-line-3 bg-canvas px-3 py-2 text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute"
            />
          ) : null}
          <div className="flex gap-2">
            {task.canAccept ? (
              <Button block disabled={accept.isPending} onClick={() => accept.mutate()}>
                Nhận việc
              </Button>
            ) : null}
            {task.canSubmit ? (
              <Button
                block
                variant="primary"
                disabled={submit.isPending || (unchecked > 0 && !note.trim())}
                onClick={() => submit.mutate()}
              >
                {hasReviewer ? 'Nộp nghiệm thu' : 'Báo xong'}
              </Button>
            ) : null}
            {task.canReview && !returning ? (
              <>
                <Button block onClick={() => setReturning(true)}>
                  Trả lại…
                </Button>
                <Button
                  block
                  variant="primary"
                  disabled={review.isPending}
                  onClick={() => review.mutate({ accept: true, note: null })}
                >
                  Đạt
                </Button>
              </>
            ) : null}
            {returning ? (
              <>
                <Button block onClick={() => setReturning(false)}>
                  Thôi
                </Button>
                <Button
                  block
                  variant="primary"
                  disabled={!note.trim() || review.isPending}
                  onClick={() => review.mutate({ accept: false, note: note.trim() })}
                >
                  Trả lại
                </Button>
              </>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  )
}

function stateLine(task: TaskDetail): string {
  switch (task.state) {
    case 'submitted':
      return `Đã nộp${task.submittedByName ? ` · ${task.submittedByName}` : ''} — chờ nghiệm thu`
    case 'done':
      return 'Xong'
    case 'cancelled':
      return `Đã huỷ${task.cancelReason ? `: ${task.cancelReason}` : ''}`
    default:
      return ''
  }
}
