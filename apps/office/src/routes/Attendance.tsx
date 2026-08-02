import { Badge, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type AttendanceRow, type AttendanceStatus } from '../api'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatTime } from '../components/report'
import { useSession } from '../session-context'

/**
 * H3 — Chấm công hôm nay.
 *
 * Màn này không phải danh sách giờ vào giờ ra. Nó là **bảng lệch**: ba nguồn —
 * lịch xếp, công đã chấm, phiên đăng nhập ở quán — và chỗ chúng không khớp nhau
 * chính là thứ quản lý ca cần biết trước khi hết ca, không phải sau khi bảng
 * lương đã tính.
 *
 * Người có phiên POS mà chưa chấm công là người sẽ bị trả thiếu. Người chấm công
 * mà không có hoạt động nào là chuyện cần hỏi. Cả hai đều có lý do chính đáng nên
 * màn này chỉ nói ra, không chặn gì cả.
 */

const STATUS: Record<AttendanceStatus, { label: string; tone: 'ok' | 'warn' | 'danger' | 'neutral' | 'info' }> = {
  'dang-lam': { label: 'Đang làm', tone: 'ok' },
  'xong-ca': { label: 'Xong ca', tone: 'neutral' },
  vang: { label: 'Chưa đến', tone: 'danger' },
  'chua-toi-gio': { label: 'Chưa tới giờ', tone: 'neutral' },
  nghi: { label: 'Nghỉ có phép', tone: 'info' },
  'ngoai-lich': { label: 'Không có ca', tone: 'neutral' },
}

const LEAVE_LABELS: Record<string, string> = {
  'nghi-phep': 'nghỉ phép',
  'nghi-khong-luong': 'nghỉ không lương',
  'nghi-om': 'nghỉ ốm',
  'doi-ca': 'đổi ca',
}

const today = () => new Date().toISOString().slice(0, 10)

export function Attendance() {
  const { branchId } = useSession()
  const [date, setDate] = useState(today())

  const board = useQuery({
    queryKey: ['attendance', branchId, date],
    queryFn: () => api.attendance(branchId!, date),
    enabled: Boolean(branchId),
    // Ca đang chạy thì bảng phải tươi; 30 giây đủ cho một màn người ta liếc qua
    refetchInterval: date === today() ? 30_000 : false,
  })

  const rows = board.data?.rows ?? []
  const summary = board.data?.summary
  const warned = rows.filter((r) => r.warnWorkedWithoutClock || r.warnClockWithoutWork)

  return (
    <>
      <PageHeader
        title="Chấm công hôm nay"
        subtitle="Ai đã vào ca, ai muộn, ai chưa đến. Đối chiếu chéo với phiên đăng nhập POS để không ai làm mà không được tính công."
        action={
          <Field label="Ngày">
            <DateInput value={date} onChange={setDate} />
          </Field>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {board.isError ? <ErrorState message={(board.error as Error).message} /> : null}

        {summary ? (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Tile label="Có ca hôm nay" value={summary.scheduled} />
            <Tile label="Đã chấm vào" value={summary.clockedIn} />
            <Tile label="Đang làm" value={summary.working} tone="ok" />
            <Tile label="Đi muộn" value={summary.late} tone={summary.late > 0 ? 'warn' : undefined} />
            <Tile
              label="Chưa đến"
              value={summary.absent}
              tone={summary.absent > 0 ? 'danger' : undefined}
            />
          </div>
        ) : null}

        {warned.length > 0 ? (
          <section className="mt-4 rounded-md border border-warn bg-surface-1 px-5 py-4">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-warn uppercase">
              Cần đối chiếu
            </p>
            <ul className="mt-2 flex flex-col gap-1.5">
              {warned.map((row) => (
                <li key={row.employeeId} className="text-[length:var(--fs-c1)] text-ink-body">
                  <span className="text-ink-hi">{row.fullName}</span>{' '}
                  {row.warnWorkedWithoutClock
                    ? '— có mở phiên ở quán hôm nay mà chưa chấm công. Không chấm thì công của ca này bằng 0.'
                    : '— đã chấm công nhưng không mở phiên nào ở quán.'}
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="grid grid-cols-[1fr_150px_110px_110px_110px_130px_150px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Nhân viên</span>
            <span>Ca xếp</span>
            <span>Vào</span>
            <span>Ra</span>
            <span className="text-right">Giờ công</span>
            <span>Lệch giờ</span>
            <span>Trạng thái</span>
          </div>

          {board.isPending ? (
            <p className="px-5 py-4 text-ink-mute">Đang tải…</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
              Chi nhánh này chưa có hồ sơ nhân viên nào đang làm việc.
            </p>
          ) : (
            rows.map((row) => <Line key={row.employeeId} row={row} />)
          )}
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Nguồn của bảng này là kiosk chấm công H10. Thiếu giờ thì sửa ở Bảng công tháng — sửa tay
          bắt buộc ghi lý do, và quản lý ca cần một người khác duyệt bằng PIN.
        </p>
      </div>
    </>
  )
}

function Line({ row }: { row: AttendanceRow }) {
  const status = STATUS[row.status]
  return (
    <div className="grid grid-cols-[1fr_150px_110px_110px_110px_130px_150px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0">
      <span className="min-w-0">
        <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">{row.fullName}</span>
        <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">{row.position}</span>
      </span>

      <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
        {row.scheduled
          ? `${hhmm(row.scheduled.startMinute)}–${hhmm(row.scheduled.endMinute)}${
              row.scheduled.dayKind === 'nghi' ? ' ·nghỉ' : row.scheduled.dayKind === 'le' ? ' ·lễ' : ''
            }`
          : '—'}
      </span>

      <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
        {row.clockIn ? formatTime(row.clockIn) : '—'}
      </span>
      <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
        {row.clockOut ? formatTime(row.clockOut) : row.clockIn ? '…' : '—'}
      </span>
      <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-hi">
        {row.workedMinutes > 0 ? formatMinutes(row.workedMinutes) : '—'}
      </span>

      <span className="text-[length:var(--fs-c1)]">
        {row.lateMinutes > 0 ? (
          <span className="text-warn">muộn {row.lateMinutes}′</span>
        ) : row.earlyLeaveMinutes > 0 ? (
          <span className="text-ink-mute">sớm {row.earlyLeaveMinutes}′</span>
        ) : (
          <span className="text-ink-mute">—</span>
        )}
      </span>

      <span className="flex items-center gap-2">
        <Badge tone={status.tone}>{status.label}</Badge>
        {row.onLeave ? (
          <span className="text-[length:var(--fs-c2)] text-ink-mute">
            {LEAVE_LABELS[row.onLeave] ?? row.onLeave}
          </span>
        ) : null}
      </span>
    </div>
  )
}

function Tile({
  label,
  value,
  tone,
}: {
  label: string
  value: number
  tone?: 'ok' | 'warn' | 'danger'
}) {
  const color = tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : tone === 'danger' ? 'text-danger' : 'text-ink-hi'
  return (
    <div className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p className={`mt-2 font-mono text-[length:var(--fs-d3)] leading-none ${color}`}>{value}</p>
    </div>
  )
}

function hhmm(minute: number): string {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

/** Giống `formatMinutes` của miền: in "8g30", không in số thập phân */
export function formatMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  return rest === 0 ? `${hours}g` : `${hours}g${String(rest).padStart(2, '0')}`
}
