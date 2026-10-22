import { TASK_PRIORITY_LABELS, type TaskDetail } from '@sora/contracts'
import { Badge, Button, ErrorState, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { api } from '../../api'
import { ReasonPrompt } from '../approval'
import { AttachmentLinks } from '../attachments'
import { Drawer } from '../Drawer'
import { Field, ListHead, TextArea } from '../form'
import { assigneeOf, DueText, formatDateTime, reviewerOf, TaskStateBadge } from './task-ui'

/**
 * Chi tiết một việc — dùng chung cho N1 (việc CỦA TÔI: tích, nộp) và N5 (việc tôi
 * GIAO hoặc quản lý: nghiệm thu, trả lại, huỷ). Nút nào hiện do máy chủ quyết
 * (`canSubmit`, `canReview`…) — giao diện không tự suy quyền.
 */
export function TaskDrawer({
  taskId,
  mode,
  onClose,
}: {
  taskId: number | null
  mode: 'mine' | 'manager'
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['task', mode, taskId],
    queryFn: () => (mode === 'mine' ? api.myTask(taskId!) : api.task(taskId!)),
    enabled: taskId !== null,
  })
  const task = detail.data

  return (
    <Drawer
      open={taskId !== null}
      onClose={onClose}
      title={task?.title ?? 'Việc'}
      subtitle={
        task ? (
          <span className="flex flex-wrap items-center gap-2">
            <TaskStateBadge state={task.state} />
            {task.priority === 'gap' ? <Badge tone="danger">Gấp</Badge> : null}
            {task.shiftLabel ? <span>{task.shiftLabel}</span> : null}
          </span>
        ) : undefined
      }
      footer={task ? <Actions task={task} mode={mode} onDone={onClose} /> : undefined}
    >
      {detail.isError ? <ErrorState message={(detail.error as Error).message} /> : null}
      {detail.isPending ? (
        <div className="grid gap-3">
          <Skeleton className="h-16" />
          <Skeleton className="h-40" />
        </div>
      ) : null}
      {task ? <Body task={task} mode={mode} /> : null}
    </Drawer>
  )
}

function Body({ task, mode }: { task: TaskDetail; mode: 'mine' | 'manager' }) {
  return (
    <div className="grid gap-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[length:var(--fs-c1)]">
        <Meta label="Người làm">{assigneeOf(task)}</Meta>
        <Meta label="Nghiệm thu">{reviewerOf(task)}</Meta>
        <Meta label="Hạn">
          <DueText task={task} />
        </Meta>
        <Meta label="Ưu tiên">{TASK_PRIORITY_LABELS[task.priority]}</Meta>
        <Meta label="Giao bởi">{task.createdByName ?? 'Việc định kỳ'}</Meta>
        <Meta label="Nhận việc">
          {task.acceptedAt ? formatDateTime(task.acceptedAt) : 'Chưa bấm nhận'}
        </Meta>
        {task.submittedAt ? (
          <Meta label="Nộp">
            {task.submittedByName} · {formatDateTime(task.submittedAt)}
          </Meta>
        ) : null}
        {task.entity === 'feedback' && task.entityId ? (
          <Meta label="Nguồn">
            <Link to="/phan-hoi" className="text-accent-ink hover:underline">
              Khiếu nại B13
            </Link>
          </Meta>
        ) : null}
        {task.entity === 'document' && task.entityId ? (
          <Meta label="Nguồn">
            <Link to={`/van-ban/${task.entityId}`} className="text-accent-ink hover:underline">
              Văn bản
            </Link>
          </Meta>
        ) : null}
      </dl>

      {task.note ? (
        <p className="text-[length:var(--fs-b2)] leading-relaxed whitespace-pre-wrap text-ink-hi">
          {task.note}
        </p>
      ) : null}
      <AttachmentLinks attachments={task.attachments} />

      {task.items.length > 0 ? <Checklist task={task} mode={mode} /> : null}

      {task.managerNote ? (
        <Note label={task.state === 'open' ? 'Bị trả lại vì' : 'Lời nghiệm thu'}>
          {task.managerNote}
        </Note>
      ) : null}
      {task.resultNote ? <Note label="Người làm ghi">{task.resultNote}</Note> : null}
      {task.cancelReason ? <Note label="Lý do huỷ">{task.cancelReason}</Note> : null}
    </div>
  )
}

/**
 * Checklist: tích là gửi ngay (cập nhật lạc quan, lỗi thì hoàn lại). Mỗi mục ghi
 * ai tích — việc của ca có nhiều người làm chung.
 */
