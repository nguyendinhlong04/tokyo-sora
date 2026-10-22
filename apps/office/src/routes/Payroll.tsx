import { formatKpiScore, formatVnd, type KpiBonusSuggestions } from '@sora/contracts'
import { Button, ErrorState, GradeChip, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import {
  api,
  type EmployeeRow,
  type PayrollDetail,
  type PayrollLine,
  type PeriodState,
} from '../api'
import { DataTable } from '../components/DataTable'
import { Drawer } from '../components/Drawer'
import { NumberInput, TextInput } from '../components/form'
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
  {
    state: 'draft',
    label: 'Mở kỳ',
    action: 'lock',
    hint: 'Chốt công — sau bước này lịch của kỳ đóng băng',
  },
  {
    state: 'locked',
    label: 'Đã chốt công',
    action: 'submit',
    hint: 'Quản lý nhân sự trình kỳ lương',
  },
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
  const [adjusting, setAdjusting] = useState<number | null>(null)

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
    mutationFn: ({
      id,
      step,
    }: {
      id: number
      step: 'lock' | 'submit' | 'check' | 'approve' | 'pay'
    }) => api.advancePayroll(id, step),
    onSuccess: (result) => {
      toast(`Kỳ lương chuyển sang: ${STATE_LABELS[result.state]}`, 'ok')
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

        <div className="mt-5">
          <DataTable
            rows={list}
            rowKey={(period) => period.id}
            loading={periods.isPending}
            empty="Chưa có kỳ lương nào. Mở kỳ đầu tiên để bắt đầu."
            // Bảng lương của kỳ chỉ tải khi bung dòng — `onOpenChange` là cách trang
            // biết đang mở kỳ nào để đặt khoá truy vấn.
            onOpenChange={(key) => setSelected(key === null ? null : Number(key))}
            renderDetail={(period) =>
              selected === period.id && detail.data ? (
                <PayrollTable detail={detail.data} />
              ) : (
                <p className="text-[length:var(--fs-c1)] text-ink-mute">Đang tải bảng lương…</p>
              )
            }
            columns={[
              {
                key: 'period',
                header: 'Kỳ',
                width: 'minmax(220px, 1fr)',
                cell: (period) => (
                  <span className="text-[length:var(--fs-b2)] text-ink-hi">
                    {formatDay(period.periodStart)} – {formatDay(period.periodEnd)}
                  </span>
                ),
              },
              {
                key: 'state',
                header: 'Trạng thái',
                width: '160px',
                cell: (period) => (
                  <span
                    className={`text-[length:var(--fs-c1)] ${
                      period.state === 'paid' ? 'text-ok' : 'text-ink-body'
                    }`}
                  >
                    {STATE_LABELS[period.state]}
                  </span>
                ),
              },
              {
                key: 'hint',
                header: 'Bước kế tiếp',
                width: '200px',
                cell: (period) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {STEPS.find((s) => s.state === period.state)!.hint}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: '',
                width: 'minmax(240px, 1fr)',
                cell: (period) => {
                  const step = STEPS.find((s) => s.state === period.state)!
                  return (
                    // Cả dòng đã bắt onClick để bung bảng lương — mọi nút ở đây phải chặn lại
                    <span className="flex justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      {period.state === 'locked' ? (
                        <Button size="sm" onClick={() => setAdjusting(period.id)}>
                          Tính nháp…
                        </Button>
                      ) : null}
                      {step.action ? (
                        <Button
                          size="sm"
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
                  )
                },
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Chưa có trong bản dựng này: gọi API Chi lương ngân hàng (bước phát hiện chỉ đánh dấu),
          phát phiếu lương qua Kênh nhân viên hoặc Zalo (H8 · H9), quy tắc thưởng theo chỉ tiêu
          doanh thu. Thưởng KPI chỉ là gợi ý từ kỳ KPI đã chốt (N10) — điền sẵn ở bước tính nháp,
          người tính lương xác nhận. Thuế TNCN đang dùng một tỉ lệ tạm khấu trừ đặt ở Trung tâm tham
          số —{' '}
          <span className="text-warn">
            mặc định 0, tức là chưa cấu hình chứ không phải miễn thuế
          </span>
          ; biểu thuế luỹ tiến chưa cài.
        </p>
      </div>

      {adjusting !== null && branchId ? (
        <AdjustDrawer
          periodId={adjusting}
          branchId={branchId}
          onClose={() => setAdjusting(null)}
          onDone={refresh}
        />
      ) : null}
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
        <table className="w-full min-w-[1040px]">
          <thead>
            <tr className="border-b border-line-1 text-left text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              <th className="pb-2">Nhân viên</th>
              <th className="pb-2 pl-3 text-right">Giờ công</th>
              <th className="pb-2 pl-3 text-right">Tăng ca</th>
              <th className="pb-2 pl-3 text-right">Lương</th>
              <th className="pb-2 pl-3 text-right">Tăng ca ₫</th>
              <th className="pb-2 pl-3 text-right">Phụ cấp</th>
              <th className="pb-2 pl-3 text-right">Thưởng</th>
              <th className="pb-2 pl-3 text-right">Bảo hiểm</th>
              <th className="pb-2 pl-3 text-right">Tạm ứng</th>
              <th className="pb-2 pl-3 text-right">Thực lãnh</th>
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
              <td colSpan={4} className="pt-3 pl-3 text-right font-mono">
                {formatVnd(detail.totals.gross)}
              </td>
              <td className="pt-3 pl-3 text-right font-mono text-ink-mute">
                {formatVnd(detail.totals.insurance)}
              </td>
              <td />
              <td className="pt-3 pl-3 text-right font-mono">{formatVnd(detail.totals.net)}</td>
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
        {line.note ? (
          <span className="block text-[length:var(--fs-c1)] text-ink-body">
            Ghi chú: {line.note}
          </span>
        ) : null}
      </td>
      <td className="py-2 pl-3 text-right font-mono">{formatMinutes(line.workedMinutes)}</td>
      <td className="py-2 pl-3 text-right font-mono">
        {otMinutes === 0 ? <span className="text-line-4">—</span> : formatMinutes(otMinutes)}
      </td>
      <td className="py-2 pl-3 text-right font-mono">{formatVnd(line.basePayVnd)}</td>
      <td className="py-2 pl-3 text-right font-mono">
        {line.overtimePayVnd === 0 ? (
          <span className="text-line-4">—</span>
        ) : (
          formatVnd(line.overtimePayVnd)
        )}
      </td>
      <td className="py-2 pl-3 text-right font-mono">
        {line.allowanceVnd === 0 ? (
          <span className="text-line-4">—</span>
        ) : (
          formatVnd(line.allowanceVnd)
        )}
      </td>
      <td className="py-2 pl-3 text-right font-mono">
        {line.bonusVnd === 0 ? <span className="text-line-4">—</span> : formatVnd(line.bonusVnd)}
      </td>
      <td className="py-2 pl-3 text-right font-mono text-ink-mute">
        {line.insuranceVnd === 0 ? '—' : `−${formatVnd(line.insuranceVnd)}`}
      </td>
      <td className="py-2 pl-3 text-right font-mono text-ink-mute">
        {line.advanceVnd === 0 ? '—' : `−${formatVnd(line.advanceVnd)}`}
      </td>
      <td
        className={`py-2 pl-3 text-right font-mono ${
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
    return new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth() + 1, 0))
      .toISOString()
      .slice(0, 10)
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
        Giờ công của kỳ lấy từ lịch ĐÃ CÔNG BỐ trong khoảng này. Ca còn ở dạng nháp không được tính
        — công bố lịch trước khi chốt công.
      </p>
    </section>
  )
}

type Adjust = { bonus: number | null; advance: number | null; note: string }

/**
 * Bảng điều chỉnh trước khi tính nháp: thưởng, tạm ứng, ghi chú của từng người.
 *
 * Thưởng KPI chỉ là GỢI Ý từ kỳ KPI đã chốt (N10): điền sẵn cho người chưa có
 * dòng lương, "Lấy thưởng KPI" ghi đè cả bảng, người tính lương sửa được — nhưng
 * khác gợi ý thì phải ghi lý do, để kỳ sau còn biết vì sao. Không có ô trừ tiền:
 * KPI không phạt, không khấu trừ (Điều 127).
 *
 * Luôn gửi ĐỦ danh sách: máy chủ coi dòng gửi lên là toàn bộ điều chỉnh của người
 * đó, người vắng mặt trong lần gửi thì giữ điều chỉnh của lần trước.
 */
function AdjustDrawer({
  periodId,
  branchId,
  onClose,
  onDone,
}: {
  periodId: number
  branchId: string
  onClose: () => void
  onDone: () => void
}) {
  const people = useQuery({
    queryKey: ['employees', branchId],
    queryFn: () => api.employees(branchId),
  })
  const detail = useQuery({
    queryKey: ['payroll-detail', periodId],
    queryFn: () => api.payrollDetail(periodId),
  })
  const bonus = useQuery({
    queryKey: ['kpi-bonus', periodId],
    queryFn: () => api.kpiBonusSuggestions(periodId),
  })
  const failed = [people, detail, bonus].find((q) => q.isError)

  if (people.data && detail.data && bonus.data) {
    return (
      <AdjustForm
        periodId={periodId}
        employees={people.data.filter((e) => e.active)}
        lines={detail.data.lines}
        suggestions={bonus.data}
        onClose={onClose}
        onDone={onDone}
      />
    )
  }
  return (
    <Drawer open onClose={onClose} width={720} title="Tính nháp kỳ lương">
      {failed ? (
        <ErrorState message={(failed.error as Error).message} />
      ) : (
        <Skeleton className="h-64" />
      )}
    </Drawer>
  )
}

function AdjustForm({
  periodId,
  employees,
  lines,
  suggestions,
  onClose,
  onDone,
}: {
  periodId: number
  employees: EmployeeRow[]
  lines: PayrollLine[]
  suggestions: KpiBonusSuggestions
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const suggestionOf = new Map(suggestions.suggestions.map((s) => [s.employeeId, s]))
  const [rows, setRows] = useState<Record<number, Adjust>>(() =>
    Object.fromEntries(
      employees.map((e) => {
        const line = lines.find((l) => l.employeeId === e.id)
        return [
          e.id,
          line
            ? { bonus: line.bonusVnd, advance: line.advanceVnd, note: line.note ?? '' }
            : { bonus: suggestionOf.get(e.id)?.suggestedBonusVnd ?? 0, advance: 0, note: '' },
        ]
      }),
    ),
  )

  const differs = (employeeId: number) => {
    const s = suggestionOf.get(employeeId)
    return s !== undefined && (rows[employeeId]?.bonus ?? 0) !== s.suggestedBonusVnd
  }
  const missingNote = employees.filter((e) => differs(e.id) && !rows[e.id]?.note.trim())
  const invalid = employees.some((e) => {
    const r = rows[e.id]!
    return [r.bonus, r.advance].some((v) => v !== null && (v < 0 || !Number.isInteger(v)))
  })

  const compute = useMutation({
    mutationFn: () =>
      api.computePayroll(
        periodId,
        employees.map((e) => {
          const r = rows[e.id]!
          return {
            employeeId: e.id,
            bonusVnd: r.bonus ?? 0,
            advanceVnd: r.advance ?? 0,
            ...(r.note.trim() ? { note: r.note.trim() } : {}),
          }
        }),
      ),
    onSuccess: (result) => {
      toast(`Đã tính nháp ${result.lines} dòng lương`, 'ok')
      onDone()
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const patch = (employeeId: number, next: Partial<Adjust>) =>
    setRows((all) => ({ ...all, [employeeId]: { ...all[employeeId]!, ...next } }))

  const takeKpi = () =>
    setRows((all) => {
      const next = { ...all }
      for (const s of suggestions.suggestions) {
        if (next[s.employeeId]) {
          next[s.employeeId] = { ...next[s.employeeId]!, bonus: s.suggestedBonusVnd }
        }
      }
      return next
    })

  return (
    <Drawer
      open
      onClose={onClose}
      width={720}
      title="Tính nháp kỳ lương"
      subtitle="Giờ công lấy từ bảng công thực tế. Điều chỉnh từng người trước khi tính; tính lại bao nhiêu lần cũng được trước khi trình."
      footer={
        <>
          <Button onClick={onClose}>Bỏ</Button>
          <Button
            variant="primary"
            disabled={missingNote.length > 0 || invalid || compute.isPending}
            onClick={() => compute.mutate()}
          >
            Tính nháp
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        {suggestions.blockedBy ? (
          <p className="rounded-sm border border-warn px-4 py-3 text-[length:var(--fs-b2)] text-ink-hi">
            Chưa có thưởng KPI: {suggestions.blockedBy}.{' '}
            <Link to="/danh-gia-kpi" className="text-accent-ink hover:underline">
              Mở N10
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-sm border border-line-1 bg-canvas px-4 py-3">
            <p className="text-[length:var(--fs-b2)] text-ink-body">
              Kỳ KPI cùng tháng đã chốt — {suggestions.suggestions.length} người có thưởng gợi ý.
              Khác gợi ý thì ghi lý do.
            </p>
            <Button size="sm" onClick={takeKpi}>
              Lấy thưởng KPI
            </Button>
          </div>
        )}

        <div className="grid gap-2">
          {employees.map((e) => {
            const r = rows[e.id]!
            const s = suggestionOf.get(e.id)
            const needNote = differs(e.id) && !r.note.trim()
            return (
              <div key={e.id} className="rounded-md border border-line-1 bg-surface-2 px-4 py-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="text-[length:var(--fs-b2)] font-medium text-ink-hi">
                    {e.fullName}
                    <span className="ml-2 text-[length:var(--fs-c1)] font-normal text-ink-mute">
                      {e.position}
                    </span>
                  </span>
                  {s ? (
                    <span className="flex items-center gap-3 text-[length:var(--fs-c1)] text-ink-mute">
                      <GradeChip grade={s.grade} />
                      <span>
                        <span className="font-mono tabular-nums">
                          {s.scoreMilli === null ? '—' : formatKpiScore(s.scoreMilli)}
                        </span>{' '}
                        điểm · gợi ý{' '}
                        <span className="font-mono text-ink-hi tabular-nums">
                          {formatVnd(s.suggestedBonusVnd)}
                        </span>
                      </span>
                    </span>
                  ) : suggestions.blockedBy ? null : (
                    <span className="text-[length:var(--fs-c1)] text-ink-mute">
                      Không có phiếu KPI — miễn đánh giá
                    </span>
                  )}
                </div>
                <div className="mt-2 grid grid-cols-[150px_150px_minmax(0,1fr)] items-end gap-3">
                  <Field label="Thưởng (₫)">
                    <NumberInput
                      value={r.bonus}
                      min={0}
                      step={1000}
                      onChange={(bonus) => patch(e.id, { bonus })}
                    />
                  </Field>
                  <Field label="Tạm ứng (₫)">
                    <NumberInput
                      value={r.advance}
                      min={0}
                      step={1000}
                      onChange={(advance) => patch(e.id, { advance })}
                    />
                  </Field>
                  <Field label={needNote ? 'Lý do khác gợi ý — bắt buộc' : 'Ghi chú'}>
                    <TextInput
                      value={r.note}
                      onChange={(note) => patch(e.id, { note: note.slice(0, 200) })}
                      placeholder={s ? 'Vì sao khác thưởng gợi ý' : 'Ghi chú dòng lương'}
                    />
                  </Field>
                </div>
                {s && differs(e.id) ? (
                  <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
                    Gợi ý tính từ: {s.basis}
                  </p>
                ) : null}
              </div>
            )
          })}
        </div>

        <p className="text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Tạm ứng: phiếu chi tạm ứng (C2) trong kỳ được lấy tự động và thay cho số nhập ở đây —
          không nhập lại khoản đã có phiếu. Không có ô trừ tiền: KPI chỉ quyết định thưởng.
        </p>
      </div>
    </Drawer>
  )
}
