import {
  TASK_CHECKLIST_MAX,
  TASK_PRIORITY_LABELS,
  type DocAttachment,
  type TaskEntity,
  type TaskPriority,
} from '@sora/contracts'
import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../api'
import { AttachmentEditor, attachmentsReady } from '../attachments'
import { Drawer } from '../Drawer'
import {
  DateInput,
  Field,
  LineList,
  ListHead,
  SearchField,
  SegmentedControl,
  Select,
  TextArea,
  TextInput,
} from '../form'

/** Nguồn dựng sẵn khi giao việc từ màn khác — khiếu nại B13, văn bản N4 */
export interface TaskPreset {
  title: string
  note: string | null
  entity: TaskEntity | null
  entityId: number | null
}

const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

/** Giờ Việt Nam cố định +07:00 — không đổi giờ theo mùa */
const toIso = (date: string, time: string) => new Date(`${date}T${time}:00+07:00`).toISOString()

type Reviewer = 'toi' | 'khong' | `${number}`

/**
 * N5 — Giao việc. Mỗi người nhận ra MỘT việc riêng: nộp, nghiệm thu, quá hạn tính
 * theo người. Danh sách người nhận là người TRONG PHẠM VI theo sơ đồ — máy chủ
 * vẫn kiểm lại. Chọn theo chức danh là lối tắt: tick sẵn mọi người đang giữ ghế.
 */
