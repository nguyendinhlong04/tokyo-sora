import { Button, Card, EmptyState, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type LateReservation } from '../api'
import { useSession } from '../session-context'
import { hhmm, ReservationDrawer } from './ReservationDrawer'

const SOURCE_LABEL: Record<string, string> = {
  web: 'Đặt trên web',
  phone: 'Gọi điện',
  walkin: 'Khách vãng lai',
}

/**
 * R4 — quá giờ &amp; no-show.
 *
 * Bản thiết kế còn một nửa nữa: hàng đợi nhắc hẹn 24h/2h qua Messenger/Zalo. Nửa
 * đó cần kênh gửi tin ở Mục 30.3 — chưa dựng, mà một bảng "đã nhắc" không có ai
 * gửi thì tệ hơn là không có. Nửa làm được là nửa quan trọng hơn với ca đang
 * chạy: ai đã quá giờ, gọi số nào, và khi nào thì được buông bàn.
 */
export function LateReservations() {
  const { branchId } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [openId, setOpenId] = useState<number | null>(null)

  const late = useQuery({
    queryKey: ['reservations-late', branchId],
    queryFn: () => api.lateReservations(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 30_000,
  })

  const stats = useQuery({
    queryKey: ['no-show-stats', branchId],
    queryFn: () => api.noShowStats(branchId!),
    enabled: Boolean(branchId),
  })

  const noShow = useMutation({
    mutationFn: (row: LateReservation) => api.noShowReservation(row.id),
    onSuccess: (_result, row) => {
      toast(`${row.customerName} · đã đánh no-show`, 'warn')
      void queryClient.invalidateQueries({ queryKey: ['reservations-late', branchId] })
      void queryClient.invalidateQueries({ queryKey: ['reservations'] })
      void queryClient.invalidateQueries({ queryKey: ['no-show-stats', branchId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const rows = late.data?.rows ?? []

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col">
      <header className="flex flex-none items-start gap-4 px-6 pt-5 pb-4">
        <div>
          <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
            Quá giờ &amp; no-show
          </h1>
          <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
            Giữ bàn {late.data?.holdMinutes ?? 15} phút sau giờ hẹn. Gọi khách trước khi buông bàn —
            phần lớn người tới muộn vẫn tới.
          </p>
        </div>
        <Button variant="ghost" className="ml-auto" onClick={() => void navigate('/dat-cho')}>
          Bảng đặt bàn
        </Button>
      </header>

      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-6 pb-6 xl:grid-cols-[1fr_380px]">
        <div>
          {late.isPending ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : rows.length === 0 ? (
            <EmptyState title="Không có ai quá giờ. Suất tới giờ mà chưa thấy khách sẽ tự hiện ở đây." />
          ) : (
            <div className="grid gap-2.5">
              {rows.map((row) => (
                <Card key={row.id} className="flex flex-wrap items-center gap-4 p-4">
                  <span className="w-16 flex-none font-mono text-[length:var(--fs-t1)] text-accent-ink">
                    {hhmm(row.slotAt)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                      {row.customerName}
                    </span>
                    <span className="mt-1 block text-[length:var(--fs-c1)] text-ink-mute">
                      {row.guestCount} khách · {SOURCE_LABEL[row.source] ?? row.source}
                    </span>
                  </span>
                  <span
                    className={`flex-none text-[length:var(--fs-b2)] ${
                      row.canNoShow ? 'text-danger' : 'text-warn'
                    }`}
                  >
                    Trễ {row.lateMinutes} phút
                  </span>
                  {/* Gọi được ngay trên máy POS Android — số hiện đủ để đọc qua điện thoại bàn */}
                  <a
                    href={`tel:${row.customerPhone.replace(/\s/g, '')}`}
                    className="inline-flex h-[var(--hit-target)] flex-none items-center rounded-sm border border-accent px-4 font-mono text-[length:var(--fs-b2)] text-accent-ink"
                  >
                    {row.customerPhone}
                  </a>
                  <Button onClick={() => setOpenId(row.id)}>Chi tiết</Button>
                  <Button
                    variant="danger"
                    disabled={!row.canNoShow || noShow.isPending}
                    onClick={() => noShow.mutate(row)}
                  >
                    {row.canNoShow ? 'No-show' : 'Còn giữ bàn'}
                  </Button>
                </Card>
              ))}
            </div>
          )}
        </div>

        <Card className="h-fit p-5">
          <SectionLabel>Tỉ lệ no-show {stats.data ? `${stats.data.days} ngày qua` : ''}</SectionLabel>
          <div className="mt-4 grid gap-3">
            {(stats.data?.sources ?? []).length === 0 ? (
              <p className="text-[length:var(--fs-c1)] text-ink-mute">Chưa đủ dữ liệu.</p>
            ) : (
              stats.data!.sources.map((source) => (
                <div key={source.source}>
                  <div className="flex items-baseline justify-between">
                    <span className="text-[length:var(--fs-b2)] text-ink-hi">
                      {SOURCE_LABEL[source.source] ?? source.source}
                    </span>
                    <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
                      {source.rate}% · {source.noShow}/{source.total}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 rounded-pill bg-line-1">
                    <div
                      className={`h-1.5 rounded-pill ${
                        source.rate > 10 ? 'bg-danger' : source.rate > 5 ? 'bg-warn' : 'bg-ok'
                      }`}
                      style={{ width: `${Math.min(100, source.rate * 5)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
          <p className="mt-5 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Con số này là căn cứ để quyết có bắt đặt cọc phòng riêng hay không — nên chỉ đánh
            no-show khi đã thật sự hết giờ giữ bàn.
          </p>
        </Card>
      </div>

      {openId !== null ? (
        <ReservationDrawer reservationId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  )
}
