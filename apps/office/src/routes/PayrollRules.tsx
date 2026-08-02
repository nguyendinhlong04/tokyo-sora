import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type ParameterRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Field } from '../components/report'
import { useSession } from '../session-context'

/**
 * H6 — Cơ chế lương & thưởng.
 *
 * Không có bảng riêng: đây là **cửa vào theo ngữ cảnh** của Trung tâm tham số A6,
 * đúng như §26 H6 nói — "giá trị nằm trong Trung tâm tham số 29.1". Màn này chỉ
 * gom đúng nhóm khoá `payroll.*`, đặt tên tiếng Việt và giải thích hệ quả; con số
 * thì vẫn sống ở một chỗ duy nhất mà engine đọc.
 *
 * **Không có mục "phạt tiền đi muộn", và đó là cố ý.** Luật lao động Việt Nam
 * không cho phạt tiền người lao động (§26 H6). Đi muộn tự khớp vào lương vì lương
 * tính trên giờ CÓ MẶT thật — không cần và không được phép có cái công tắc đó.
 */

interface RuleDef {
  key: string
  label: string
  hint: string
  /** Cách hiển thị: hệ số 1.5 · tỉ lệ 10,5% · phút 480 · giờ quy từ phút */
  kind: 'factor' | 'rate' | 'minutes' | 'hours'
}

const GROUPS: { title: string; note: string; rules: RuleDef[] }[] = [
  {
    title: 'Giờ chuẩn',
    note: 'Quyết định phần nào của một ca là giờ thường và phần nào là tăng ca; lương tháng cũng quy ra đơn giá giờ bằng con số này.',
    rules: [
      {
        key: 'payroll.standardDailyMinutes',
        label: 'Giờ chuẩn mỗi ngày',
        hint: 'Quá mức này ở ngày thường mới là tăng ca',
        kind: 'hours',
      },
      {
        key: 'payroll.standardMonthlyMinutes',
        label: 'Giờ chuẩn mỗi tháng',
        hint: 'Dùng để quy lương tháng ra đơn giá giờ khi tính tăng ca',
        kind: 'hours',
      },
      {
        key: 'payroll.lateGraceMinutes',
        label: 'Châm chước đi muộn',
        hint: 'Chấm lúc 15:02 cho ca 15:00 không phải đi muộn. Chỉ ảnh hưởng bảng H3, không ảnh hưởng tiền.',
        kind: 'minutes',
      },
    ],
  },
  {
    title: 'Hệ số tăng ca',
    note: 'Theo luật lao động Việt Nam. Ngày nghỉ và ngày lễ hưởng hệ số cho TOÀN BỘ giờ, kể cả giờ đầu tiên — không phải chỉ phần vượt giờ chuẩn.',
    rules: [
      {
        key: 'payroll.otNormalRate',
        label: 'Ngày thường',
        hint: 'Áp cho phần vượt giờ chuẩn',
        kind: 'factor',
      },
      { key: 'payroll.otRestRate', label: 'Ngày nghỉ tuần', hint: 'Áp cho toàn bộ giờ', kind: 'factor' },
      { key: 'payroll.otHolidayRate', label: 'Ngày lễ', hint: 'Áp cho toàn bộ giờ', kind: 'factor' },
    ],
  },
  {
    title: 'Khấu trừ',
    note: 'Bảo hiểm tính trên LƯƠNG CƠ BẢN, không trên tổng thu nhập — tiền tăng ca không nằm trong nền đóng bảo hiểm.',
    rules: [
      {
        key: 'payroll.insuranceEmployeeRate',
        label: 'BHXH + BHYT + BHTN phần người lao động',
        hint: 'Mặc định 10,5% = 8% + 1,5% + 1%',
        kind: 'rate',
      },
      {
        key: 'payroll.pitWithholdRate',
        label: 'Thuế TNCN tạm khấu trừ',
        hint: 'Để 0 nghĩa là CHƯA CẤU HÌNH, không phải miễn thuế — biểu thuế luỹ tiến chưa cài, kế toán tự tính ngoài',
        kind: 'rate',
      },
    ],
  },
]

const ALL_KEYS = GROUPS.flatMap((g) => g.rules.map((r) => r.key))

