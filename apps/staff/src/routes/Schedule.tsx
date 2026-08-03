import { Badge, Button, Card, SectionLabel } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useOutletContext } from 'react-router'
import { api, type MyLeave, type Profile, type WeekShift } from '../api'
import { LeaveSheet } from './LeaveSheet'
import {
  addDays,
  clockOf,
  dayLabel,
  hhmm,
  hours,
  mondayOf,
  monthLabel,
  monthRange,
  shiftMonth,
  todayIso,
} from '../time'

const DAY_KIND_LABEL: Record<string, string> = {
  thuong: '',
  nghi: 'Ngày nghỉ',
  le: 'Ngày lễ',
}

const LEAVE_KIND_LABEL: Record<string, string> = {
  'nghi-phep': 'Nghỉ phép',
  'nghi-khong-luong': 'Nghỉ không lương',
  'nghi-om': 'Nghỉ ốm',
  'doi-ca': 'Đổi ca',
}

/**
 * H8 — Lịch & công của tôi.
 *
 * Ba khối theo đúng thứ tự người ta cần: TUẦN TỚI làm gì, THÁNG NÀY được bao
 * nhiêu công, và những yêu cầu mình đã gửi đang nằm ở đâu.
 *
 * Lịch chỉ hiện ca ĐÃ CÔNG BỐ — máy chủ lọc sẵn. Lịch nháp mà lọt xuống đây thì
 * người ta sắp xếp cuộc sống theo một cái lịch chưa ai chốt.
 */
