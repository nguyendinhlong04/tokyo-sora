import { Button, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type AuditRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatTime } from '../components/report'
import { useSession } from '../session-context'

/**
 * A7 — Nhật ký thao tác.
 *
 * Sổ này CHỈ ĐỌC, và không có nút xoá nào vì bảng `audit_log` là sổ bất biến được
 * cưỡng chế bằng hai lớp (role không có UPDATE/DELETE, và trigger chặn). Một nhật
 * ký sửa được thì không phải nhật ký.
 *
 * Quyền `audit.view-log` rộng hơn hẳn các màn quản trị khác — R7 · R8 · R11 · R10.
 * Đó là điều §4.2 nói: quản lý ca phải đọc được nhật ký ca mình mà không cần
 * quyền tạo tài khoản.
 */

const today = () => new Date().toISOString().slice(0, 10)
const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10)

export function AuditLog() {
  const { branchId } = useSession()
  const [from, setFrom] = useState(daysAgo(7))
  const [to, setTo] = useState(today())
  const [action, setAction] = useState('')
  const [actorId, setActorId] = useState('')
  const [allBranches, setAllBranches] = useState(false)
  /** Ngăn xếp con trỏ — lùi lại là bỏ phần tử cuối, không phải trừ offset */
  const [cursors, setCursors] = useState<number[]>([])

  const scope = allBranches ? null : branchId
  const beforeId = cursors.at(-1) ?? null

  const filters = useQuery({
    queryKey: ['audit-filters', scope, from, to],
    queryFn: () => api.auditFilters({ branchId: scope, from, to }),
  })

  const page = useQuery({
    queryKey: ['audit', scope, from, to, action, actorId, beforeId],
    queryFn: () =>
      api.auditTrail({
        branchId: scope,
        from,
        to,
        action: action || null,
        actorId: actorId ? Number(actorId) : null,
        beforeId,
      }),
  })

  /** Đổi bộ lọc là quay về trang đầu — con trỏ cũ thuộc về tập kết quả khác */
  const reset = <T,>(set: (v: T) => void) => (value: T) => {
    setCursors([])
    set(value)
  }

  const rows = page.data?.rows ?? []

  return (
    <>
      <PageHeader
        title="Nhật ký thao tác"
        subtitle="Mọi hành động nhạy cảm để lại một dòng ở đây. Sổ bất biến — chỉ đọc, không sửa được kể cả từ máy chủ."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <section className="flex flex-wrap items-end gap-x-6 gap-y-4 rounded-md border border-line-1 bg-surface-1 px-5 py-4">
          <Field label="Từ ngày">
            <DateInput value={from} onChange={reset(setFrom)} />
          </Field>
          <Field label="Đến ngày">
            <DateInput value={to} onChange={reset(setTo)} />
          </Field>

          <Field label="Hành động">
            <select
              value={action}
              onChange={(e) => reset(setAction)(e.target.value)}
              className="h-9 min-w-[220px] rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            >
              <option value="">Tất cả</option>
              {(filters.data?.actions ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Người thao tác">
            <select
              value={actorId}
              onChange={(e) => reset(setActorId)(e.target.value)}
              className="h-9 min-w-[180px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
            >
              <option value="">Tất cả</option>
              {(filters.data?.actors ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Phạm vi">
            <button
              type="button"
              onClick={() => {
                setCursors([])
                setActorId('')
                setAction('')
                setAllBranches(!allBranches)
              }}
              className={`h-9 rounded-sm border px-3 text-[length:var(--fs-c1)] ${
                allBranches ? 'border-accent text-accent-ink' : 'border-line-3 text-ink-mute'
              }`}
            >
              {allBranches ? 'Cả chuỗi' : `Chi nhánh ${branchId ?? ''}`}
            </button>
          </Field>
        </section>

        {page.isError ? (
          <div className="mt-5">
            <ErrorState message={(page.error as Error).message} />
          </div>
        ) : null}

        <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="grid grid-cols-[150px_170px_1fr_190px_60px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Lúc</span>
            <span>Ai</span>
            <span>Hành động</span>
            <span>Đối tượng</span>
            <span>Chi nhánh</span>
          </div>

          {page.isPending ? (
            <p className="px-5 py-4 text-ink-mute">Đang tải…</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
              Không có thao tác nào khớp bộ lọc trong khoảng này.
            </p>
          ) : (
            rows.map((row) => <AuditLine key={row.id} row={row} />)
          )}
        </div>

        <div className="mt-4 flex items-center gap-3">
          <Button disabled={cursors.length === 0} onClick={() => setCursors(cursors.slice(0, -1))}>
            Trang trước
          </Button>
          <Button
            disabled={page.data?.nextBefore == null}
            onClick={() => setCursors([...cursors, page.data!.nextBefore!])}
          >
            Trang sau
          </Button>
          <p className="text-[length:var(--fs-c1)] text-ink-mute">
            Trang {cursors.length + 1} · 50 dòng mỗi trang, mới nhất trước
          </p>
        </div>
      </div>
    </>
  )
}

function AuditLine({ row }: { row: AuditRow }) {
  const [open, setOpen] = useState(false)
  const hasPayload = row.payload !== null && row.payload !== undefined

  return (
    <div className="border-b border-line-1 last:border-b-0">
      <div className="grid grid-cols-[150px_170px_1fr_190px_60px] items-baseline gap-3 px-5 py-2.5">
        <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
          {formatStamp(row.createdAt)}
        </span>
        <span className="min-w-0 truncate text-[length:var(--fs-c1)] text-ink-body">
          {row.actorName ?? actorFallback(row)}
        </span>
        <span className="min-w-0">
          <button
            type="button"
            disabled={!hasPayload}
            onClick={() => setOpen(!open)}
            className="text-left font-mono text-[length:var(--fs-c1)] text-ink-hi disabled:cursor-default"
          >
            {row.action}
            {hasPayload ? <span className="ml-2 text-ink-mute">{open ? '▾' : '▸'}</span> : null}
          </button>
        </span>
        <span className="min-w-0 truncate font-mono text-[length:var(--fs-c1)] text-ink-mute">
          {row.entity} #{row.entityId}
        </span>
        <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
          {row.branchId ?? '—'}
        </span>
      </div>

      {open && hasPayload ? (
        <pre className="mx-5 mb-3 overflow-x-auto rounded-sm border border-line-1 bg-canvas px-4 py-3 font-mono text-[length:var(--fs-c2)] leading-relaxed text-ink-body">
          {JSON.stringify(row.payload, null, 2)}
        </pre>
      ) : null}
    </div>
  )
}

/** Không phải thao tác nào cũng do người: thiết bị, khách tại bàn, khách web, tác vụ nền */
function actorFallback(row: AuditRow): string {
  switch (row.actorKind) {
    case 'device':
      return `Thiết bị #${row.actorId ?? '?'}`
    case 'customer':
      return 'Khách tại bàn'
    case 'guest':
      return 'Khách trên web'
    case 'system':
      return 'Hệ thống'
    default:
      return row.actorId ?? '—'
  }
}

function formatStamp(iso: string): string {
  const d = new Date(iso)
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')} ${formatTime(iso)}`
}
