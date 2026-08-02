import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type TimesheetDay, type TimesheetRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatDay, formatTime } from '../components/report'
import { useSession } from '../session-context'
import { formatMinutes } from './Attendance'

/**
 * H4 — Bảng công tháng.
 *
 * Đây là con số kỳ lương sẽ dùng, nên màn này hiện đúng thứ đó: giờ đã phân loại
 * theo hệ số tăng ca, không phải một tổng giờ thô rồi tin rằng bước sau chia
 * đúng. Người duyệt bảng công cần nhìn thấy chính cái họ đang duyệt.
 *
 * Ba thứ màn này cố ý làm nổi lên:
 *   · **Ngày thiếu công** — có ca mà không có bản ghi và cũng không có phép.
 *   · **Ca chưa chấm ra** — tính ra 0 phút, và chốt công lúc này là trả thiếu
 *     nguyên một ca. Kỳ lương từ chối chốt khi còn dòng nào như vậy.
 *   · **Dòng đã sửa tay** — ai sửa, vì sao. Giờ do kiosk ghi và giờ do người gõ
 *     có mức tin cậy khác nhau.
 *
 * Sau khi kỳ lương chốt công thì lưới chỉ đọc: sai thì bút toán công kỳ sau.
 */

const monthStart = () => new Date().toISOString().slice(0, 8) + '01'
const today = () => new Date().toISOString().slice(0, 10)

interface Draft {
  employeeId: number
  fullName: string
  workDate: string
  clockIn: string
  clockOut: string
  breakMinutes: number
  reason: string
}

