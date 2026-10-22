import { DECISION_TYPE_LABELS, DOC_KIND_LABELS, type MyDocument } from '@sora/contracts'
import { Badge, EmptyState, ErrorState, SectionLabel, Skeleton } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { api } from '../api'

/**
 * N13 — Thông báo của tôi.
 *
 * Việc cần xác nhận lên đầu: nội quy, quy định ATTP mà người lao động phải bấm
 * "đã đọc và hiểu" — đó là bằng chứng quán đã phổ biến, không phải thủ tục.
 */
export function Notices() {
  const notices = useQuery({ queryKey: ['notices'], queryFn: api.notices })

  if (notices.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-5 w-32" />
        <Skeleton className="h-20" />
        <Skeleton className="h-20" />
      </div>
    )
  }
  if (notices.isError) return <ErrorState message={(notices.error as Error).message} />

  const rows = notices.data
  if (rows.length === 0) {
    return <EmptyState title="Chưa có thông báo nào gửi bạn." />
  }

  const toAck = rows.filter((d) => d.requiresAck && !d.ackedAt)
  const rest = rows.filter((d) => !(d.requiresAck && !d.ackedAt))

  return (
    <div className="flex flex-col gap-6">
      {toAck.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Cần bạn xác nhận</SectionLabel>
          {toAck.map((d) => (
            <NoticeRow key={d.id} doc={d} />
          ))}
        </section>
      ) : null}
      {rest.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Thông báo</SectionLabel>
          {rest.map((d) => (
            <NoticeRow key={d.id} doc={d} />
          ))}
        </section>
      ) : null}
    </div>
  )
}

function NoticeRow({ doc }: { doc: MyDocument }) {
  const kind = doc.decisionType
    ? `${DOC_KIND_LABELS[doc.kind]} ${DECISION_TYPE_LABELS[doc.decisionType].toLowerCase()}`
    : DOC_KIND_LABELS[doc.kind]
  return (
    <Link
      to={`/thong-bao/${doc.id}`}
      className="flex min-h-[var(--hit-target)] flex-col gap-1 rounded-md border border-line-2 bg-surface-1 px-4 py-3 focus-visible:outline-2 focus-visible:outline-accent"
    >
      <span className="flex items-center gap-2">
        {!doc.readAt ? (
          <span aria-label="Chưa đọc" className="size-2 rounded-pill bg-accent" />
        ) : null}
        <span
          className={[
            'min-w-0 flex-1 text-[length:var(--fs-b1)]',
            doc.readAt ? 'text-ink-body' : 'font-semibold text-ink-hi',
          ].join(' ')}
        >
          {doc.title}
        </span>
      </span>
      <span className="flex items-center gap-2 text-[length:var(--fs-c1)] text-ink-mute">
        {kind} · {doc.number}
        {doc.requiresAck && !doc.ackedAt ? <Badge tone="warn">Cần xác nhận</Badge> : null}
      </span>
    </Link>
  )
}
