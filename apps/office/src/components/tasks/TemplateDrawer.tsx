import {
  TASK_CHECKLIST_MAX,
  TASK_MONTH_DAY_MAX,
  TASK_PRIORITY_LABELS,
  TASK_RECURRENCE_LABELS,
  TASK_RECURRENCES,
  WEEKDAY_LABELS,
  type OrgChart,
  type TaskPriority,
  type TaskRecurrence,
  type TaskTemplateView,
} from '@sora/contracts'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api, type ShiftTemplate, type TaskTemplateInput } from '../../api'
import { Drawer } from '../Drawer'
import {
  Field,
  LineList,
  NumberInput,
  SegmentedControl,
  Select,
  TextArea,
  TextInput,
  Toggle,
} from '../form'

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

const toMinute = (value: string) => {
  const [h, m] = value.split(':').map(Number)
  return (h ?? 0) * 60 + (m ?? 0)
}

const blank = (): TaskTemplateInput => ({
  title: '',
  note: null,
  checklist: [''],
  assigneePositionId: 0,
  reviewerPositionId: null,
  recurrence: 'theo-ca',
  weekday: null,
  monthDay: null,
  shiftTemplateId: null,
  dueMinute: null,
  priority: 'thuong',
  documentId: null,
  startsOn: null,
  active: true,
})

const fromView = (t: TaskTemplateView): TaskTemplateInput => ({
  title: t.title,
  note: t.note,
  checklist: t.checklist,
  assigneePositionId: t.assigneePositionId,
  reviewerPositionId: t.reviewerPositionId,
  recurrence: t.recurrence,
  weekday: t.weekday,
  monthDay: t.monthDay,
  shiftTemplateId: t.shiftTemplateId,
  dueMinute: t.dueMinute,
  priority: t.priority,
  documentId: t.documentId,
  startsOn: t.startsOn,
  active: t.active,
})

/**
 * N6 — Một mẫu việc định kỳ (SOP). Giao cho CHỨC DANH, không cho người: ai giữ ghế
 * và đứng ca đã công bố thì thấy. Sửa mẫu chỉ áp cho việc sinh từ nay — việc đã
 * giao giữ nguyên tiêu đề và checklist.
 */
