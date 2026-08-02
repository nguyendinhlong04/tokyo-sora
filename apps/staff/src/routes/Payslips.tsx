import { formatVnd } from '@sora/contracts'
import { Badge, Card, SectionLabel } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type Payslip } from '../api'
import { dayShort, hours } from '../time'

/**
 * H9 — Phiếu lương của tôi.
 *
 * Đọc từ trên xuống là trả lời được câu "vì sao tháng này khác tháng trước": các
 * dòng CỘNG, rồi các dòng TRỪ, rồi thực lãnh. Con số thực lãnh để mono cỡ lớn vì
 * đó là con số người ta mở màn này ra để xem.
 *
 * Mọi số đều là ảnh chụp lúc chốt kỳ (`*_snapshot`), nên phiếu tháng 6 in lại
 * sau một năm vẫn ra đúng bằng đấy dù đơn giá đã tăng hai lần.
 */
export function Payslips() {
  const slips = useQuery({ queryKey: ['payslips'], queryFn: api.payslips })
  const [openId, setOpenId] = useState<number | null>(null)

  if (slips.isPending) {
    return <p className="text-[length:var(--fs-b2)] text-ink-mute">Đang tải…</p>
  }

  const rows = slips.data ?? []
  if (rows.length === 0) {
    return (
      <div className="flex flex-col gap-3">
        <SectionLabel>Phiếu lương</SectionLabel>
        <p className="text-[length:var(--fs-b1)] text-ink-body">
          Chưa có phiếu lương nào. Phiếu chỉ hiện sau khi kỳ lương được duyệt — bản tính nháp
          chưa phải phiếu.
        </p>
      </div>
    )
  }

  const current = rows.find((row) => row.period.id === openId) ?? rows[0]!

  return (
    <div className="flex flex-col gap-5">
      <SectionLabel>Phiếu lương</SectionLabel>

      <div className="flex gap-2 overflow-x-auto pb-1">
        {rows.map((row) => (
          <button
            key={row.period.id}
            type="button"
            onClick={() => setOpenId(row.period.id)}
            className={[
              'flex h-[var(--hit-target)] shrink-0 items-center rounded-sm border px-4 font-mono text-[length:var(--fs-b2)]',
              row.period.id === current.period.id
                ? 'border-accent bg-surface-2 text-accent-ink'
                : 'border-line-2 text-ink-mute',
            ].join(' ')}
          >
            {dayShort(row.period.periodStart)} – {dayShort(row.period.periodEnd)}
          </button>
        ))}
      </div>

      <Slip slip={current} />
    </div>
  )
}