export function TaskFormDrawer({
  open,
  preset,
  onClose,
}: {
  open: boolean
  preset?: TaskPreset
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const people = useQuery({ queryKey: ['task-assignees'], queryFn: api.assignees, enabled: open })
  const chart = useQuery({
    queryKey: ['org', 'chart'],
    queryFn: () => api.orgChart(),
    enabled: open,
  })

  const [title, setTitle] = useState(preset?.title ?? '')
  const [note, setNote] = useState(preset?.note ?? '')
  const [picked, setPicked] = useState<number[]>([])
  const [search, setSearch] = useState('')
  const [reviewer, setReviewer] = useState<Reviewer>('toi')
  const [priority, setPriority] = useState<TaskPriority>('thuong')
  const [dueDate, setDueDate] = useState(todayVN())
  const [dueTime, setDueTime] = useState('17:00')
  const [checklist, setChecklist] = useState<string[]>([])
  const [attachments, setAttachments] = useState<DocAttachment[]>([])

  const assignable = people.data ?? []
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase()
    return assignable.filter(
      (p) =>
        !needle ||
        p.fullName.toLowerCase().includes(needle) ||
        (p.title?.toLowerCase().includes(needle) ?? false),
    )
  }, [assignable, search])

  // Ghế có ít nhất một người ĐANG giữ nằm trong danh sách được giao
  const seats = useMemo(() => {
    const allowed = new Set(assignable.map((p) => p.staffId))
    const unitName = new Map((chart.data?.units ?? []).map((u) => [u.id, u.name]))
    return (chart.data?.positions ?? [])
      .map((p) => ({
        id: p.id,
        label: `${p.title} — ${unitName.get(p.unitId) ?? ''}`,
        ids: p.holders
          .filter((h) => !h.upcoming)
          .map((h) => h.staffId)
          .filter((id) => allowed.has(id)),
      }))
      .filter((p) => p.ids.length > 0)
  }, [chart.data, assignable])

  const create = useMutation({
    mutationFn: () =>
      api.createTask({
        title: title.trim(),
        note: note.trim() || null,
        priority,
        assigneeStaffIds: picked,
        ...(reviewer === 'toi'
          ? {}
          : { reviewerStaffId: reviewer === 'khong' ? null : Number(reviewer) }),
        dueAt: toIso(dueDate, dueTime),
        checklist: checklist.map((c) => c.trim()).filter(Boolean),
        attachments,
        entity: preset?.entity ?? null,
        entityId: preset?.entityId ?? null,
      }),
    onSuccess: (r) => {
      toast(r.ids.length > 1 ? `Đã giao việc cho ${r.ids.length} người` : 'Đã giao việc', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const due = toIso(dueDate, dueTime)
  const ready =
    title.trim() &&
    picked.length > 0 &&
    new Date(due).getTime() > Date.now() &&
    attachmentsReady(attachments) &&
    !(reviewer !== 'toi' && reviewer !== 'khong' && picked.includes(Number(reviewer)))

  const toggle = (id: number) =>
    setPicked(picked.includes(id) ? picked.filter((x) => x !== id) : [...picked, id])

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="Giao việc"
      subtitle="Mỗi người nhận một việc riêng. Người nhận thấy việc trên Kênh nhân viên hoặc Bàn làm việc."
      width={720}
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Thôi</Button>
          <Button
            variant="primary"
            disabled={!ready || create.isPending}
            onClick={() => create.mutate()}
          >
            Giao việc
          </Button>
        </div>
      }
    >
      <div className="grid gap-5">
        <Field label="Việc cần làm">
          <TextInput
            value={title}
            onChange={setTitle}
            placeholder="Lau quạt hút khu A trước 17:00"
          />
        </Field>

        <div>
          <ListHead
            label={`Người nhận · ${picked.length}`}
            hint="Chỉ hiện người trong phạm vi bạn quản lý theo sơ đồ tổ chức."
          >
            <Select
              value=""
              width={260}
              placeholder="Chọn cả ghế…"
              options={seats.map((s) => ({
                value: String(s.id),
                label: `${s.label} (${s.ids.length})`,
              }))}
              onChange={(id) => {
                const seat = seats.find((s) => String(s.id) === id)
                if (seat) setPicked([...new Set([...picked, ...seat.ids])])
              }}
            />
          </ListHead>
          {people.isError ? <ErrorState message={(people.error as Error).message} /> : null}
          <SearchField value={search} onChange={setSearch} placeholder="Tìm tên hoặc chức danh" />
          <div className="mt-2 grid max-h-[220px] gap-0.5 overflow-y-auto rounded-sm border border-line-1 p-1">
            {visible.map((p) => (
              <label
                key={p.staffId}
                className="flex min-h-9 items-center gap-3 rounded-sm px-2 text-[length:var(--fs-b2)] hover:bg-surface-3"
              >
                <input
                  type="checkbox"
                  checked={picked.includes(p.staffId)}
                  onChange={() => toggle(p.staffId)}
                  className="size-4 accent-[var(--color-accent-strong)]"
                />
                <span className="min-w-0 flex-1 truncate text-ink-hi">{p.fullName}</span>
                <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
                  {[p.title, p.unitName].filter(Boolean).join(' · ') || 'Chưa xếp ghế'}
                </span>
              </label>
            ))}
            {people.data && visible.length === 0 ? (
              <p className="px-2 py-3 text-[length:var(--fs-c1)] text-ink-mute">
                Không có ai trong phạm vi khớp tìm kiếm.
              </p>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-[1fr_1fr] gap-4">
          <Field label="Hạn — ngày">
            <DateInput value={dueDate} onChange={setDueDate} className="w-full" />
          </Field>
          <Field label="Hạn — giờ">
            <TextInput type="time" mono value={dueTime} onChange={setDueTime} />
          </Field>
          <Field label="Nghiệm thu">
            <Select
              value={reviewer}
              onChange={(v) => setReviewer(v)}
              options={[
                { value: 'toi', label: 'Tôi nghiệm thu' },
                { value: 'khong', label: 'Không cần — nộp là xong' },
                ...assignable
                  .filter((p) => !picked.includes(p.staffId))
                  .map((p) => ({ value: `${p.staffId}` as Reviewer, label: p.fullName })),
              ]}
            />
          </Field>
          <Field label="Ưu tiên">
            <SegmentedControl
              value={priority}
              onChange={setPriority}
              options={(['thuong', 'gap'] as const).map((value) => ({
                value,
                label: TASK_PRIORITY_LABELS[value],
              }))}
            />
          </Field>
        </div>

        <Field label="Ghi chú">
          <TextArea value={note} onChange={setNote} rows={3} />
        </Field>

        <LineList
          label="Checklist (tuỳ chọn)"
          hint="Mỗi dòng một mục người làm phải tích trước khi nộp."
          placeholder="Tháo lưới lọc"
          value={checklist}
          disabled={false}
          max={TASK_CHECKLIST_MAX}
          onChange={setChecklist}
        />

        <AttachmentEditor
          value={attachments}
          onChange={setAttachments}
          hint="Hướng dẫn, ảnh hiện trạng — dán đường dẫn https."
        />
      </div>
    </Drawer>
  )
}