export function TemplateDrawer({
  template,
  branchId,
  chart,
  shifts,
  onClose,
}: {
  template: TaskTemplateView | null
  /** Chi nhánh đang xem — lọc ghế và ca mẫu */
  branchId: string
  chart: OrgChart | undefined
  shifts: ShiftTemplate[]
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<TaskTemplateInput>(() =>
    template ? fromView(template) : blank(),
  )
  const set = <K extends keyof TaskTemplateInput>(key: K, value: TaskTemplateInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))

  const docs = useQuery({ queryKey: ['docs', 'register'], queryFn: () => api.documents() })

  // Ghế thuộc cây của chi nhánh đang xem
  const seats = useMemo(() => {
    if (!chart) return []
    const branchUnit = chart.units.find((u) => u.branchId === branchId)
    if (!branchUnit) return []
    const inBranch = new Set<number>([branchUnit.id])
    let grew = true
    while (grew) {
      grew = false
      for (const u of chart.units) {
        if (u.parentId !== null && inBranch.has(u.parentId) && !inBranch.has(u.id)) {
          inBranch.add(u.id)
          grew = true
        }
      }
    }
    const unitName = new Map(chart.units.map((u) => [u.id, u.name]))
    return chart.positions
      .filter((p) => inBranch.has(p.unitId))
      .map((p) => ({ value: String(p.id), label: `${p.title} — ${unitName.get(p.unitId)}` }))
  }, [chart, branchId])

  const save = useMutation({
    mutationFn: () => {
      const body = {
        ...form,
        checklist: form.checklist.map((c) => c.trim()).filter(Boolean),
        note: form.note?.trim() || null,
      }
      return template ? api.updateTaskTemplate(template.id, body) : api.createTaskTemplate(body)
    },
    onSuccess: () => {
      toast(template ? 'Đã lưu mẫu việc' : 'Đã tạo mẫu việc — việc hôm nay đã sinh', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['task-templates'] })
      void queryClient.invalidateQueries({ queryKey: ['tasks'] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const changeRecurrence = (recurrence: TaskRecurrence) =>
    setForm((f) => ({
      ...f,
      recurrence,
      weekday: recurrence === 'hang-tuan' ? (f.weekday ?? 1) : null,
      monthDay: recurrence === 'hang-thang' ? (f.monthDay ?? 1) : null,
      shiftTemplateId:
        recurrence === 'theo-ca' ? (f.shiftTemplateId ?? shifts[0]?.id ?? null) : null,
      dueMinute: recurrence === 'theo-ca' ? f.dueMinute : (f.dueMinute ?? 16 * 60),
    }))

  const ready =
    form.title.trim() &&
    form.assigneePositionId > 0 &&
    form.checklist.some((c) => c.trim()) &&
    form.reviewerPositionId !== form.assigneePositionId &&
    (form.recurrence !== 'theo-ca' || form.shiftTemplateId !== null) &&
    (form.recurrence === 'theo-ca' || form.dueMinute !== null)

  return (
    <Drawer
      open
      onClose={onClose}
      title={template ? 'Sửa mẫu việc định kỳ' : 'Mẫu việc định kỳ mới'}
      subtitle="Giao cho chức danh. Theo ca: chỉ người đứng ca đã công bố mới thấy, hạn mặc định là giờ kết ca."
      width={720}
      footer={
        <div className="flex items-center justify-between gap-2">
          {template ? (
            <Toggle on={form.active} onChange={(v) => set('active', v)} tone="ok">
              {form.active ? 'Đang dùng' : 'Đã tắt'}
            </Toggle>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button onClick={onClose}>Thôi</Button>
            <Button
              variant="primary"
              disabled={!ready || save.isPending}
              onClick={() => save.mutate()}
            >
              {template ? 'Lưu mẫu' : 'Tạo mẫu'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-5">
        <Field label="Tên việc">
          <TextInput
            value={form.title}
            onChange={(v) => set('title', v)}
            placeholder="Mở ca – Sảnh"
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Ghế làm" hint="Ai giữ ghế này và đứng ca thì thấy việc.">
            <Select
              value={form.assigneePositionId ? String(form.assigneePositionId) : ''}
              placeholder="Chọn chức danh…"
              options={seats}
              onChange={(v) => set('assigneePositionId', Number(v))}
            />
          </Field>
          <Field label="Ghế nghiệm thu" hint="Để trống thì nộp là xong.">
            <Select
              value={form.reviewerPositionId ? String(form.reviewerPositionId) : ''}
              placeholder="Không cần nghiệm thu"
              options={seats.filter((s) => s.value !== String(form.assigneePositionId))}
              onChange={(v) => set('reviewerPositionId', v ? Number(v) : null)}
            />
          </Field>
        </div>

        <Field label="Lặp lại">
          <SegmentedControl
            value={form.recurrence}
            onChange={changeRecurrence}
            options={TASK_RECURRENCES.map((value) => ({
              value,
              label: TASK_RECURRENCE_LABELS[value],
            }))}
          />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          {form.recurrence === 'theo-ca' ? (
            <Field
              label="Ca mẫu"
              hint={shifts.length === 0 ? 'Chi nhánh chưa có ca mẫu — tạo ở H2 trước.' : undefined}
            >
              <Select
                value={form.shiftTemplateId ? String(form.shiftTemplateId) : ''}
                placeholder="Chọn ca…"
                options={shifts.map((s) => ({
                  value: String(s.id),
                  label: `${s.name} ${hhmm(s.startMinute)}–${hhmm(s.endMinute)}`,
                }))}
                onChange={(v) => set('shiftTemplateId', Number(v))}
              />
            </Field>
          ) : null}
          {form.recurrence === 'hang-tuan' ? (
            <Field label="Thứ">
              <Select
                value={String(form.weekday ?? 1)}
                options={Object.entries(WEEKDAY_LABELS).map(([value, label]) => ({ value, label }))}
                onChange={(v) => set('weekday', Number(v))}
              />
            </Field>
          ) : null}
          {form.recurrence === 'hang-thang' ? (
            <Field label="Ngày trong tháng" hint={`1–${TASK_MONTH_DAY_MAX}: tháng nào cũng có.`}>
              <NumberInput
                value={form.monthDay}
                min={1}
                max={TASK_MONTH_DAY_MAX}
                onChange={(v) => set('monthDay', v)}
              />
            </Field>
          ) : null}
          <Field
            label="Hạn trong ngày"
            hint={form.recurrence === 'theo-ca' ? 'Để trống = giờ kết ca.' : undefined}
          >
            <div className="flex gap-2">
              <TextInput
                type="time"
                mono
                value={form.dueMinute === null ? '' : hhmm(form.dueMinute)}
                onChange={(v) => set('dueMinute', v ? toMinute(v) : null)}
              />
              {form.recurrence === 'theo-ca' && form.dueMinute !== null ? (
                <Button size="sm" variant="ghost" onClick={() => set('dueMinute', null)}>
                  Giờ kết ca
                </Button>
              ) : null}
            </div>
          </Field>
          <Field label="Ưu tiên">
            <SegmentedControl
              value={form.priority}
              onChange={(v: TaskPriority) => set('priority', v)}
              options={(['thuong', 'gap'] as const).map((value) => ({
                value,
                label: TASK_PRIORITY_LABELS[value],
              }))}
            />
          </Field>
        </div>

        <LineList
          label="Checklist"
          hint="Mỗi dòng một mục kiểm, người đứng ca tích trên điện thoại. Mỗi mục ghi tên người tích."
          placeholder="Khoá van gas tổng"
          value={form.checklist}
          disabled={false}
          max={TASK_CHECKLIST_MAX}
          onChange={(v) => set('checklist', v)}
        />

        <Field label="Văn bản hướng dẫn" hint="Quy trình chi tiết đã ban hành ở N4 — tuỳ chọn.">
          <Select
            value={form.documentId ? String(form.documentId) : ''}
            placeholder="Không gắn văn bản"
            options={(docs.data ?? [])
              .filter((d) => d.state === 'issued')
              .map((d) => ({ value: String(d.id), label: `${d.number} · ${d.title}` }))}
            onChange={(v) => set('documentId', v ? Number(v) : null)}
          />
        </Field>

        <Field label="Ghi chú">
          <TextArea value={form.note ?? ''} onChange={(v) => set('note', v)} rows={2} />
        </Field>
      </div>
    </Drawer>
  )
}
