import { formatVnd } from '@sora/contracts'
import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type PayrollDetail, type PayrollLine, type PeriodState } from '../api'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * H7 — Kỳ lương, mẫu WZ năm bước.
 *
 * Màn này cố tình KHÔNG cho nhảy bước. Mỗi bước một nút, mỗi nút một vai trò
 * khác nhau (§4.2b): quản lý nhân sự trình, kế toán kiểm, chủ duyệt và phát. Ba
 * người, ba lần bấm — đó là lý do không ai một mình đưa tiền ra khỏi quỹ, và là
 * lý do màn hình này trông chậm hơn một nút "Chạy lương".
 *
 * Bước "Chốt công" là mốc không quay lại: sau đó lịch của kỳ đóng băng, sai thì
 * ghi bút toán công ở kỳ sau.
 */

const STEPS: { state: PeriodState; label: string; action: string; hint: string }[] = [
  { state: 'draft', label: 'Mở kỳ', action: 'lock', hint: 'Chốt công — sau bước này lịch của kỳ đóng băng' },
  { state: 'locked', label: 'Đã chốt công', action: 'submit', hint: 'Quản lý nhân sự trình kỳ lương' },
  { state: 'submitted', label: 'Đã trình', action: 'check', hint: 'Kế toán kiểm' },
  { state: 'checked', label: 'Đã kiểm', action: 'approve', hint: 'Chủ duyệt' },
  { state: 'approved', label: 'Đã duyệt', action: 'pay', hint: 'Đánh dấu đã phát lương' },
  { state: 'paid', label: 'Đã phát', action: '', hint: 'Kỳ đã đóng' },
]

const STATE_LABELS: Record<PeriodState, string> = {
  draft: 'Nháp',
  locked: 'Đã chốt công',
  submitted: 'Đã trình',
  checked: 'Đã kiểm',
  approved: 'Đã duyệt',
  paid: 'Đã phát',
}

const formatMinutes = (minutes: number) => {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m === 0 ? `${h}g` : `${h}g${String(m).padStart(2, '0')}`
}