function Slip({ slip }: { slip: Payslip }) {
  const { line, period } = slip
  const overtimeMinutes = line.otNormalMinutes + line.otRestMinutes + line.otHolidayMinutes

  return (
    <div className="flex flex-col gap-4">
      <Card className="flex flex-col gap-3 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">
              {line.nameSnapshot}
            </span>
            <span className="text-[length:var(--fs-c1)] text-ink-mute">
              {line.positionSnapshot} ·{' '}
              {line.payKind === 'hourly'
                ? `${formatVnd(line.rateSnapshotVnd)}/giờ`
                : `${formatVnd(line.rateSnapshotVnd)}/tháng`}
            </span>
          </div>
          <Badge tone={period.state === 'paid' ? 'ok' : 'info'}>
            {period.state === 'paid' ? 'Đã trả' : 'Đã duyệt'}
          </Badge>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Stat label="Giờ công" value={hours(line.workedMinutes)} />
          <Stat label="Tăng ca" value={hours(overtimeMinutes)} />
        </div>
      </Card>

      <Card className="flex flex-col">
        <Group title="Cộng">
          <Row label="Lương theo công" amount={line.basePayVnd} />
          {line.overtimePayVnd > 0 ? (
            <Row label="Tăng ca" amount={line.overtimePayVnd} hint={overtimeHint(line)} />
          ) : null}
          {line.allowanceVnd > 0 ? <Row label="Phụ cấp" amount={line.allowanceVnd} /> : null}
          {line.bonusVnd > 0 ? <Row label="Thưởng" amount={line.bonusVnd} /> : null}
          <Row label="Tổng thu nhập" amount={line.grossPayVnd} strong />
        </Group>

        <Group title="Trừ">
          {line.insuranceVnd > 0 ? (
            <Row label="Bảo hiểm (phần người lao động)" amount={-line.insuranceVnd} />
          ) : null}
          {line.taxVnd > 0 ? <Row label="Thuế TNCN tạm khấu trừ" amount={-line.taxVnd} /> : null}
          {line.advanceVnd > 0 ? <Row label="Tạm ứng đã nhận" amount={-line.advanceVnd} /> : null}
          {line.insuranceVnd + line.taxVnd + line.advanceVnd === 0 ? (
            <p className="px-4 py-3 text-[length:var(--fs-c1)] text-ink-mute">
              Kỳ này không có khoản trừ nào.
            </p>
          ) : null}
        </Group>

        <div className="flex items-baseline justify-between border-t border-line-2 px-4 py-5">
          <span className="text-[length:var(--fs-b1)] text-ink-body">Thực lãnh</span>
          <span className="font-mono text-[length:var(--fs-d3)] font-semibold tabular-nums text-accent-ink">
            {formatVnd(line.netPayVnd)}
          </span>
        </div>
      </Card>

      {line.note ? (
        <p className="text-[length:var(--fs-c1)] text-ink-mute">{line.note}</p>
      ) : null}

      <p className="text-[length:var(--fs-c1)] text-ink-mute">
        Thấy số chưa đúng thì nhắn quản lý nhân sự — kỳ đã chốt không sửa ngược, sai sẽ được
        cộng/trừ ở kỳ sau.
      </p>
    </div>
  )
}

/** "6g00 × 150% · 2g00 × 200%" — nói rõ tăng ca được tính theo hệ số nào */
function overtimeHint(line: Payslip['line']): string {
  return [
    line.otNormalMinutes > 0 ? `${hours(line.otNormalMinutes)} × 150%` : null,
    line.otRestMinutes > 0 ? `${hours(line.otRestMinutes)} × 200%` : null,
    line.otHolidayMinutes > 0 ? `${hours(line.otHolidayMinutes)} × 300%` : null,
  ]
    .filter(Boolean)
    .join(' · ')
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line-1 last:border-b-0">
      <h3 className="px-4 pt-4 text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-mute uppercase">
        {title}
      </h3>
      <div className="flex flex-col py-1">{children}</div>
    </section>
  )
}

function Row({
  label,
  amount,
  hint,
  strong = false,
}: {
  label: string
  amount: number
  hint?: string
  strong?: boolean
}) {
  return (
    <div className="flex items-baseline justify-between gap-3 px-4 py-2">
      <div className="flex min-w-0 flex-col">
        <span
          className={[
            'text-[length:var(--fs-b2)]',
            strong ? 'font-semibold text-ink-hi' : 'text-ink-body',
          ].join(' ')}
        >
          {label}
        </span>
        {hint ? <span className="font-mono text-[length:var(--fs-c2)] text-ink-mute">{hint}</span> : null}
      </div>
      <span
        className={[
          'shrink-0 font-mono tabular-nums',
          strong ? 'text-[length:var(--fs-b1)] text-ink-hi' : 'text-[length:var(--fs-b2)] text-ink-body',
        ].join(' ')}
      >
        {formatVnd(amount)}
      </span>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 rounded-sm border border-line-1 px-3 py-2">
      <span className="text-[length:var(--fs-c2)] text-ink-mute">{label}</span>
      <span className="font-mono text-[length:var(--fs-b1)] text-ink-hi">{value}</span>
    </div>
  )
}
