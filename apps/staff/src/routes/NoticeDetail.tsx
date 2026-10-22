import { safeHref } from '@sora/core'
import { Badge, Button, ErrorState, SectionLabel, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { api } from '../api'
import { IconBack } from '../icons'

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : ''

/**
 * N13 — Một thông báo. Mở ra là ghi "đã đọc" (một lần, mở lại không đổi mốc);
 * văn bản cần xác nhận thì nút "Tôi đã đọc và hiểu" dính đáy, trong tầm ngón cái.
 */
export function NoticeDetail() {
  const { id } = useParams()
  const docId = Number(id)
  const toast = useToast()
  const queryClient = useQueryClient()
  const notice = useQuery({ queryKey: ['notice', docId], queryFn: () => api.notice(docId) })

  const mark = useMutation({
    mutationFn: (ack: boolean) => api.markNotice(docId, ack),
    onSuccess: (_, ack) => {
      if (ack) toast('Đã xác nhận', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['notices'] })
      void queryClient.invalidateQueries({ queryKey: ['notice', docId] })
      void queryClient.invalidateQueries({ queryKey: ['inbox'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  // Chỉ theo văn bản: `mark` đổi mỗi lần render, đưa vào phụ thuộc là gọi lặp
  useEffect(() => {
    if (notice.data && !notice.data.readAt) mark.mutate(false)
  }, [notice.data?.id])

  if (notice.isPending) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-6 w-3/4" />
        <Skeleton className="h-40" />
      </div>
    )
  }
  if (notice.isError) return <ErrorState message={(notice.error as Error).message} />

  const doc = notice.data
  const acked = Boolean(doc.ackedAt)

  return (
    <article className="flex flex-col gap-5 pb-20">
      <Link
        to="/thong-bao"
        className="-ml-2 flex h-[var(--hit-target)] w-fit items-center gap-1 rounded-sm px-2 text-[length:var(--fs-b2)] text-ink-mute"
      >
        <IconBack /> Thông báo
      </Link>
      <header className="flex flex-col gap-1">
        <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">{doc.title}</h1>
        <p className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
          {doc.number} · {formatDate(doc.signedAt)}
          {doc.signerName ? ` · ${doc.signerName}` : ''}
        </p>
      </header>
      <p className="text-[length:var(--fs-b1)] leading-relaxed whitespace-pre-wrap text-ink-hi">
        {doc.body}
      </p>
      {doc.attachments.length > 0 ? (
        <section className="flex flex-col gap-2">
          <SectionLabel>Đính kèm</SectionLabel>
          {doc.attachments.map((a, i) => {
            const href = safeHref(a.url)
            return href ? (
              <a
                key={i}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                className="flex min-h-[var(--hit-target)] items-center text-[length:var(--fs-b1)] text-accent-ink underline"
              >
                {a.name}
              </a>
            ) : (
              <span key={i} className="text-[length:var(--fs-b2)] text-ink-mute">
                {a.name}
              </span>
            )
          })}
        </section>
      ) : null}

      {doc.requiresAck ? (
        <div className="fixed inset-x-0 bottom-[calc(56px+env(safe-area-inset-bottom))] z-10 border-t border-line-2 bg-canvas px-5 py-3">
          <div className="mx-auto max-w-lg">
            {acked ? (
              <Badge tone="ok">Đã xác nhận {formatDate(doc.ackedAt)}</Badge>
            ) : (
              <Button
                block
                size="lg"
                variant="primary"
                disabled={mark.isPending}
                onClick={() => mark.mutate(true)}
              >
                Tôi đã đọc và hiểu
              </Button>
            )}
          </div>
        </div>
      ) : null}
    </article>
  )
}