export function Payroll() {
  const { branchId } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<number | null>(null)
  const [opening, setOpening] = useState(false)

  const periods = useQuery({
    queryKey: ['payroll-periods', branchId],
    queryFn: () => api.payrollPeriods(branchId!),
    enabled: Boolean(branchId),
  })

  const detail = useQuery({
    queryKey: ['payroll-detail', selected],
    queryFn: () => api.payrollDetail(selected!),
    enabled: selected !== null,
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['payroll-periods'] })
    void queryClient.invalidateQueries({ queryKey: ['payroll-detail'] })
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const advance = useMutation({
    mutationFn: ({ id, step }: { id: number; step: 'lock' | 'submit' | 'check' | 'approve' | 'pay' }) =>
      api.advancePayroll(id, step),
    onSuccess: (result) => {
      toast(`Kỳ lương chuyển sang: ${STATE_LABELS[result.state]}`, 'ok')
      refresh()
    },
    onError: fail,
  })

  const compute = useMutation({
    mutationFn: (id: number) => api.computePayroll(id, []),
    onSuccess: (result) => {
      toast(`Đã tính nháp ${result.lines} dòng lương`, 'ok')
      refresh()
    },
    onError: fail,
  })

  const list = periods.data ?? []

  return (
    <>
      <PageHeader
        title="Kỳ lương"
        subtitle="Chốt công → tính nháp → trình → kiểm → duyệt & phát. Mỗi bước một vai trò khác nhau."
        action={<Button onClick={() => setOpening(true)}>Mở kỳ mới</Button>}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {periods.isError ? <ErrorState message={(periods.error as Error).message} /> : null}

        {opening ? (
          <OpenPeriodForm
            branchId={branchId!}
            onClose={() => setOpening(false)}
            onDone={(id) => {
              setSelected(id)
              refresh()
            }}
          />
        ) : null}

        <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="grid grid-cols-[1fr_160px_200px_1fr] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Kỳ</span>
            <span>Trạng thái</span>
            <span>Bước kế tiếp</span>
            <span />
          </div>

          {periods.isPending ? (
            <p className="px-5 py-4 text-ink-mute">Đang tải…</p>
          ) : list.length === 0 ? (
            <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
              Chưa có kỳ lương nào. Mở kỳ đầu tiên để bắt đầu.
            </p>
          ) : (
            list.map((period) => {
              const step = STEPS.find((s) => s.state === period.state)!
              const isOpen = selected === period.id
              return (
                <div key={period.id} className="border-b border-line-1 last:border-b-0">
                  <div className="grid grid-cols-[1fr_160px_200px_1fr] items-center gap-3 px-5 py-3">
                    <button
                      type="button"
                      onClick={() => setSelected(isOpen ? null : period.id)}
                      className="text-left text-[length:var(--fs-b2)] text-ink-hi"
                    >
                      {formatDay(period.periodStart)} – {formatDay(period.periodEnd)}
                    </button>
                    <span
                      className={`text-[length:var(--fs-c1)] ${
                        period.state === 'paid' ? 'text-ok' : 'text-ink-body'
                      }`}
                    >
                      {STATE_LABELS[period.state]}
                    </span>
                    <span className="text-[length:var(--fs-c1)] text-ink-mute">{step.hint}</span>
                    <span className="flex justify-end gap-2">
                      {period.state === 'locked' ? (
                        <Button onClick={() => compute.mutate(period.id)} disabled={compute.isPending}>
                          Tính nháp
                        </Button>
                      ) : null}
                      {step.action ? (
                        <Button
                          variant="primary"
                          disabled={advance.isPending}
                          onClick={() =>
                            advance.mutate({
                              id: period.id,
                              step: step.action as 'lock' | 'submit' | 'check' | 'approve' | 'pay',
                            })
                          }
                        >
                          {step.action === 'lock'
                            ? 'Chốt công'
                            : step.action === 'submit'
                              ? 'Trình duyệt'
                              : step.action === 'check'
                                ? 'Đã kiểm'
                                : step.action === 'approve'
                                  ? 'Duyệt'
                                  : 'Đã phát'}
                        </Button>
                      ) : null}
                    </span>
                  </div>

                  {isOpen && detail.data ? <PayrollTable detail={detail.data} /> : null}
                </div>
              )
            })
          )}
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Chưa có trong bản dựng này: gọi API Chi lương ngân hàng (bước phát hiện chỉ đánh dấu),
          phát phiếu lương qua Kênh nhân viên hoặc Zalo (H8 · H9), quy tắc thưởng theo chỉ tiêu
          doanh thu, và tạm ứng lấy tự động từ phiếu chi (C2). Thuế TNCN đang dùng một tỉ lệ tạm
          khấu trừ đặt ở Trung tâm tham số — <span className="text-warn">mặc định 0, tức là chưa
          cấu hình chứ không phải miễn thuế</span>; biểu thuế luỹ tiến chưa cài.
        </p>
      </div>
    </>
  )
}