export function Schedule() {
  const me = useOutletContext<Profile>()
  const [weekStart, setWeekStart] = useState(() => mondayOf(todayIso()))
  const [month, setMonth] = useState(() => monthRange(todayIso()).from)
  const [asking, setAsking] = useState(false)

  const week = useQuery({ queryKey: ['week', weekStart], queryFn: () => api.week(weekStart) })
  const range = monthRange(month)
  const sheet = useQuery({
    queryKey: ['timesheet', range.from, range.to],
    queryFn: () => api.timesheet(range.from, range.to),
  })
  const leaves = useQuery({ queryKey: ['leaves'], queryFn: api.leaves })

  const shiftOn = (day: string): WeekShift | undefined =>
    week.data?.shifts.find((s) => s.workDate === day)
  const today = todayIso()

  return (
    <div className="flex flex-col gap-8">
      {/* ---------------------------------------------------------- Tuần */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Lịch tuần</SectionLabel>
          <div className="flex items-center gap-1">
            <StepButton label="Tuần trước" onClick={() => setWeekStart(addDays(weekStart, -7))}>
              ‹
            </StepButton>
            <span className="min-w-[92px] text-center font-mono text-[length:var(--fs-c1)] text-ink-mute">
              {dayLabel(weekStart).slice(3)} – {dayLabel(addDays(weekStart, 6)).slice(3)}
            </span>
            <StepButton label="Tuần sau" onClick={() => setWeekStart(addDays(weekStart, 7))}>
              ›
            </StepButton>
          </div>
        </div>

        <Card className="divide-y divide-line-1">
          {(week.data?.days ?? Array.from({ length: 7 }, (_, i) => addDays(weekStart, i))).map(
            (day) => {
              const shift = shiftOn(day)
              return (
                <div
                  key={day}
                  className={[
                    'flex items-center justify-between gap-3 px-4 py-3',
                    day === today ? 'bg-surface-2' : '',
                  ].join(' ')}
                >
                  <span
                    className={[
                      'w-[74px] shrink-0 font-mono text-[length:var(--fs-b2)]',
                      day === today ? 'text-accent-ink' : 'text-ink-mute',
                    ].join(' ')}
                  >
                    {dayLabel(day)}
                  </span>
                  {shift ? (
                    <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5">
                      <span className="font-mono text-[length:var(--fs-b1)] text-ink-hi">
                        {hhmm(shift.startMinute)} – {hhmm(shift.endMinute)}
                      </span>
                      <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
                        {[
                          shift.templateName,
                          // Người làm nhiều chi nhánh phải thấy hôm đó đứng ở đâu
                          shift.branchId === me.branchId ? null : shift.branchName,
                          DAY_KIND_LABEL[shift.dayKind] || null,
                          shift.breakMinutes > 0 ? `nghỉ ${shift.breakMinutes}′` : null,
                          shift.note,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </span>
                    </div>
                  ) : (
                    <span className="text-[length:var(--fs-b2)] text-ink-mute">Không có ca</span>
                  )}
                </div>
              )
            },
          )}
        </Card>

        <Button variant="primary" size="lg" block onClick={() => setAsking(true)}>
          Gửi yêu cầu nghỉ / đổi ca
        </Button>
      </section>

      {/* ---------------------------------------------------------- Công */}
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <SectionLabel>Bảng công</SectionLabel>
          <div className="flex items-center gap-1">
            <StepButton label="Tháng trước" onClick={() => setMonth(shiftMonth(month, -1))}>
              ‹
            </StepButton>
            <span className="min-w-[92px] text-center text-[length:var(--fs-c1)] text-ink-mute">
              {monthLabel(month)}
            </span>
            <StepButton label="Tháng sau" onClick={() => setMonth(shiftMonth(month, 1))}>
              ›
            </StepButton>
          </div>
        </div>

        <Card className="flex flex-col gap-4 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[length:var(--fs-b2)] text-ink-body">Giờ công tháng này</span>
            <span className="font-mono text-[length:var(--fs-d3)] text-ink-hi">
              {hours(sheet.data?.total.worked ?? 0)}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <Stat label="TC thường" minutes={sheet.data?.total.otNormal ?? 0} />
            <Stat label="TC ngày nghỉ" minutes={sheet.data?.total.otRest ?? 0} />
            <Stat label="TC ngày lễ" minutes={sheet.data?.total.otHoliday ?? 0} />
          </div>

          {sheet.data?.locked ? (
            <p className="text-[length:var(--fs-c1)] text-ink-mute">
              Kỳ lương {dayLabel(sheet.data.locked.periodStart).slice(3)} –{' '}
              {dayLabel(sheet.data.locked.periodEnd).slice(3)} đã chốt công — giờ công trong
              khoảng đó không đổi nữa.
            </p>
          ) : null}
          {sheet.data && sheet.data.openShifts > 0 ? (
            <p className="text-[length:var(--fs-c1)] text-warn">
              Còn {sheet.data.openShifts} ca chưa chấm ra. Nhớ bấm ở kiosk trước khi về — ca chưa
              chấm ra thì chưa vào bảng công.
            </p>
          ) : null}
          {sheet.data && sheet.data.missingDays.length > 0 ? (
            <p className="text-[length:var(--fs-c1)] text-ink-mute">
              Ngày có ca mà không có công:{' '}
              <span className="font-mono">
                {sheet.data.missingDays.map((d) => dayLabel(d).slice(3)).join(' · ')}
              </span>
            </p>
          ) : null}
        </Card>

        <Card className="divide-y divide-line-1">
          {(sheet.data?.days.length ?? 0) === 0 ? (
            <p className="px-4 py-6 text-center text-[length:var(--fs-b2)] text-ink-mute">
              {sheet.isPending ? 'Đang tải…' : 'Tháng này chưa có ngày công nào.'}
            </p>
          ) : (
            sheet.data?.days.map((day) => (
              <div key={day.workDate} className="flex items-center justify-between gap-3 px-4 py-3">
                <span className="w-[74px] shrink-0 font-mono text-[length:var(--fs-b2)] text-ink-mute">
                  {dayLabel(day.workDate)}
                </span>
                <div className="flex min-w-0 flex-1 flex-col items-end gap-0.5">
                  <span className="font-mono text-[length:var(--fs-b1)] text-ink-hi">
                    {clockOf(day.clockIn)} – {day.clockOut ? clockOf(day.clockOut) : '…'}
                    <span className="ml-2 text-ink-body">{hours(day.worked)}</span>
                  </span>
                  {day.source === 'manual' ? (
                    <span className="text-[length:var(--fs-c2)] text-ink-mute">
                      Quản lý sửa tay{day.editedBy ? ` · ${day.editedBy}` : ''}
                      {day.editReason ? ` · ${day.editReason}` : ''}
                    </span>
                  ) : null}
                </div>
              </div>
            ))
          )}
        </Card>
      </section>

      {/* ------------------------------------------------------ Yêu cầu */}
      <section className="flex flex-col gap-3">
        <SectionLabel>Yêu cầu của tôi</SectionLabel>
        {(leaves.data?.length ?? 0) === 0 ? (
          <p className="text-[length:var(--fs-b2)] text-ink-mute">Chưa gửi yêu cầu nào.</p>
        ) : (
          <Card className="divide-y divide-line-1">
            {leaves.data?.map((row) => <LeaveRow key={row.id} row={row} />)}
          </Card>
        )}
      </section>

      <LeaveSheet open={asking} me={me} onClose={() => setAsking(false)} />
    </div>
  )
}

function LeaveRow({ row }: { row: MyLeave }) {
  const tone = row.state === 'approved' ? 'ok' : row.state === 'rejected' ? 'danger' : 'warn'
  const label = row.state === 'approved' ? 'Đã duyệt' : row.state === 'rejected' ? 'Từ chối' : 'Chờ duyệt'
  return (
    <div className="flex flex-col gap-1 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-[length:var(--fs-b2)] text-ink-hi">
          {LEAVE_KIND_LABEL[row.kind] ?? row.kind}
        </span>
        <Badge tone={tone}>{label}</Badge>
      </div>
      <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
        {dayLabel(row.fromDate)}
        {row.toDate === row.fromDate ? '' : ` – ${dayLabel(row.toDate)}`}
      </span>
      <span className="text-[length:var(--fs-c1)] text-ink-body">{row.reason}</span>
      {/* Bị từ chối thì được biết vì sao — đó là điểm của ô ghi chú quyết định */}
      {row.decisionNote ? (
        <span className="text-[length:var(--fs-c1)] text-ink-mute">
          {row.decidedBy ? `${row.decidedBy}: ` : ''}
          {row.decisionNote}
        </span>
      ) : null}
    </div>
  )
}

function Stat({ label, minutes }: { label: string; minutes: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-line-1 px-3 py-2">
      <span className="text-[length:var(--fs-c2)] text-ink-mute">{label}</span>
      <span className="font-mono text-[length:var(--fs-b1)] text-ink-hi">{hours(minutes)}</span>
    </div>
  )
}

function StepButton({
  children,
  label,
  onClick,
}: {
  children: React.ReactNode
  label: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      className="flex h-[var(--hit-target)] w-[var(--hit-target)] items-center justify-center rounded-sm border border-line-2 text-[length:var(--fs-t2)] text-ink-body"
    >
      {children}
    </button>
  )
}