export function Timesheet() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())
  const [draft, setDraft] = useState<Draft | null>(null)

  const mayEdit = can('timesheet.edit-manual')

  const grid = useQuery({
    queryKey: ['timesheet', branchId, from, to],
    queryFn: () => api.timesheet(branchId!, from, to),
    enabled: Boolean(branchId),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['timesheet'] })
    void queryClient.invalidateQueries({ queryKey: ['attendance'] })
  }

  const save = useMutation({
    mutationFn: (input: Draft) =>
      api.saveTimesheetEntry({
        branchId: branchId!,
        employeeId: input.employeeId,
        workDate: input.workDate,
        clockIn: input.clockIn,
        clockOut: input.clockOut || null,
        breakMinutes: input.breakMinutes,
        reason: input.reason,
      }),
    onSuccess: () => {
      toast('Đã lưu công', 'ok')
      setDraft(null)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const rows = grid.data?.rows ?? []
  const locked = grid.data?.locked ?? null
  const editable = mayEdit && locked === null

  return (
    <>
      <PageHeader
        title="Bảng công tháng"
        subtitle="Giờ công thực tế đã phân loại theo hệ số tăng ca — chính con số kỳ lương sẽ dùng."
        action={
          <div className="flex items-end gap-3">
            <Field label="Từ ngày">
              <DateInput value={from} onChange={setFrom} />
            </Field>
            <Field label="Đến ngày">
              <DateInput value={to} onChange={setTo} />
            </Field>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {grid.isError ? <ErrorState message={(grid.error as Error).message} /> : null}

        {locked ? (
          <p className="rounded-md border border-line-3 bg-surface-1 px-5 py-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Kỳ lương {formatDay(locked.periodStart)} – {formatDay(locked.periodEnd)} đã chốt công,
            nên khoảng này chỉ đọc. Sai thì ghi bút toán công ở kỳ sau, không sửa ngược.
          </p>
        ) : null}

        {draft ? (
          <EntryForm
            draft={draft}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => save.mutate(draft)}
            saving={save.isPending}
          />
        ) : null}

        <div className="mt-5 flex flex-col gap-4">
          {grid.isPending ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : rows.length === 0 ? (
            <p className="text-[length:var(--fs-b2)] text-ink-mute">
              Chi nhánh này chưa có hồ sơ nhân viên nào.
            </p>
          ) : (
            rows.map((row) => (
              <EmployeeCard
                key={row.employeeId}
                row={row}
                editable={editable}
                onEdit={(day) =>
                  setDraft({
                    employeeId: row.employeeId,
                    fullName: row.fullName,
                    workDate: day?.workDate ?? today(),
                    clockIn: day ? toHhMm(day.clockIn) : '08:00',
                    clockOut: day?.clockOut ? toHhMm(day.clockOut) : '',
                    breakMinutes: day?.breakMinutes ?? 0,
                    reason: '',
                  })
                }
              />
            ))
          )}
        </div>
      </div>
    </>
  )
}

function EmployeeCard({
  row,
  editable,
  onEdit,
}: {
  row: TimesheetRow
  editable: boolean
  onEdit: (day: TimesheetDay | null) => void
}) {
  const [open, setOpen] = useState(false)
  const totalMinutes = row.total.worked + row.total.otNormal + row.total.otRest + row.total.otHoliday

  return (
    <section className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
      <div className="grid grid-cols-[1fr_110px_110px_110px_110px_120px_150px] items-center gap-3 px-5 py-3">
        <span className="min-w-0">
          <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
            {row.fullName}
          </span>
          <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
            {row.position} · {row.days.length} ngày có công
          </span>
        </span>

        <Cell label="Giờ thường" value={formatMinutes(row.total.worked)} />
        <Cell label="TC 150%" value={row.total.otNormal ? formatMinutes(row.total.otNormal) : '—'} />
        <Cell label="TC 200%" value={row.total.otRest ? formatMinutes(row.total.otRest) : '—'} />
        <Cell label="TC 300%" value={row.total.otHoliday ? formatMinutes(row.total.otHoliday) : '—'} />
        <Cell label="Tổng" value={formatMinutes(totalMinutes)} strong />

        <span className="flex justify-end gap-2">
          {editable ? (
            <button
              type="button"
              onClick={() => onEdit(null)}
              className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
            >
              Thêm ngày
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(!open)}
            className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
          >
            {open ? 'Thu' : 'Chi tiết'}
          </button>
        </span>
      </div>

      {row.missingDays.length > 0 || row.openShifts > 0 || row.leaveDays > 0 ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line-1 px-5 py-2.5">
          {row.openShifts > 0 ? (
            <Badge tone="danger">{row.openShifts} ca chưa chấm ra</Badge>
          ) : null}
          {row.missingDays.length > 0 ? (
            <span className="text-[length:var(--fs-c1)] text-warn">
              Thiếu công {row.missingDays.length} ngày: {row.missingDays.map(formatDay).join(', ')}
            </span>
          ) : null}
          {row.leaveDays > 0 ? (
            <span className="text-[length:var(--fs-c1)] text-ink-mute">
              Nghỉ có phép {row.leaveDays} ngày
            </span>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="border-t border-line-1 bg-canvas">
          <div className="grid grid-cols-[120px_100px_100px_90px_1fr_120px] gap-3 border-b border-line-1 px-5 py-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Ngày</span>
            <span>Vào</span>
            <span>Ra</span>
            <span className="text-right">Công</span>
            <span>Nguồn</span>
            <span />
          </div>
          {row.days.length === 0 ? (
            <p className="px-5 py-3 text-[length:var(--fs-c1)] text-ink-mute">
              Chưa có ngày công nào trong khoảng này.
            </p>
          ) : (
            row.days.map((day) => (
              <div
                key={day.workDate}
                className="grid grid-cols-[120px_100px_100px_90px_1fr_120px] items-center gap-3 border-b border-line-1 px-5 py-2 last:border-b-0"
              >
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
                  {formatDay(day.workDate)}
                  {day.dayKind !== 'thuong' ? (
                    <span className="ml-1 text-accent-ink">
                      {day.dayKind === 'le' ? 'lễ' : 'nghỉ'}
                    </span>
                  ) : null}
                </span>
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
                  {formatTime(day.clockIn)}
                </span>
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
                  {day.clockOut ? formatTime(day.clockOut) : <span className="text-danger">chưa ra</span>}
                </span>
                <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-hi">
                  {formatMinutes(day.worked + day.otNormal + day.otRest + day.otHoliday)}
                </span>
                <span className="min-w-0 text-[length:var(--fs-c1)] text-ink-mute">
                  {day.source === 'manual' ? (
                    <span className="truncate">
                      sửa tay · {day.editedBy ?? '?'} · {day.editReason}
                    </span>
                  ) : day.source === 'kiosk' ? (
                    'kiosk'
                  ) : (
                    'suy từ phiên POS'
                  )}
                </span>
                <span className="flex justify-end">
                  {editable ? (
                    <button
                      type="button"
                      onClick={() => onEdit(day)}
                      className="h-7 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                    >
                      Sửa
                    </button>
                  ) : null}
                </span>
              </div>
            ))
          )}
        </div>
      ) : null}
    </section>
  )
}

function Cell({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <span className="text-right">
      <span className="block text-[length:var(--fs-c2)] tracking-[0.08em] text-ink-mute uppercase">
        {label}
      </span>
      <span
        className={`mt-0.5 block font-mono text-[length:var(--fs-b2)] ${
          strong ? 'text-ink-hi' : 'text-ink-body'
        }`}
      >
        {value}
      </span>
    </span>
  )
}

function EntryForm({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: Draft
  onChange: (next: Draft) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => onChange({ ...draft, [key]: value })

  return (
    <section className="mt-4 rounded-md border border-accent bg-surface-1 p-5">
      <p className="text-[length:var(--fs-b2)] text-ink-hi">Sửa công · {draft.fullName}</p>

      <div className="mt-4 grid gap-4 lg:grid-cols-5">
        <Field label="Ngày">
          <DateInput value={draft.workDate} onChange={(v) => set('workDate', v)} />
        </Field>
        <Field label="Giờ vào">
          <Input value={draft.clockIn} onChange={(v) => set('clockIn', v)} placeholder="08:00" />
        </Field>
        <Field label="Giờ ra (để trống nếu chưa ra)">
          <Input value={draft.clockOut} onChange={(v) => set('clockOut', v)} placeholder="17:00" />
        </Field>
        <Field label="Nghỉ giữa ca (phút)">
          <Input
            value={String(draft.breakMinutes)}
            onChange={(v) => set('breakMinutes', Number(v) || 0)}
            type="number"
          />
        </Field>
        <Field label="Lý do sửa (bắt buộc)">
          <Input
            value={draft.reason}
            onChange={(v) => set('reason', v)}
            placeholder="Quên chấm ra, đã đối chiếu camera"
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <p className="max-w-[560px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Giờ ra nhỏ hơn giờ vào được hiểu là ca vắt qua nửa đêm. Quản lý ca sửa công cần một người
          khác duyệt bằng PIN — hệ sẽ hỏi khi bấm lưu.
        </p>
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel}>Bỏ</Button>
          <Button
            variant="primary"
            disabled={saving || draft.reason.trim() === '' || draft.clockIn.trim() === ''}
            onClick={onSave}
          >
            Lưu công
          </Button>
        </div>
      </div>
    </section>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
    />
  )
}

/** ISO có múi giờ → 'HH:MM' theo giờ địa phương của trình duyệt */
function toHhMm(iso: string): string {
  const at = new Date(iso)
  return `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`
}