function PayrollTable({ detail }: { detail: PayrollDetail }) {
  if (detail.lines.length === 0) {
    return (
      <p className="border-t border-line-1 bg-canvas px-5 py-4 text-[length:var(--fs-c1)] text-ink-mute">
        Kỳ này chưa tính nháp. Chốt công rồi bấm “Tính nháp” để dựng bảng lương từ lịch đã công bố.
      </p>
    )
  }

  return (
    <div className="border-t border-line-1 bg-canvas px-5 py-4">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1000px]">
          <thead>
            <tr className="border-b border-line-1 text-left text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              <th className="pb-2">Nhân viên</th>
              <th className="pb-2 text-right">Giờ công</th>
              <th className="pb-2 text-right">Tăng ca</th>
              <th className="pb-2 text-right">Lương</th>
              <th className="pb-2 text-right">Tăng ca ₫</th>
              <th className="pb-2 text-right">Phụ cấp</th>
              <th className="pb-2 text-right">Bảo hiểm</th>
              <th className="pb-2 text-right">Tạm ứng</th>
              <th className="pb-2 text-right">Thực lãnh</th>
            </tr>
          </thead>
          <tbody>
            {detail.lines.map((line) => (
              <PayrollRow key={line.employeeId} line={line} />
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t border-line-2 text-[length:var(--fs-b2)] font-semibold text-ink-hi">
              <td className="pt-3">Tổng {detail.lines.length} người</td>
              <td colSpan={2} />
              <td colSpan={3} className="pt-3 text-right font-mono">
                {formatVnd(detail.totals.gross)}
              </td>
              <td className="pt-3 text-right font-mono text-ink-mute">
                {formatVnd(detail.totals.insurance)}
              </td>
              <td />
              <td className="pt-3 text-right font-mono">{formatVnd(detail.totals.net)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Tổng gộp {formatVnd(detail.totals.gross)} là con số chảy vào dòng Nhân sự của báo cáo Lãi/Lỗ
        — chi phí của quán, khác với thực lãnh của người lao động.
      </p>
    </div>
  )
}

function PayrollRow({ line }: { line: PayrollLine }) {
  const otMinutes = line.otNormalMinutes + line.otRestMinutes + line.otHolidayMinutes

  return (
    <tr className="border-b border-line-1 last:border-b-0 text-[length:var(--fs-b2)] text-ink-body">
      <td className="py-2">
        <span className="block text-ink-hi">{line.nameSnapshot}</span>
        <span className="block text-[length:var(--fs-c1)] text-ink-mute">
          {line.positionSnapshot} · {formatVnd(line.rateSnapshotVnd)}/giờ
        </span>
      </td>
      <td className="py-2 text-right font-mono">{formatMinutes(line.workedMinutes)}</td>
      <td className="py-2 text-right font-mono">
        {otMinutes === 0 ? <span className="text-line-4">—</span> : formatMinutes(otMinutes)}
      </td>
      <td className="py-2 text-right font-mono">{formatVnd(line.basePayVnd)}</td>
      <td className="py-2 text-right font-mono">
        {line.overtimePayVnd === 0 ? (
          <span className="text-line-4">—</span>
        ) : (
          formatVnd(line.overtimePayVnd)
        )}
      </td>
      <td className="py-2 text-right font-mono">
        {line.allowanceVnd + line.bonusVnd === 0 ? (
          <span className="text-line-4">—</span>
        ) : (
          formatVnd(line.allowanceVnd + line.bonusVnd)
        )}
      </td>
      <td className="py-2 text-right font-mono text-ink-mute">
        {line.insuranceVnd === 0 ? '—' : `−${formatVnd(line.insuranceVnd)}`}
      </td>
      <td className="py-2 text-right font-mono text-ink-mute">
        {line.advanceVnd === 0 ? '—' : `−${formatVnd(line.advanceVnd)}`}
      </td>
      <td
        className={`py-2 text-right font-mono ${
          line.netPayVnd < 0 ? 'text-danger' : 'text-ink-hi'
        }`}
      >
        {formatVnd(line.netPayVnd)}
      </td>
    </tr>
  )
}

function OpenPeriodForm({
  branchId,
  onClose,
  onDone,
}: {
  branchId: string
  onClose: () => void
  onDone: (id: number) => void
}) {
  const toast = useToast()
  const today = new Date().toISOString().slice(0, 10)
  const [start, setStart] = useState(`${today.slice(0, 7)}-01`)
  const [end, setEnd] = useState(() => {
    const at = new Date(`${today.slice(0, 7)}-01T00:00:00Z`)
    return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0)).toISOString().slice(0, 10)
  })

  const open = useMutation({
    mutationFn: () => api.openPayrollPeriod({ branchId, periodStart: start, periodEnd: end }),
    onSuccess: (period) => {
      toast('Đã mở kỳ lương', 'ok')
      onDone(period.id)
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="flex flex-wrap items-end gap-4">
        <Field label="Từ ngày">
          <DateInput value={start} onChange={setStart} />
        </Field>
        <Field label="Đến ngày">
          <DateInput value={end} onChange={setEnd} />
        </Field>
        <div className="ml-auto flex gap-2">
          <Button onClick={onClose}>Bỏ</Button>
          <Button variant="primary" onClick={() => open.mutate()} disabled={open.isPending}>
            Mở kỳ
          </Button>
        </div>
      </div>
      <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Giờ công của kỳ lấy từ lịch ĐÃ CÔNG BỐ trong khoảng này. Ca còn ở dạng nháp không được
        tính — công bố lịch trước khi chốt công.
      </p>
    </section>
  )
}
