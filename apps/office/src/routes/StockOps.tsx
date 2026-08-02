import { formatVnd } from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type CountSheet, type ProductionResult, type TransferRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Field, formatDay, formatTime } from '../components/report'
import { useSession } from '../session-context'

/**
 * S6 xuất kho · S7 sản xuất nội bộ · S8 kiểm kê · S10 chuyển kho.
 *
 * Bốn màn GHI của kho, gom một file vì chúng dùng chung một bộ ô nhập và cùng
 * một quy tắc: mọi lượt đều sinh bút toán trên sổ kho, không có cửa nào sửa tồn
 * mà không để lại dòng.
 */

// ===================================================================== S6

const ISSUE_KINDS = [
  {
    id: 'write_off' as const,
    label: 'Xuất huỷ',
    hint: 'Hàng hỏng, quá hạn, rơi vỡ. Vào dòng hao hụt của S11 và của Lãi/Lỗ.',
  },
  {
    id: 'internal' as const,
    label: 'Xuất nội bộ',
    hint: 'Ăn ca, tiếp khách, dùng thử. Là chi phí CÓ ÍCH, không phải hao.',
  },
]

export function StockIssues() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({
    kind: 'write_off' as 'write_off' | 'internal',
    ingredientId: '',
    qtyBase: 0,
    reason: '',
  })

  const mayIssue = can('stock.write-off')
  const ingredients = useQuery({
    queryKey: ['ingredients', branchId],
    queryFn: () => api.ingredients(branchId!),
    enabled: Boolean(branchId),
  })

  const issue = useMutation({
    mutationFn: () => api.issueStock({ branchId: branchId!, ...form }),
    onSuccess: (res) => {
      toast(
        res.shortBase > 0
          ? `Đã xuất, nhưng sổ lô thiếu ${res.shortBase} — nên kiểm kê lại`
          : 'Đã xuất kho',
        res.shortBase > 0 ? 'warn' : 'ok',
      )
      setForm({ ...form, qtyBase: 0, reason: '' })
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      void queryClient.invalidateQueries({ queryKey: ['lots'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const selected = (ingredients.data ?? []).find((i) => i.id === form.ingredientId)
  const kind = ISSUE_KINDS.find((k) => k.id === form.kind)!

  return (
    <>
      <PageHeader
        title="Xuất kho"
        subtitle="Huỷ và nội bộ là hai chuyện khác hẳn nhau — gộp làm một là báo cáo hao hụt kêu to mỗi khi nhân viên ăn cơm."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <section className="rounded-md border border-line-1 bg-surface-1 p-6">
          <div className="flex gap-2">
            {ISSUE_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setForm({ ...form, kind: k.id })}
                className={`h-10 rounded-sm border px-4 text-[length:var(--fs-b2)] ${
                  form.kind === k.id
                    ? 'border-accent bg-surface-3 text-ink-hi'
                    : 'border-line-3 text-ink-mute hover:text-ink-hi'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">{kind.hint}</p>

          <div className="mt-5 grid gap-4 lg:grid-cols-3">
            <Field label="Nguyên liệu">
              <select
                value={form.ingredientId}
                onChange={(e) => setForm({ ...form, ingredientId: e.target.value })}
                className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
              >
                <option value="">Chọn…</option>
                {(ingredients.data ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} — còn {i.qtyBase} {i.baseUnit}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={`Lượng xuất${selected ? ` (${selected.baseUnit})` : ''}`}>
              <input
                type="number"
                value={form.qtyBase || ''}
                onChange={(e) => setForm({ ...form, qtyBase: Math.round(Number(e.target.value)) || 0 })}
                className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
              />
            </Field>
            <Field label="Lý do (bắt buộc)">
              <input
                value={form.reason}
                onChange={(e) => setForm({ ...form, reason: e.target.value })}
                placeholder={form.kind === 'write_off' ? 'Ôi màu, bỏ' : 'Ăn ca trưa'}
                className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
              />
            </Field>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <p className="max-w-[600px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Hàng khai lô sẽ được rút theo hạn gần nhất trước. Thủ kho xuất kho cần một người khác
              duyệt bằng PIN — hệ sẽ hỏi khi bấm.
            </p>
            <Button
              className="ml-auto"
              variant="primary"
              disabled={
                !mayIssue || issue.isPending || !form.ingredientId || form.qtyBase <= 0 || !form.reason.trim()
              }
              onClick={() => issue.mutate()}
            >
              {kind.label}
            </Button>
          </div>
        </section>
      </div>
    </>
  )
}

// ===================================================================== S7

const RUN_KINDS = [
  { id: 'pha-che' as const, label: 'Pha chế', hint: 'Sốt, nước dùng, kim chi' },
  { id: 'pha-loc' as const, label: 'Pha lóc', hint: 'Tảng bò ra nầm, dẻ sườn — phần hao nằm lại trong giá' },
  { id: 'duc-keg' as const, label: 'Khác', hint: 'Chia lẻ, sơ chế' },
]

interface Line {
  ingredientId: string
  qtyBase: number
  costShareBp: number
}

export function Production() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<'pha-che' | 'pha-loc' | 'duc-keg'>('pha-loc')
  const [inputs, setInputs] = useState<Line[]>([{ ingredientId: '', qtyBase: 0, costShareBp: 0 }])
  const [outputs, setOutputs] = useState<Line[]>([{ ingredientId: '', qtyBase: 0, costShareBp: 10_000 }])
  const [result, setResult] = useState<ProductionResult | null>(null)

  const mayRun = can('stock.receive')
  const ingredients = useQuery({
    queryKey: ['ingredients', branchId],
    queryFn: () => api.ingredients(branchId!),
    enabled: Boolean(branchId),
  })

  const run = useMutation({
    mutationFn: () =>
      api.produce({
        branchId: branchId!,
        kind,
        inputs: inputs
          .filter((l) => l.ingredientId && l.qtyBase > 0)
          .map((l) => ({ ingredientId: l.ingredientId, qtyBase: l.qtyBase })),
        outputs: outputs.filter((l) => l.ingredientId && l.qtyBase > 0),
        note: null,
      }),
    onSuccess: (res) => {
      setResult(res)
      toast('Đã ghi lượt sản xuất', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      void queryClient.invalidateQueries({ queryKey: ['lots'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const totalBp = outputs.reduce((s, l) => s + l.costShareBp, 0)
  const items = ingredients.data ?? []

  /** Chia đều theo cân — điểm xuất phát để người pha lóc sửa, không phải mặc định đúng */
  const shareByWeight = () => {
    const total = outputs.reduce((s, l) => s + l.qtyBase, 0)
    if (total <= 0) return
    const raw = outputs.map((l) => Math.round((l.qtyBase * 10_000) / total))
    const drift = 10_000 - raw.reduce((s, v) => s + v, 0)
    const biggest = raw.indexOf(Math.max(...raw))
    raw[biggest] = (raw[biggest] ?? 0) + drift
    setOutputs(outputs.map((l, i) => ({ ...l, costShareBp: raw[i] ?? 0 })))
  }

  return (
    <>
      <PageHeader
        title="Sản xuất nội bộ"
        subtitle="Pha chế và pha lóc. Hao không có dòng riêng — tiền của nó nằm lại trong giá của thành phẩm dùng được."
        action={
          <div className="flex overflow-hidden rounded-sm border border-line-1">
            {RUN_KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                onClick={() => setKind(k.id)}
                className={`h-[var(--hit-target)] border-r border-line-1 px-4 text-[length:var(--fs-b2)] last:border-r-0 ${
                  kind === k.id ? 'bg-surface-3 text-ink-hi' : 'text-ink-mute hover:text-ink-hi'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          {RUN_KINDS.find((k) => k.id === kind)!.hint}
        </p>

        <LineTable
          title="Đầu vào — nguyên liệu tiêu hao"
          lines={inputs}
          items={items}
          showShare={false}
          onChange={setInputs}
        />

        <LineTable
          title={`Đầu ra — thành phẩm (tổng tỉ lệ ${(totalBp / 100).toFixed(0)}%)`}
          lines={outputs}
          items={items}
          showShare
          onChange={setOutputs}
          extra={
            <Button onClick={shareByWeight}>Chia đều theo cân</Button>
          }
        />

        <div className="mt-4 flex items-center gap-3">
          <p className="max-w-[640px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Tổng tỉ lệ phải bằng đúng 100%. Nầm bò và dẻ sườn cùng ra từ một tảng nhưng không cùng
            giá trị, nên chia theo cân chỉ là điểm xuất phát — người pha lóc gõ đè con số thật.
          </p>
          <Button
            className="ml-auto"
            variant="primary"
            disabled={!mayRun || run.isPending || totalBp !== 10_000}
            onClick={() => run.mutate()}
          >
            Ghi lượt sản xuất
          </Button>
        </div>

        {result ? (
          <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-6">
            <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">Kết quả</h2>
            <div className="mt-3 flex flex-wrap gap-6 text-[length:var(--fs-c1)]">
              <span className="text-ink-mute">
                Vào <span className="font-mono text-ink-hi">{result.totalInBase}</span> ·{' '}
                {formatVnd(result.totalInVnd)}
              </span>
              <span className="text-ink-mute">
                Ra <span className="font-mono text-ink-hi">{result.totalOutBase}</span>
              </span>
              <span className="text-warn">
                Hao <span className="font-mono">{result.wasteBase}</span> — tiền đã nằm trong giá đầu ra
              </span>
            </div>
            <div className="mt-4 flex flex-col gap-1.5">
              {result.outputs.map((o) => (
                <span key={o.ingredientId} className="text-[length:var(--fs-c1)] text-ink-body">
                  {items.find((i) => i.id === o.ingredientId)?.name ?? o.ingredientId}:{' '}
                  <span className="font-mono text-ink-hi">{o.qtyBase}</span> ·{' '}
                  {formatVnd(o.costVnd)} ·{' '}
                  <span className="font-mono">
                    {(o.unitCostMilli / 1_000).toLocaleString('vi-VN')}₫/đvt
                  </span>
                </span>
              ))}
            </div>
          </section>
        ) : null}
      </div>
    </>
  )
}

function LineTable({
  title,
  lines,
  items,
  showShare,
  onChange,
  extra,
}: {
  title: string
  lines: Line[]
  items: { id: string; name: string; baseUnit: string; qtyBase: number }[]
  showShare: boolean
  onChange: (next: Line[]) => void
  extra?: React.ReactNode
}) {
  const set = (index: number, patch: Partial<Line>) =>
    onChange(lines.map((l, i) => (i === index ? { ...l, ...patch } : l)))

  return (
    <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-5">
      <div className="flex items-center gap-3">
        <h2 className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
          {title}
        </h2>
        <div className="ml-auto flex gap-2">
          {extra}
          <Button onClick={() => onChange([...lines, { ingredientId: '', qtyBase: 0, costShareBp: 0 }])}>
            Thêm dòng
          </Button>
        </div>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {lines.map((line, index) => (
          <div key={index} className="flex flex-wrap items-center gap-3">
            <select
              value={line.ingredientId}
              onChange={(e) => set(index, { ingredientId: e.target.value })}
              className="h-9 min-w-[260px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
            >
              <option value="">Chọn nguyên liệu…</option>
              {items.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name} — còn {i.qtyBase} {i.baseUnit}
                </option>
              ))}
            </select>
            <input
              type="number"
              value={line.qtyBase || ''}
              placeholder="Lượng"
              onChange={(e) => set(index, { qtyBase: Math.round(Number(e.target.value)) || 0 })}
              className="h-9 w-[130px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            />
            {showShare ? (
              <span className="flex items-center gap-1.5">
                <input
                  type="number"
                  step="0.1"
                  value={line.costShareBp / 100}
                  onChange={(e) =>
                    set(index, { costShareBp: Math.round((Number(e.target.value) || 0) * 100) })
                  }
                  className="h-9 w-[100px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
                />
                <span className="text-[length:var(--fs-c1)] text-ink-mute">% giá</span>
              </span>
            ) : null}
            {lines.length > 1 ? (
              <button
                type="button"
                onClick={() => onChange(lines.filter((_, i) => i !== index))}
                className="h-9 rounded-sm border border-line-3 px-3 text-[length:var(--fs-c1)] text-ink-mute hover:bg-surface-3"
              >
                Bỏ
              </button>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  )
}

// ===================================================================== S8

export function StockCount() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [countId, setCountId] = useState<number | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})

  const mayCount = can('stock.receive')
  const mayClose = can('stock.close-count')

  const sheet = useQuery({
    queryKey: ['count', countId],
    queryFn: () => api.countSheet(countId!),
    enabled: countId !== null,
  })

  const open = useMutation({
    mutationFn: () => api.openCount(branchId!, null),
    onSuccess: (res) => {
      setCountId(res.id)
      toast(`Đã mở phiếu kiểm kê ${res.lines} dòng`, 'ok')
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const save = useMutation({
    mutationFn: () =>
      api.saveCountLines(
        countId!,
        Object.entries(draft)
          .filter(([, v]) => v.trim() !== '')
          .map(([ingredientId, v]) => ({
            ingredientId,
            countedBase: Math.round(Number(v)) || 0,
            note: null,
          })),
      ),
    onSuccess: () => {
      toast('Đã lưu số đếm', 'ok')
      setDraft({})
      void queryClient.invalidateQueries({ queryKey: ['count'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const close = useMutation({
    mutationFn: () => api.closeCount(countId!),
    onSuccess: (res) => {
      toast(`Đã chốt — ${res.adjusted} dòng lệch, ${formatVnd(res.diffVnd)}`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['count'] })
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const data = sheet.data

  return (
    <>
      <PageHeader
        title="Kiểm kê"
        subtitle="Đếm rồi duyệt mới chốt. Tồn sổ đóng băng ngay lúc mở phiếu, vì trong giờ đếm bếp vẫn bán."
        action={
          countId === null && mayCount ? (
            <Button variant="primary" disabled={open.isPending} onClick={() => open.mutate()}>
              Mở phiếu kiểm kê
            </Button>
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {countId === null ? (
          <p className="text-[length:var(--fs-b2)] text-ink-mute">
            Chưa mở phiếu nào. Mở phiếu sẽ chụp lại tồn sổ của mọi nguyên liệu đang dùng làm mốc so.
          </p>
        ) : sheet.isPending ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : data ? (
          <CountSheetView
            sheet={data}
            draft={draft}
            editable={data.state === 'counting' && mayCount}
            canClose={data.state === 'counting' && mayClose}
            busy={save.isPending || close.isPending}
            onDraft={setDraft}
            onSave={() => save.mutate()}
            onClose={() => close.mutate()}
          />
        ) : null}
      </div>
    </>
  )
}

function CountSheetView({
  sheet,
  draft,
  editable,
  canClose,
  busy,
  onDraft,
  onSave,
  onClose,
}: {
  sheet: CountSheet
  draft: Record<string, string>
  editable: boolean
  canClose: boolean
  busy: boolean
  onDraft: (next: Record<string, string>) => void
  onSave: () => void
  onClose: () => void
}) {
  return (
    <>
      <div className="flex flex-wrap items-center gap-4 rounded-md border border-line-1 bg-surface-1 px-5 py-4">
        <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">Phiếu #{sheet.id}</span>
        <Badge tone={sheet.state === 'counting' ? 'accent' : sheet.state === 'closed' ? 'ok' : 'neutral'}>
          {sheet.state === 'counting' ? 'Đang đếm' : sheet.state === 'closed' ? 'Đã chốt' : 'Đã huỷ'}
        </Badge>
        <span className="text-[length:var(--fs-c1)] text-ink-mute">
          {sheet.countedLines}/{sheet.lines.length} dòng đã đếm · mở {formatTime(sheet.openedAt)}
        </span>
        <span className="ml-auto font-mono text-[length:var(--fs-b2)] text-ink-hi">
          Lệch {formatVnd(sheet.diffVnd)}
        </span>
        {editable ? (
          <Button disabled={busy} onClick={onSave}>
            Lưu số đếm
          </Button>
        ) : null}
        {canClose ? (
          <Button variant="primary" disabled={busy} onClick={onClose}>
            Chốt kiểm kê
          </Button>
        ) : null}
      </div>

      <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
        <div className="grid grid-cols-[1fr_140px_130px_140px_140px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
          <span>Nguyên liệu</span>
          <span className="text-right">Tồn sổ</span>
          <span className="text-right">Đếm được</span>
          <span className="text-right">Lệch</span>
          <span className="text-right">Thành tiền</span>
        </div>

        {sheet.lines.map((line) => {
          const typed = draft[line.ingredientId]
          const counted = typed !== undefined && typed !== '' ? Number(typed) : line.countedBase
          const diff = counted === null ? null : counted - line.snapshotBase
          return (
            <div
              key={line.ingredientId}
              className="grid grid-cols-[1fr_140px_130px_140px_140px] items-center gap-3 border-b border-line-1 px-5 py-2 last:border-b-0"
            >
              <span className="min-w-0 truncate text-[length:var(--fs-b2)] text-ink-hi">
                {line.ingredientName}
                <span className="ml-2 text-[length:var(--fs-c1)] text-ink-mute">{line.baseUnit}</span>
              </span>
              <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {line.snapshotBase}
              </span>
              <span className="flex justify-end">
                {editable ? (
                  <input
                    type="number"
                    value={typed ?? (line.countedBase === null ? '' : String(line.countedBase))}
                    onChange={(e) => onDraft({ ...draft, [line.ingredientId]: e.target.value })}
                    className="h-8 w-[100px] rounded-sm border border-line-1 bg-canvas px-2 text-right font-mono text-[length:var(--fs-c1)] text-ink-hi"
                  />
                ) : (
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
                    {line.countedBase ?? '—'}
                  </span>
                )}
              </span>
              <span
                className={`text-right font-mono text-[length:var(--fs-c1)] ${
                  diff === null ? 'text-line-4' : diff === 0 ? 'text-ink-mute' : diff < 0 ? 'text-danger' : 'text-ok'
                }`}
              >
                {diff === null ? 'chưa đếm' : diff > 0 ? `+${diff}` : diff}
              </span>
              <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {line.diffVnd === null ? '—' : formatVnd(line.diffVnd)}
              </span>
            </div>
          )
        })}
      </div>

      <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Dòng để trống là "chưa đếm tới", KHÔNG phải "đếm được 0" — chốt phiếu sẽ bỏ qua chúng, tồn
        của chúng không đổi. Chốt là thao tác có hệ quả tiền: chênh lệch thành chi phí trên Lãi/Lỗ
        ngay lúc bấm, nên thủ kho cần một người khác duyệt.
      </p>
    </>
  )
}

// ==================================================================== S10

export function Transfers() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState({ toBranchId: '', ingredientId: '', qtyBase: 0 })

  const maySend = can('stock.write-off')
  const mayReceive = can('stock.receive')

  const transfers = useQuery({
    queryKey: ['transfers', branchId],
    queryFn: () => api.transfers(branchId!),
    enabled: Boolean(branchId),
  })
  const branches = useQuery({ queryKey: ['admin-branches'], queryFn: api.branches })
  const ingredients = useQuery({
    queryKey: ['ingredients', branchId],
    queryFn: () => api.ingredients(branchId!),
    enabled: Boolean(branchId),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['transfers'] })
    void queryClient.invalidateQueries({ queryKey: ['ingredients'] })
  }

  const send = useMutation({
    mutationFn: () =>
      api.sendTransfer({
        fromBranchId: branchId!,
        toBranchId: form.toBranchId,
        note: null,
        lines: [{ ingredientId: form.ingredientId, qtyBase: form.qtyBase }],
      }),
    onSuccess: (res) => {
      toast(`Đã gửi phiếu ${res.displayCode}`, 'ok')
      setForm({ ...form, ingredientId: '', qtyBase: 0 })
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const receive = useMutation({
    mutationFn: (transfer: TransferRow) =>
      api.receiveTransfer(
        transfer.id,
        transfer.lines.map((l) => ({ ingredientId: l.ingredientId, receivedBase: l.qtyBase })),
      ),
    onSuccess: (res) => {
      toast(
        res.shortageVnd > 0
          ? `Đã nhận — thiếu ${formatVnd(res.shortageVnd)} ghi hao ở bên gửi`
          : 'Đã nhận đủ',
        'ok',
      )
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const rows = transfers.data ?? []
  const others = (branches.data ?? []).filter((b) => b.id !== branchId && b.active)

  return (
    <>
      <PageHeader
        title="Chuyển kho"
        subtitle="Xác nhận hai đầu. Hàng rời kho bên gửi là thật ngay lúc gửi; bên nhận chỉ có hàng khi họ xác nhận."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {transfers.isError ? <ErrorState message={(transfers.error as Error).message} /> : null}

        {maySend ? (
          <section className="rounded-md border border-line-1 bg-surface-1 p-5">
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Chuyển tới">
                <select
                  value={form.toBranchId}
                  onChange={(e) => setForm({ ...form, toBranchId: e.target.value })}
                  className="h-9 min-w-[180px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
                >
                  <option value="">Chọn chi nhánh…</option>
                  {others.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Nguyên liệu">
                <select
                  value={form.ingredientId}
                  onChange={(e) => setForm({ ...form, ingredientId: e.target.value })}
                  className="h-9 min-w-[240px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
                >
                  <option value="">Chọn…</option>
                  {(ingredients.data ?? []).map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name} — còn {i.qtyBase} {i.baseUnit}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Lượng">
                <input
                  type="number"
                  value={form.qtyBase || ''}
                  onChange={(e) => setForm({ ...form, qtyBase: Math.round(Number(e.target.value)) || 0 })}
                  className="h-9 w-[130px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
                />
              </Field>
              <Button
                variant="primary"
                disabled={send.isPending || !form.toBranchId || !form.ingredientId || form.qtyBase <= 0}
                onClick={() => send.mutate()}
              >
                Gửi hàng
              </Button>
            </div>
            <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Chuyển nhiều hơn tồn sẽ bị từ chối — ở đây chưa có gì xảy ra ngoài đời nên từ chối là
              sửa được, còn cho tồn âm là hai kho cùng sai.
            </p>
          </section>
        ) : null}

        <div className="mt-5 flex flex-col gap-3">
          {transfers.isPending ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : rows.length === 0 ? (
            <p className="text-[length:var(--fs-b2)] text-ink-mute">Chưa có phiếu chuyển nào.</p>
          ) : (
            rows.map((transfer) => (
              <section
                key={transfer.id}
                className="overflow-hidden rounded-md border border-line-1 bg-surface-1"
              >
                <div className="flex flex-wrap items-center gap-4 px-5 py-3">
                  <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
                    {transfer.displayCode}
                  </span>
                  <Badge tone={transfer.direction === 'out' ? 'neutral' : 'accent'}>
                    {transfer.direction === 'out'
                      ? `gửi đi ${transfer.toBranchId}`
                      : `nhận từ ${transfer.fromBranchId}`}
                  </Badge>
                  <Badge tone={transfer.state === 'received' ? 'ok' : 'warn'}>
                    {transfer.state === 'received' ? 'Đã nhận' : 'Đang đi đường'}
                  </Badge>
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {formatDay(transfer.businessDate)}
                    {transfer.sentByName ? ` · ${transfer.sentByName}` : ''}
                  </span>
                  {transfer.direction === 'in' && transfer.state === 'sent' && mayReceive ? (
                    <Button
                      className="ml-auto"
                      variant="primary"
                      disabled={receive.isPending}
                      onClick={() => receive.mutate(transfer)}
                    >
                      Nhận đủ
                    </Button>
                  ) : null}
                </div>
                <div className="border-t border-line-1 bg-canvas">
                  {transfer.lines.map((line) => (
                    <div
                      key={line.ingredientId}
                      className="grid grid-cols-[1fr_150px_150px] items-center gap-3 border-b border-line-1 px-5 py-2 last:border-b-0"
                    >
                      <span className="truncate text-[length:var(--fs-c1)] text-ink-body">
                        {line.ingredientName}
                      </span>
                      <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-hi">
                        gửi {line.qtyBase} {line.baseUnit}
                      </span>
                      <span className="text-right font-mono text-[length:var(--fs-c1)]">
                        {line.receivedBase === null ? (
                          <span className="text-ink-mute">chưa nhận</span>
                        ) : line.receivedBase === line.qtyBase ? (
                          <span className="text-ok">nhận đủ</span>
                        ) : (
                          <span className="text-danger">nhận {line.receivedBase}</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Nhận thiếu thì phần chênh thành hao ở BÊN GỬI — hàng rời kho họ mà không tới nơi là hàng
          họ mất. Ghi hao ở bên nhận sẽ làm chi nhánh nhận gánh hao của quãng đường họ không đi.
        </p>
      </div>
    </>
  )
}
