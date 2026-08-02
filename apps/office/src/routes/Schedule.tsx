import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type DayKind, type ScheduleCell, type ScheduleWeek } from '../api'
import { PageHeader } from '../components/PageHeader'
import { DateInput, formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * H2 — Xếp lịch tuần.
 *
 * Lưới ngày × người, và một quy tắc quyết định toàn bộ hành vi: **lịch nháp thì
 * nhân viên không thấy, và giờ công CHƯA tính**. Công bố là hành động riêng, có
 * chủ đích — nếu giờ công tính từ lúc kéo thả thì mọi lần thử sắp lịch đều thành
 * cam kết trả lương.
 *
 * Không có chấm công (H3/H10 chưa dựng) nên lịch đã công bố CHÍNH LÀ bảng công.
 * Vì vậy sửa lịch của tuần đã qua đi qua quyền `timesheet.edit-manual` — quản lý
 * ca phải xin duyệt, đúng dòng của §4.2b.
 */

const WEEKDAYS = ['Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy', 'Chủ nhật']

const DAY_KIND_LABELS: Record<DayKind, string> = {
  thuong: 'Ngày thường',
  nghi: 'Ngày nghỉ · 200%',
  le: 'Ngày lễ · 300%',
}

const hhmm = (minute: number) =>
  `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`

const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}g` : `${h}g${String(m).padStart(2, '0')}`
}

/** Thứ Hai của tuần chứa ngày đã cho */
function mondayOf(iso: string): string {
  const at = new Date(`${iso}T00:00:00Z`)
  const offset = (at.getUTCDay() + 6) % 7
  at.setUTCDate(at.getUTCDate() - offset)
  return at.toISOString().slice(0, 10)
}

function addDays(iso: string, days: number): string {
  const at = new Date(`${iso}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