export function PayrollRules() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('payroll.configure')
  const [drafts, setDrafts] = useState<Record<string, string>>({})

  const params = useQuery({
    queryKey: ['parameters', branchId],
    queryFn: () => api.parameters(branchId!),
    enabled: Boolean(branchId),
  })

  const save = useMutation({
    mutationFn: ({ key, value }: { key: string; value: number }) =>
      api.setParameter(key, value, null),
    onSuccess: (_res, vars) => {
      toast('Đã lưu — kỳ lương tính từ giờ trở đi dùng con số mới', 'ok')
      setDrafts((d) => {
        const next = { ...d }
        delete next[vars.key]
        return next
      })
      void queryClient.invalidateQueries({ queryKey: ['parameters'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const byKey = new Map((params.data ?? []).map((p) => [p.key, p]))
  const missing = ALL_KEYS.filter((k) => !byKey.has(k))

  return (
    <>
      <PageHeader
        title="Cơ chế lương & thưởng"
        subtitle="Hệ số, giờ chuẩn và tỉ lệ khấu trừ mà kỳ lương đọc. Đây là cửa vào của Trung tâm tham số — sửa ở đây hay ở A6 đều là sửa một chỗ."
        action={<Badge tone="info">Cấp chuỗi</Badge>}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {params.isError ? <ErrorState message={(params.error as Error).message} /> : null}
        {params.isPending ? <p className="text-ink-mute">Đang tải…</p> : null}

        {missing.length > 0 && !params.isPending ? (
          <p className="mb-4 rounded-md border border-warn bg-surface-1 px-5 py-3 text-[length:var(--fs-c1)] leading-relaxed text-warn">
            Chưa khai {missing.length} tham số ({missing.join(', ')}). Kỳ lương sẽ dùng giá trị mặc
            định trong mã nguồn cho tới khi khai — mở A6 để thêm.
          </p>
        ) : null}

        {GROUPS.map((group) => (
          <section key={group.title} className="mb-5 rounded-md border border-line-1 bg-surface-1 p-6">
            <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">{group.title}</h2>
            <p className="mt-1.5 max-w-[760px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              {group.note}
            </p>

            <div className="mt-5 grid gap-5 lg:grid-cols-3">
              {group.rules.map((rule) => {
                const row = byKey.get(rule.key)
                return (
                  <RuleField
                    key={rule.key}
                    rule={rule}
                    row={row}
                    draft={drafts[rule.key]}
                    disabled={!mayEdit || !row}
                    saving={save.isPending}
                    onChange={(value) => setDrafts((d) => ({ ...d, [rule.key]: value }))}
                    onSave={(value) => save.mutate({ key: rule.key, value })}
                    onReset={() =>
                      setDrafts((d) => {
                        const next = { ...d }
                        delete next[rule.key]
                        return next
                      })
                    }
                  />
                )
              })}
            </div>
          </section>
        ))}

        <section className="rounded-md border border-line-3 bg-surface-1 p-6">
          <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
            Cố tình không có ở đây
          </h2>
          <ul className="mt-3 flex max-w-[820px] flex-col gap-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            <li>
              <span className="text-ink-body">Phạt tiền đi muộn.</span> Luật lao động Việt Nam không
              cho phạt tiền người lao động. Đi muộn tự khớp vào lương vì lương tính trên giờ có mặt
              thật — không cần thêm công tắc nào.
            </li>
            <li>
              <span className="text-ink-body">Đơn giá theo vị trí.</span> Đơn giá nằm trên từng hồ sơ
              ở H1, vì hai người cùng vị trí vẫn có thể khác đơn giá theo thâm niên.
            </li>
            <li>
              <span className="text-ink-body">Quy tắc thưởng theo chỉ tiêu doanh thu.</span> Chưa
              dựng; hiện thưởng nhập tay ở bước tính nháp của kỳ lương, kèm lý do.
            </li>
          </ul>
        </section>
      </div>
    </>
  )
}

function RuleField({
  rule,
  row,
  draft,
  disabled,
  saving,
  onChange,
  onSave,
  onReset,
}: {
  rule: RuleDef
  row: ParameterRow | undefined
  draft: string | undefined
  disabled: boolean
  saving: boolean
  onChange: (value: string) => void
  onSave: (value: number) => void
  onReset: () => void
}) {
  const current = typeof row?.chainValue === 'number' ? row.chainValue : null
  const shown = draft ?? (current === null ? '' : String(toDisplay(current, rule.kind)))
  const parsed = shown === '' ? null : fromDisplay(Number(shown.replace(',', '.')), rule.kind)
  const dirty = draft !== undefined && parsed !== null && parsed !== current

  return (
    <div>
      <Field label={`${rule.label}${UNIT[rule.kind] ? ` (${UNIT[rule.kind]})` : ''}`}>
        <input
          type="number"
          step={rule.kind === 'factor' || rule.kind === 'rate' ? '0.01' : '1'}
          value={shown}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
        />
      </Field>
      <p className="mt-1.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">{rule.hint}</p>
      {row?.updatedBy ? (
        <p className="mt-1 text-[length:var(--fs-c2)] text-line-4">Sửa cuối: {row.updatedBy}</p>
      ) : null}

      {dirty ? (
        <div className="mt-2 flex gap-2">
          <Button disabled={saving} onClick={() => onSave(parsed)}>
            Lưu
          </Button>
          <Button onClick={onReset}>Bỏ</Button>
        </div>
      ) : null}
    </div>
  )
}

const UNIT: Record<RuleDef['kind'], string> = {
  factor: 'hệ số',
  rate: '%',
  minutes: 'phút',
  hours: 'giờ',
}

/** Tham số lưu bằng phút và tỉ lệ; màn hình nói bằng giờ và phần trăm */
function toDisplay(value: number, kind: RuleDef['kind']): number {
  if (kind === 'hours') return Math.round((value / 60) * 100) / 100
  if (kind === 'rate') return Math.round(value * 10_000) / 100
  return value
}

function fromDisplay(value: number, kind: RuleDef['kind']): number | null {
  if (!Number.isFinite(value) || value < 0) return null
  if (kind === 'hours') return Math.round(value * 60)
  if (kind === 'rate') return Math.round(value * 100) / 10_000
  return kind === 'minutes' ? Math.round(value) : value
}
