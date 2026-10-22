import {
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_SEVERITY_LABELS,
  INCIDENT_STATE_LABELS,
  formatVnd,
  type IncidentDetail,
} from '@sora/contracts'
import { safeHref } from '@sora/core'
import { Badge, Button, ErrorState, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api } from '../../api'
import { ReasonPrompt } from '../approval'
import { Drawer } from '../Drawer'
import { Field, ListHead, NumberInput, Select, TextArea, TextInput } from '../form'
import { DueText, TaskStateBadge, formatDateTime } from '../tasks/task-ui'

/**
 * N8 — Một sự cố: điều tra (nguyên nhân gốc, biện pháp, thiệt hại ước tính), giao
 * việc khắc phục, ghi mốc khai báo ra ngoài, đóng. Nút "Đóng" chỉ hiện khi máy
 * chủ nói người này đóng được; lý do không đóng được máy chủ trả bằng chữ.
 */
export function IncidentDrawer({
  incidentId,
  onClose,
}: {
  incidentId: number | null
  onClose: () => void
}) {
  const detail = useQuery({
    queryKey: ['incident', incidentId],
    queryFn: () => api.incident(incidentId!),
    enabled: incidentId !== null,
  })
  const incident = detail.data
  return (
    <Drawer
      open={incidentId !== null}
      onClose={onClose}
      width={720}
      title={incident ? `${incident.code} · ${incident.title}` : 'Sự cố'}
      subtitle={
        incident ? (
          <span className="flex flex-wrap items-center gap-2">
            <Badge tone={incident.state === 'closed' ? 'ok' : 'warn'}>
              {INCIDENT_STATE_LABELS[incident.state]}
            </Badge>
            <Badge
              tone={
                incident.severity === 'nhe' || incident.severity === 'trung-binh'
                  ? 'neutral'
                  : 'danger'
              }
            >
              {INCIDENT_SEVERITY_LABELS[incident.severity]}
            </Badge>
            <span>{INCIDENT_CATEGORY_LABELS[incident.category]}</span>
          </span>
        ) : undefined
      }
    >
      {detail.isError ? <ErrorState message={(detail.error as Error).message} /> : null}
      {detail.isPending ? <Skeleton className="h-64" /> : null}
      {incident ? <Body key={incident.id} incident={incident} onDone={onClose} /> : null}
    </Drawer>
  )
}

