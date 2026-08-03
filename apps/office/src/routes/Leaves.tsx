import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type LeaveKind, type LeaveRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * H5 — Yêu cầu nghỉ & đổi ca.
 *
 * Một hàng đợi cho cả hai loại, vì chúng đi qua cùng một luồng duyệt và có cùng
 * hệ quả: duyệt xong thì lịch H2 và bảng công H4 đổi theo ngay, không ai phải
 * vào sửa lịch bằng tay lần nữa.
 *
 * Đổi ca là MỘT bản ghi mang cả hai người. Duyệt nửa cặp nghĩa là một người có
 * hai ca còn người kia không có ca nào — và cái sai đó chỉ lộ ra vào tối hôm đó.
 */

const KIND_LABELS: Record<LeaveKind, string> = {
  'nghi-phep': 'Nghỉ phép',
  'nghi-khong-luong': 'Nghỉ không lương',
  'nghi-om': 'Nghỉ ốm',
  'doi-ca': 'Đổi ca',
}

const today = () => new Date().toISOString().slice(0, 10)

interface Draft {
  employeeId: number
  kind: LeaveKind
  fromDate: string
  toDate: string
  counterpartId: number | null
  reason: string
}

export function Leaves() {
  const { branchId } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)
  const [showDecided, setShowDecided] = useState(false)

  const list = useQuery({
    queryKey: ['leaves', branchId],
    queryFn: () => api.leaves(branchId!),
    enabled: Boolean(branchId),
  })
  const employees = useQuery({
    queryKey: ['employees', branchId],
    queryFn: () => api.employees(branchId!),
    enabled: Boolean(branchId),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['leaves'] })
    void queryClient.invalidateQueries({ queryKey: ['schedule'] })
    void queryClient.invalidateQueries({ queryKey: ['timesheet'] })
  }

  const create = useMutation({
    mutationFn: (input: Draft) => api.createLeave({ branchId: branchId!, ...input }),
    onSuccess: () => {
      toast('Đã gửi yêu cầu', 'ok')
      setDraft(null)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const decide = useMutation({
    mutationFn: ({ id, approve, note }: { id: number; approve: boolean; note: string | null }) =>
      api.decideLeave(id, branchId!, approve, note),
    onSuccess: (res) => {
      toast(
        res.state === 'approved'
          ? res.shiftsChanged > 0
            ? `Đã duyệt — lịch đổi ${res.shiftsChanged} ca`
            : 'Đã duyệt'
          : 'Đã từ chối',
        'ok',
      )
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const rows = list.data ?? []
  const pending = rows.filter((r) => r.state === 'pending')
  const decided = rows.filter((r) => r.state !== 'pending')
  const people = (employees.data ?? []).filter((e) => e.active)

  return (
    <>
      <PageHeader
        title="Nghỉ phép & đổi ca"
        subtitle="Duyệt xong là lịch và bảng công tự đổi theo — không ai phải vào sửa lịch bằng tay lần nữa."
        action={
          draft ? null : (
            <Button
              variant="primary"
              disabled={people.length === 0}
              onClick={() =>
                setDraft({
                  employeeId: people[0]!.id,
                  kind: 'nghi-phep',
                  fromDate: today(),
                  toDate: today(),
                  counterpartId: null,
                  reason: '',
                })
              }
            >
              Ghi hộ yêu cầu
            </Button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {list.isError ? <ErrorState message={(list.error as Error).message} /> : null}

        {draft ? (
          <LeaveForm
            draft={draft}
            people={people.map((p) => ({ id: p.id, fullName: p.fullName }))}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => create.mutate(draft)}
            saving={create.isPending}
          />
        ) : null}

        <section className="mt-5">
          <h2 className="mb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Chờ duyệt ({pending.length})
          </h2>
          <div className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
            {list.isPending ? (
              <p className="px-5 py-4 text-ink-mute">Đang tải…</p>
            ) : pending.length === 0 ? (
              <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
                Không có yêu cầu nào đang chờ.
              </p>
            ) : (
              pending.map((row) => (
                <PendingLine
                  key={row.id}
                  row={row}
                  busy={decide.isPending}
                  onDecide={(approve, note) => decide.mutate({ id: row.id, approve, note })}
                />
              ))
            )}
          </div>
        </section>

        {decided.length > 0 ? (
          <section className="mt-5">
            <button
              type="button"
              onClick={() => setShowDecided(!showDecided)}
              className="mb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase"
            >
              Đã quyết ({decided.length}) {showDecided ? '▾' : '▸'}
            </button>
            {showDecided ? (
              <div className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
                {decided.map((row) => (
                  <div
                    key={row.id}
                    className="grid grid-cols-[1fr_150px_200px_1fr_150px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0 opacity-70"
                  >
                    <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.employeeName}
                    </span>
                    <span className="text-[length:var(--fs-c1)] text-ink-body">
                      {KIND_LABELS[row.kind]}
                    </span>
                    <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {formatDay(row.fromDate)}
                      {row.toDate !== row.fromDate ? ` – ${formatDay(row.toDate)}` : ''}
                    </span>
                    <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
                      {row.decisionNote ?? row.reason}
                    </span>
                    <span className="flex items-center gap-2">
                      {row.state === 'approved' ? (
                        <Badge tone="ok">Đã duyệt</Badge>
                      ) : (
                        <Badge tone="danger">Từ chối</Badge>
                      )}
                      <span className="text-[length:var(--fs-c2)] text-ink-mute">
                        {row.decidedBy}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Duyệt nghỉ thì ca của những ngày đó rời khỏi lịch, nên bảng công không đếm chúng là ngày
          thiếu. Duyệt đổi ca thì hai ô lịch đổi chỗ và quay về trạng thái nháp — công bố lại để
          nhân viên thấy. Chưa có trong bản dựng này: số ngày phép còn lại theo từng người.
        </p>
      </div>
    </>
  )
}

function PendingLine({
  row,
  busy,
  onDecide,
}: {
  row: LeaveRow
  busy: boolean
  onDecide: (approve: boolean, note: string | null) => void
}) {
  const [note, setNote] = useState('')

  return (
    <div className="border-b border-line-1 px-5 py-3 last:border-b-0">
      <div className="grid grid-cols-[1fr_150px_200px_1fr_auto] items-center gap-3">
        <span className="min-w-0">
          <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
            {row.employeeName}
          </span>
          {row.counterpartName ? (
            <span className="mt-0.5 block text-[length:var(--fs-c1)] text-accent-ink">
              đổi ca với {row.counterpartName}
            </span>
          ) : null}
        </span>
        <span className="text-[length:var(--fs-c1)] text-ink-body">{KIND_LABELS[row.kind]}</span>
        <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
          {formatDay(row.fromDate)}
          {row.toDate !== row.fromDate ? ` – ${formatDay(row.toDate)}` : ''}
        </span>
        <span className="truncate text-[length:var(--fs-c1)] text-ink-body">{row.reason}</span>
        <span className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Ghi chú khi quyết"
            className="h-8 w-[180px] rounded-sm border border-line-1 bg-canvas px-2 text-[length:var(--fs-c1)] text-ink-hi"
          />
          <Button
            disabled={busy}
            onClick={() => onDecide(true, note || null)}
            size="sm"
            variant="success"
          >
            Duyệt
          </Button>
          <Button
            disabled={busy}
            onClick={() => onDecide(false, note || null)}
            size="sm"
            variant="danger"
          >
            Từ chối
          </Button>
        </span>
      </div>
    </div>
  )
}

function LeaveForm({
  draft,
  people,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: Draft
  people: { id: number; fullName: string }[]
  onChange: (next: Draft) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    onChange({ ...draft, [key]: value })

  const changeKind = (kind: LeaveKind) =>
    onChange({
      ...draft,
      kind,
      // Đổi ca phải có người nhận; nghỉ phép thì không được có
      counterpartId:
        kind === 'doi-ca'
          ? (draft.counterpartId ?? people.find((p) => p.id !== draft.employeeId)?.id ?? null)
          : null,
    })

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="grid gap-4 lg:grid-cols-5">
        <Field label="Nhân viên">
          <select
            value={draft.employeeId}
            onChange={(e) => set('employeeId', Number(e.target.value))}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            {people.map((p) => (
              <option key={p.id} value={p.id}>
                {p.fullName}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Loại">
          <select
            value={draft.kind}
            onChange={(e) => changeKind(e.target.value as LeaveKind)}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            {(Object.keys(KIND_LABELS) as LeaveKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        {draft.kind === 'doi-ca' ? (
          <Field label="Người nhận ca">
            <select
              value={draft.counterpartId ?? ''}
              onChange={(e) => set('counterpartId', Number(e.target.value) || null)}
              className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
            >
              <option value="">Chọn người…</option>
              {people
                .filter((p) => p.id !== draft.employeeId)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.fullName}
                  </option>
                ))}
            </select>
          </Field>
        ) : (
          <div />
        )}

        <Field label="Từ ngày">
          <DateInput value={draft.fromDate} onChange={(v) => set('fromDate', v)} />
        </Field>
        <Field label="Đến ngày">
          <DateInput value={draft.toDate} onChange={(v) => set('toDate', v)} />
        </Field>
      </div>

      <div className="mt-4">
        <Field label="Lý do">
          <input
            value={draft.reason}
            onChange={(e) => set('reason', e.target.value)}
            placeholder="Về quê giỗ"
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
      </div>

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onCancel}>Bỏ</Button>
        <Button
          variant="primary"
          disabled={
            saving ||
            draft.reason.trim() === '' ||
            (draft.kind === 'doi-ca' && !draft.counterpartId)
          }
          onClick={onSave}
        >
          Gửi yêu cầu
        </Button>
      </div>
    </section>
  )
}