function Checklist({ task, mode }: { task: TaskDetail; mode: 'mine' | 'manager' }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const key = ['task', mode, task.id]
  const toggle = useMutation({
    mutationFn: (v: { idx: number; checked: boolean }) =>
      api.checkMyTask(task.id, v.idx, v.checked),
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
      toast(err.message, 'danger')
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  })

  const done = task.items.filter((i) => i.checkedAt).length
  return (
    <div>
      <ListHead label={`Checklist · ${done}/${task.items.length}`} />
      <div className="grid gap-1">
        {task.items.map((item) => (
          <label
            key={item.idx}
            className="flex min-h-9 items-start gap-3 rounded-sm px-2 py-1.5 text-[length:var(--fs-b2)] hover:bg-surface-3"
          >
            <input
              type="checkbox"
              checked={item.checkedAt !== null}
              disabled={!task.canCheck}
              onChange={(e) => toggle.mutate({ idx: item.idx, checked: e.target.checked })}
              className="mt-0.5 size-4 flex-none accent-[var(--color-accent-strong)]"
            />
            <span className="min-w-0 flex-1 text-ink-hi">{item.label}</span>
            {item.checkedByName ? (
              <span className="flex-none text-[length:var(--fs-c1)] text-ink-mute">
                {item.checkedByName}
              </span>
            ) : null}
          </label>
        ))}
      </div>
    </div>
  )
}

function Actions({
  task,
  mode,
  onDone,
}: {
  task: TaskDetail
  mode: 'mine' | 'manager'
  onDone: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [note, setNote] = useState('')
  const [prompt, setPrompt] = useState<'return' | 'cancel' | null>(null)
  const refresh = () => {
    for (const key of ['tasks', 'task', 'my-tasks', 'org-inbox']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const accept = useMutation({
    mutationFn: () => api.acceptMyTask(task.id),
    onSuccess: () => {
      toast('Đã nhận việc', 'ok')
      refresh()
    },
    onError: fail,
  })
  const submit = useMutation({
    mutationFn: () => api.submitMyTask(task.id, note.trim() || null, null),
    onSuccess: (r) => {
      toast(r.state === 'done' ? 'Đã báo xong' : 'Đã nộp — chờ nghiệm thu', 'ok')
      refresh()
      onDone()
    },
    onError: fail,
  })
  const review = useMutation({
    mutationFn: (v: { accept: boolean; note: string | null }) =>
      mode === 'mine'
        ? api.reviewMyTask(task.id, v.accept, v.note)
        : api.reviewTask(task.id, v.accept, v.note),
    onSuccess: (r) => {
      toast(r.state === 'done' ? 'Đã nghiệm thu đạt' : 'Đã trả lại người làm', 'ok')
      refresh()
      onDone()
    },
    onError: fail,
  })
  const cancel = useMutation({
    mutationFn: (reason: string) => api.cancelTask(task.id, reason),
    onSuccess: () => {
      toast('Đã huỷ việc', 'ok')
      refresh()
      onDone()
    },
    onError: fail,
  })

  const unchecked = task.items.filter((i) => !i.checkedAt).length
  const any = task.canAccept || task.canSubmit || task.canReview || task.canCancel
  if (!any) return null

  return (
    <div className="grid gap-3">
      {prompt === 'return' ? (
        <ReasonPrompt
          label="Trả lại"
          placeholder="Cần làm lại gì"
          busy={review.isPending}
          onCancel={() => setPrompt(null)}
          onConfirm={(reason) => review.mutate({ accept: false, note: reason })}
        />
      ) : null}
      {prompt === 'cancel' ? (
        <ReasonPrompt
          label="Huỷ việc"
          placeholder="Vì sao không cần làm nữa"
          busy={cancel.isPending}
          onCancel={() => setPrompt(null)}
          onConfirm={(reason) => cancel.mutate(reason)}
        />
      ) : null}

      {task.canSubmit ? (
        <Field
          label="Ghi chú khi nộp"
          hint={
            unchecked > 0
              ? `Còn ${unchecked} mục chưa tích — ghi lý do thì mới nộp được.`
              : 'Không bắt buộc.'
          }
        >
          <TextArea value={note} onChange={setNote} rows={2} />
        </Field>
      ) : null}

      <div className="flex flex-wrap justify-end gap-2">
        {task.canCancel && prompt === null ? (
          <Button variant="ghost" onClick={() => setPrompt('cancel')}>
            Huỷ việc…
          </Button>
        ) : null}
        {task.canAccept ? (
          <Button disabled={accept.isPending} onClick={() => accept.mutate()}>
            Nhận việc
          </Button>
        ) : null}
        {task.canReview && prompt === null ? (
          <>
            <Button onClick={() => setPrompt('return')}>Trả lại…</Button>
            <Button
              variant="primary"
              disabled={review.isPending}
              onClick={() => review.mutate({ accept: true, note: null })}
            >
              Nghiệm thu đạt
            </Button>
          </>
        ) : null}
        {task.canSubmit ? (
          <Button
            variant="primary"
            disabled={submit.isPending || (unchecked > 0 && !note.trim())}
            onClick={() => submit.mutate()}
          >
            {task.reviewerName || task.reviewerPositionTitle ? 'Nộp nghiệm thu' : 'Báo xong'}
          </Button>
        ) : null}
      </div>
    </div>
  )
}

const Meta = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-ink-mute">{label}</dt>
    <dd className="mt-0.5 text-ink-hi">{children}</dd>
  </div>
)

const Note = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="rounded-sm border border-line-1 bg-canvas px-4 py-3">
    <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
      {label}
    </p>
    <p className="mt-1 text-[length:var(--fs-b2)] leading-relaxed whitespace-pre-wrap text-ink-hi">
      {children}
    </p>
  </div>
)