export function Schedule() {
  const { branchId } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [weekStart, setWeekStart] = useState(() => mondayOf(new Date().toISOString().slice(0, 10)))
  const [editing, setEditing] = useState<{ employeeId: number; workDate: string } | null>(null)

  const week = useQuery({
    queryKey: ['schedule', branchId, weekStart],
    queryFn: () => api.scheduleWeek(branchId!, weekStart),
    enabled: Boolean(branchId),
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['schedule'] })
  const fail = (err: Error) => toast(err.message, 'danger')

  const setCells = useMutation({
    mutationFn: (input: { employeeId: number; cells: Omit<ScheduleCell, 'id' | 'state'>[] }) =>
      api.setScheduleWeek({ branchId: branchId!, weekStart, ...input }),
    onSuccess: () => {
      setEditing(null)
      refresh()
    },
    onError: fail,
  })

  const publish = useMutation({
    mutationFn: () => api.publishSchedule(branchId!, weekStart),
    onSuccess: (result) => {
      toast(
        result.published === 0
          ? 'Không có ca nháp nào để công bố'
          : `Đã công bố ${result.published} ca — giờ công bắt đầu tính từ đây`,
        'ok',
      )
      refresh()
    },
    onError: fail,
  })

  const copyPrevious = useMutation({
    mutationFn: () => api.copyPreviousWeek(branchId!, weekStart),
    onSuccess: (result) => {
      toast(`Đã chép ${result.copied} ca sang dạng nháp — kiểm lại rồi công bố`, 'ok')
      refresh()
    },
    onError: fail,
  })

  const data = week.data
  const draftCount =
    data?.employees.reduce(
      (sum, e) => sum + e.cells.filter((c) => c.state === 'draft').length,
      0,
    ) ?? 0

  return (
    <>
      <PageHeader
        title="Xếp lịch tuần"
        subtitle={
          data
            ? `${formatDay(data.weekStart)} – ${formatDay(data.weekEnd)}${draftCount > 0 ? ` · ${draftCount} ca còn ở dạng nháp` : ''}`
            : 'Lưới ngày × người. Lịch nháp nhân viên chưa thấy và giờ công chưa tính.'
        }
        action={
          <>
            <Button onClick={() => setWeekStart(addDays(weekStart, -7))}>← Tuần trước</Button>
            <DateInput value={weekStart} onChange={(v) => setWeekStart(mondayOf(v))} />
            <Button onClick={() => setWeekStart(addDays(weekStart, 7))}>Tuần sau →</Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-8 pb-8">
        {week.isError ? (
          <ErrorState message={(week.error as Error).message} />
        ) : !data ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          <>
            {data.locked ? (
              <p className="rounded-md border border-warn bg-surface-1 px-5 py-3.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-body">
                {data.lockedReason}
              </p>
            ) : (
              <div className="flex flex-wrap items-center gap-2">
                <Button onClick={() => copyPrevious.mutate()} disabled={copyPrevious.isPending}>
                  Sao chép tuần trước
                </Button>
                <Button
                  variant="primary"
                  onClick={() => publish.mutate()}
                  disabled={draftCount === 0 || publish.isPending}
                >
                  Công bố lịch{draftCount > 0 ? ` (${draftCount} ca)` : ''}
                </Button>
                <span className="text-[length:var(--fs-c1)] text-ink-mute">
                  Ca viền đứt là nháp — chỉ ca đã công bố mới vào giờ công.
                </span>
              </div>
            )}

            {data.employees.length === 0 ? (
              <p className="mt-5 text-[length:var(--fs-b2)] text-ink-mute">
                Chưa có hồ sơ nhân viên nào đang làm việc ở chi nhánh này.
              </p>
            ) : (
              <div className="mt-5 overflow-x-auto rounded-md border border-line-1 bg-surface-1">
                <div className="min-w-[1100px]">
                  <div className="grid grid-cols-[200px_repeat(7,1fr)_140px] gap-px border-b border-line-1 bg-canvas">
                    <span className="px-4 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                      Nhân viên
                    </span>
                    {data.days.map((iso, i) => (
                      <span key={iso} className="px-2 py-3 text-center">
                        <span className="block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                          {WEEKDAYS[i]}
                        </span>
                        <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
                          {iso.slice(8)}/{iso.slice(5, 7)}
                        </span>
                      </span>
                    ))}
                    <span className="px-4 py-3 text-right text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                      Giờ công
                    </span>
                  </div>

                  {data.employees.map((person) => (
                    <div
                      key={person.employeeId}
                      className="grid grid-cols-[200px_repeat(7,1fr)_140px] items-stretch gap-px border-b border-line-1 last:border-b-0"
                    >
                      <span className="px-4 py-3">
                        <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                          {person.fullName}
                        </span>
                        <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
                          {person.position}
                        </span>
                      </span>

                      {data.days.map((iso) => {
                        const cell = person.cells.find((c) => c.workDate === iso)
                        return (
                          <button
                            key={iso}
                            type="button"
                            disabled={data.locked}
                            onClick={() =>
                              setEditing({ employeeId: person.employeeId, workDate: iso })
                            }
                            className={`m-1 rounded-sm px-2 py-2 text-center text-[length:var(--fs-c1)] disabled:cursor-not-allowed ${
                              cell
                                ? cell.state === 'draft'
                                  ? 'border border-dashed border-accent text-accent-ink'
                                  : 'border border-line-3 bg-surface-3 text-ink-hi'
                                : 'border border-transparent text-line-4 hover:border-line-2'
                            }`}
                          >
                            {cell ? (
                              <>
                                <span className="block font-mono">
                                  {hhmm(cell.startMinute)}–{hhmm(cell.endMinute)}
                                </span>
                                {cell.dayKind !== 'thuong' ? (
                                  <span className="mt-0.5 block text-[length:var(--fs-c2)] text-warn">
                                    {cell.dayKind === 'nghi' ? '200%' : '300%'}
                                  </span>
                                ) : null}
                              </>
                            ) : (
                              '+'
                            )}
                          </button>
                        )
                      })}

                      <span className="px-4 py-3 text-right">
                        <span className="block font-mono text-[length:var(--fs-b2)] text-ink-hi">
                          {formatMinutes(person.totalMinutes)}
                        </span>
                        {person.minutes.otNormal + person.minutes.otRest + person.minutes.otHoliday >
                        0 ? (
                          <span className="mt-0.5 block text-[length:var(--fs-c2)] text-warn">
                            TC{' '}
                            {formatMinutes(
                              person.minutes.otNormal +
                                person.minutes.otRest +
                                person.minutes.otHoliday,
                            )}
                          </span>
                        ) : null}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {editing ? (
              <CellEditor
                week={data}
                employeeId={editing.employeeId}
                workDate={editing.workDate}
                saving={setCells.isPending}
                onClose={() => setEditing(null)}
                onSave={(cells) => setCells.mutate({ employeeId: editing.employeeId, cells })}
              />
            ) : null}

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Chưa có trong bản dựng này: tô đỏ khung thiếu người so với dự báo lượt khách (cần
              B6), đẩy lịch sang Kênh nhân viên và Zalo khi công bố (cần H8), và hàng đợi duyệt
              nghỉ phép / đổi ca (H5). Chấm công thật (H3 · H10) cũng chưa có, nên lịch đã công bố
              đang đóng luôn vai bảng công.
            </p>
          </>
        )}
      </div>
    </>
  )
}

function CellEditor({
  week,
  employeeId,
  workDate,
  saving,
  onClose,
  onSave,
}: {
  week: ScheduleWeek
  employeeId: number
  workDate: string
  saving: boolean
  onClose: () => void
  onSave: (cells: Omit<ScheduleCell, 'id' | 'state'>[]) => void
}) {
  const person = week.employees.find((e) => e.employeeId === employeeId)!
  const existing = person.cells.find((c) => c.workDate === workDate)

  const [start, setStart] = useState(existing ? hhmm(existing.startMinute) : '08:00')
  const [end, setEnd] = useState(existing ? hhmm(existing.endMinute) : '16:00')
  const [breakMinutes, setBreakMinutes] = useState(existing?.breakMinutes ?? 0)
  const [dayKind, setDayKind] = useState<DayKind>(existing?.dayKind ?? 'thuong')

  const toMinutes = (value: string) => {
    const [h, m] = value.split(':').map(Number)
    return (h ?? 0) * 60 + (m ?? 0)
  }

  /** Giữ nguyên các ngày khác, chỉ thay ngày đang sửa — API nhận cả tuần */
  const withChange = (next: Omit<ScheduleCell, 'id' | 'state'> | null) => {
    const others = person.cells
      .filter((c) => c.workDate !== workDate)
      .map(({ id: _id, state: _state, ...rest }) => rest)
    return next ? [...others, next] : others
  }

  const net = toMinutes(end) - toMinutes(start) - breakMinutes

  return (
    <section className="mt-5 rounded-md border border-accent bg-surface-1 p-5">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {person.fullName} · {formatDay(workDate)}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4">
        <label className="block">
          <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">Bắt đầu</span>
          <input
            type="time"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            className="h-9 rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">Kết thúc</span>
          <input
            type="time"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            className="h-9 rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">Nghỉ (phút)</span>
          <input
            type="number"
            min={0}
            value={breakMinutes}
            onChange={(e) => setBreakMinutes(Number(e.target.value) || 0)}
            className="h-9 w-[90px] rounded-sm border border-line-1 bg-canvas px-2.5 text-right font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">Loại ngày</span>
          <select
            value={dayKind}
            onChange={(e) => setDayKind(e.target.value as DayKind)}
            className="h-9 rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            {(Object.keys(DAY_KIND_LABELS) as DayKind[]).map((kind) => (
              <option key={kind} value={kind}>
                {DAY_KIND_LABELS[kind]}
              </option>
            ))}
          </select>
        </label>

        <div className="ml-auto flex gap-2">
          {existing ? (
            <Button variant="danger" onClick={() => onSave(withChange(null))} disabled={saving}>
              Bỏ ca
            </Button>
          ) : null}
          <Button onClick={onClose}>Đóng</Button>
          <Button
            variant="primary"
            disabled={net <= 0 || saving}
            onClick={() =>
              onSave(
                withChange({
                  workDate,
                  templateId: null,
                  startMinute: toMinutes(start),
                  endMinute: toMinutes(end),
                  breakMinutes,
                  dayKind,
                  note: null,
                }),
              )
            }
          >
            Lưu ca
          </Button>
        </div>
      </div>

      <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        {net > 0 ? (
          <>
            Giờ công ca này: <span className="text-ink-body">{formatMinutes(net)}</span>.{' '}
            {dayKind === 'thuong'
              ? 'Phần vượt giờ chuẩn mỗi ngày mới tính tăng ca 150%.'
              : 'Toàn bộ giờ của ca này hưởng hệ số tăng ca, kể cả giờ đầu tiên.'}
          </>
        ) : (
          <span className="text-danger">Ca phải kết thúc sau khi bắt đầu, và nghỉ ngắn hơn ca.</span>
        )}
      </p>
    </section>
  )
}