function Body({ incident, onDone }: { incident: IncidentDetail; onDone: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [rootCause, setRootCause] = useState(incident.rootCause ?? '')
  const [corrective, setCorrective] = useState(incident.correctiveAction ?? '')
  const [loss, setLoss] = useState<number | null>(incident.lossEstimateVnd)
  const [externalRef, setExternalRef] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  const [taskOwner, setTaskOwner] = useState('')
  const [closing, setClosing] = useState(false)
  const people = useQuery({
    queryKey: ['task-assignees'],
    queryFn: api.assignees,
    enabled: incident.canEdit,
  })

  const refresh = () => {
    for (const key of ['incident', 'incidents', 'org-inbox', 'tasks']) {
      void queryClient.invalidateQueries({ queryKey: [key] })
    }
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const save = useMutation({
    mutationFn: () =>
      api.updateIncident(incident.id, {
        rootCause: rootCause.trim() || null,
        correctiveAction: corrective.trim() || null,
        lossEstimateVnd: loss,
      }),
    onSuccess: () => {
      toast('Đã lưu điều tra', 'ok')
      refresh()
    },
    onError: fail,
  })
  const addTask = useMutation({
    mutationFn: () =>
      api.addIncidentTask(incident.id, {
        title: taskTitle.trim(),
        note: `Khắc phục sự cố ${incident.code}: ${incident.title}`,
        assigneeStaffIds: [Number(taskOwner)],
        dueAt: null,
      }),
    onSuccess: () => {
      setTaskTitle('')
      toast('Đã giao việc khắc phục', 'ok')
      refresh()
    },
    onError: fail,
  })
  const external = useMutation({
    mutationFn: () =>
      api.reportIncidentExternally(incident.id, new Date().toISOString(), externalRef.trim()),
    onSuccess: () => {
      toast('Đã ghi mốc khai báo', 'ok')
      refresh()
    },
    onError: fail,
  })
  const close = useMutation({
    mutationFn: (note: string) => api.closeIncident(incident.id, note),
    onSuccess: () => {
      toast('Đã đóng sự cố', 'ok')
      refresh()
      onDone()
    },
    onError: fail,
  })

  return (
    <div className="grid gap-5">
      <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[length:var(--fs-c1)]">
        <Meta label="Xảy ra">{formatDateTime(incident.occurredAt)}</Meta>
        <Meta label="Người báo">
          {incident.reportedByName} · {formatDateTime(incident.reportedAt)}
        </Meta>
        <Meta label="Người bị thương">{incident.injuredCount}</Meta>
        <Meta label="Khách liên quan">{incident.customerInvolved ? 'Có' : 'Không'}</Meta>
      </dl>
      <p className="text-[length:var(--fs-b2)] leading-relaxed whitespace-pre-wrap text-ink-hi">
        {incident.description}
      </p>
      {incident.immediateAction ? (
        <p className="text-[length:var(--fs-b2)] text-ink-body">
          Đã làm ngay: {incident.immediateAction}
        </p>
      ) : null}
      {incident.evidenceUrls.length > 0 ? (
        <div className="grid gap-1">
          {incident.evidenceUrls.map((u) => {
            const href = safeHref(u)
            return href ? (
              <a
                key={u}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[length:var(--fs-b2)] text-accent-ink hover:underline"
              >
                {u}
              </a>
            ) : null
          })}
        </div>
      ) : null}

      {incident.externalReportRequired ? (
        <div className="rounded-sm border border-warn px-4 py-3 text-[length:var(--fs-b2)] text-ink-hi">
          {incident.externalReportedAt ? (
            <>
              Đã khai báo ra ngoài {formatDateTime(incident.externalReportedAt)}:{' '}
              {incident.externalReportRef}
            </>
          ) : (
            <div className="grid gap-2">
              <span className="font-semibold">
                Phải khai báo với cơ quan chức năng — chưa có mốc khai báo.
              </span>
              {incident.canEdit ? (
                <div className="flex gap-2">
                  <TextInput
                    value={externalRef}
                    onChange={setExternalRef}
                    placeholder="Đã báo ai, lúc nào, số công văn nếu có"
                  />
                  <Button
                    disabled={!externalRef.trim() || external.isPending}
                    onClick={() => external.mutate()}
                  >
                    Ghi mốc khai báo
                  </Button>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}

      <div className="grid gap-3">
        <ListHead label="Điều tra" />
        <Field label="Nguyên nhân gốc">
          <TextArea
            value={rootCause}
            onChange={setRootCause}
            rows={2}
            disabled={!incident.canEdit}
          />
        </Field>
        <Field label="Biện pháp khắc phục, phòng ngừa">
          <TextArea
            value={corrective}
            onChange={setCorrective}
            rows={2}
            disabled={!incident.canEdit}
          />
        </Field>
        <Field label="Thiệt hại ước tính (₫)" hint={loss ? formatVnd(loss) : undefined}>
          <NumberInput
            value={loss}
            onChange={setLoss}
            min={0}
            step={10000}
            disabled={!incident.canEdit}
            width={200}
          />
        </Field>
        {incident.canEdit ? (
          <div>
            <Button disabled={save.isPending} onClick={() => save.mutate()}>
              Lưu điều tra
            </Button>
          </div>
        ) : null}
      </div>

      <div>
        <ListHead label={`Việc khắc phục · ${incident.tasks.length}`} />
        <div className="grid gap-1">
          {incident.tasks.map((t) => (
            <div
              key={t.id}
              className="grid grid-cols-[minmax(0,1fr)_160px_170px_130px] items-center gap-3 text-[length:var(--fs-b2)]"
            >
              <span className="truncate text-ink-hi">{t.title}</span>
              <span className="truncate text-ink-body">{t.assigneeName}</span>
              <DueText task={t} />
              <TaskStateBadge state={t.state} />
            </div>
          ))}
          {incident.tasks.length === 0 ? (
            <p className="text-[length:var(--fs-c1)] text-ink-mute">
              Chưa giao việc khắc phục nào.
            </p>
          ) : null}
        </div>
        {incident.canEdit ? (
          <div className="mt-3 flex gap-2">
            <TextInput
              value={taskTitle}
              onChange={setTaskTitle}
              placeholder="Việc cần làm để không tái diễn"
            />
            <Select
              value={taskOwner}
              width={220}
              placeholder="Giao cho…"
              options={(people.data ?? []).map((p) => ({
                value: String(p.staffId),
                label: p.fullName,
              }))}
              onChange={setTaskOwner}
            />
            <Button
              disabled={!taskTitle.trim() || !taskOwner || addTask.isPending}
              onClick={() => addTask.mutate()}
            >
              Giao việc
            </Button>
          </div>
        ) : null}
      </div>

      {incident.state === 'closed' ? (
        <p className="rounded-sm border border-line-1 bg-canvas px-4 py-3 text-[length:var(--fs-b2)] text-ink-hi">
          Đã đóng {formatDateTime(incident.closedAt)} bởi {incident.closedByName}
          {incident.closeNote ? `: ${incident.closeNote}` : ''}
        </p>
      ) : incident.canClose ? (
        closing ? (
          <ReasonPrompt
            label="Đóng sự cố"
            placeholder="Kết luận ngắn"
            busy={close.isPending}
            onCancel={() => setClosing(false)}
            onConfirm={(note) => close.mutate(note)}
          />
        ) : (
          <div className="flex justify-end">
            <Button variant="primary" onClick={() => setClosing(true)}>
              Đóng sự cố…
            </Button>
          </div>
        )
      ) : (
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          Sự cố nghiêm trọng do quản lý chuỗi hoặc chủ đóng; người báo không tự đóng.
        </p>
      )}
    </div>
  )
}

const Meta = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-ink-mute">{label}</dt>
    <dd className="mt-0.5 text-ink-hi">{children}</dd>
  </div>
)
