import { Button, Card, EmptyState, Money, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { useSession } from '../session-context'

/** Mệnh giá đếm két — bấm cộng dồn thay vì gõ cả con số */
const NOTES = [500_000, 200_000, 100_000, 50_000, 20_000, 10_000]

const KIND_LABEL: Record<string, string> = {
  cash: 'Tiền mặt',
  vietqr: 'Chuyển khoản VietQR',
  cod: 'COD shipper nộp',
  card: 'Thẻ',
}

/**
 * P14 Đóng ca.
 *
 * Số của hệ thống hiện TRƯỚC, ô đếm thực tế để trống — và chênh lệch chỉ hiện sau
 * khi có người gõ số. Điền sẵn số hệ thống vào ô đếm là mời người ta bấm qua mà
 * không đếm, tức là bỏ đúng chốt chặn mà màn này sinh ra để giữ.
 */
export function ShiftClose() {
  const { branchId, signOut } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  const [counted, setCounted] = useState(0)
  const [touched, setTouched] = useState(false)
  const [note, setNote] = useState('')

  const shift = useQuery({
    queryKey: ['shift-open', branchId],
    queryFn: () => api.openShiftOf(branchId!),
    enabled: Boolean(branchId),
  })

  const summary = useQuery({
    queryKey: ['shift-summary', shift.data?.id],
    queryFn: () => api.shiftSummary(shift.data!.id),
    enabled: Boolean(shift.data?.id),
    refetchInterval: 30_000,
  })

  const close = useMutation({
    mutationFn: () => api.closeShift(shift.data!.id, counted, note.trim() || null),
    onSuccess: async (result) => {
      toast(
        result.variance === 0
          ? 'Đã đóng ca — quỹ khớp'
          : `Đã đóng ca — lệch ${result.variance.toLocaleString('vi-VN')}₫, đã ghi bút toán`,
        result.variance === 0 ? 'ok' : 'warn',
      )
      void queryClient.invalidateQueries({ queryKey: ['shift-open', branchId] })
      await signOut()
      void navigate('/shift')
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  if (shift.isPending) return <p className="p-6 text-ink-mute">Đang tải ca…</p>
  if (!shift.data) {
    return (
      <EmptyState
        title="Chi nhánh chưa có ca nào đang mở. Mở ca ở màn đăng nhập trước khi đóng."
        action={<Button onClick={() => void navigate('/shift')}>Về màn mở ca</Button>}
      />
    )
  }

  const data = summary.data
  const expected = data?.cash.expected ?? 0
  const variance = counted - expected
  const revenueTotal = data?.revenue.total ?? 0

  return (
    <div className="grid h-[calc(100dvh-56px)] grid-cols-[1fr_420px]">
      <div className="overflow-y-auto border-r border-line-1 px-7 py-6">
        <h1 className="text-[length:var(--fs-d3)] font-semibold text-ink-hi">
          Đóng ca · #{shift.data.id}
        </h1>
        <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
          {data?.shift.cashier ?? '—'} · {data?.shift.businessDate ?? ''} · mở lúc{' '}
          {data ? new Date(data.shift.openedAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }) : '—'}
        </p>

        <div className="mt-7 mb-3">
          <SectionLabel>Đối chiếu tiền mặt</SectionLabel>
        </div>
        <Card className="flex flex-col gap-3 p-5">
          <Row label="Tiền đầu ca" value={data?.cash.opening ?? 0} />
          <Row label="Thu trong ca (tiền mặt + COD)" value={data?.cash.sales ?? 0} />
          <div className="h-px bg-line-1" />
          <Row label="Hệ thống ghi nhận" value={expected} strong />

          <div className="mt-2 flex items-center justify-between gap-4">
            <span className="text-ink-body">Đếm thực tế</span>
            <Money amount={counted} className="text-[length:var(--fs-d3)] text-ink-hi" />
          </div>
          <div className="flex flex-wrap gap-2">
            {NOTES.map((denomination) => (
              <Button
                key={denomination}
                onClick={() => {
                  setTouched(true)
                  setCounted((c) => c + denomination)
                }}
              >
                +{denomination.toLocaleString('vi-VN')}
              </Button>
            ))}
            <Button
              variant="ghost"
              onClick={() => {
                setTouched(false)
                setCounted(0)
              }}
            >
              Xoá
            </Button>
          </div>

          {touched ? (
            <div className="mt-1 flex items-baseline justify-between border-t border-line-1 pt-3.5">
              <span className="font-semibold text-ink-hi">Chênh lệch</span>
              <Money
                amount={variance}
                className={[
                  'text-[length:var(--fs-d3)]',
                  variance === 0 ? 'text-ok' : variance > 0 ? 'text-warn' : 'text-danger',
                ].join(' ')}
              />
            </div>
          ) : null}
        </Card>

        <div className="mt-7 mb-3">
          <SectionLabel>Doanh thu theo hình thức</SectionLabel>
        </div>
        <Card className="flex flex-col gap-3.5 p-5">
          {(data?.revenue.byKind ?? []).map((row) => (
            <div key={row.kind} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between">
                <span className="text-ink-body">
                  {KIND_LABEL[row.kind] ?? row.kind} · {row.count} lượt
                </span>
                <Money amount={row.amount} className="text-ink-hi" />
              </div>
              <div className="h-1.5 rounded-full bg-surface-3">
                <div
                  className="h-1.5 rounded-full bg-accent"
                  style={{
                    width: `${revenueTotal > 0 ? Math.round((row.amount / revenueTotal) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          ))}
          {(data?.revenue.byKind.length ?? 0) === 0 ? (
            <p className="text-ink-mute">Ca này chưa thu khoản nào.</p>
          ) : null}
          <div className="mt-1 flex items-baseline justify-between border-t border-line-1 pt-3.5">
            <span className="font-semibold text-ink-hi">Tổng doanh thu ca</span>
            <Money amount={revenueTotal} className="text-[length:var(--fs-d3)] text-accent-ink" />
          </div>
        </Card>
      </div>

      <aside className="flex flex-col gap-3 overflow-y-auto bg-surface-1 p-6">
        <SectionLabel>Chuyển khoản</SectionLabel>
        <Card
          className={[
            'flex flex-col gap-2 p-4.5',
            (data?.bank.unassigned ?? 0) + (data?.bank.mismatched ?? 0) > 0
              ? 'border-warn'
              : 'border-ok',
          ].join(' ')}
        >
          <Row label="Hệ thống" value={data?.bank.system ?? 0} />
          <Row label="Sao kê ngân hàng" value={data?.bank.statement ?? 0} />
          <p className="mt-1 border-t border-line-1 pt-3 text-[length:var(--fs-b2)]">
            {(data?.bank.unassigned ?? 0) + (data?.bank.mismatched ?? 0) === 0 ? (
              <span className="text-ok">Khớp · 0 giao dịch chưa gán</span>
            ) : (
              <span className="text-warn">
                {data?.bank.mismatched ?? 0} lệch tiền · {data?.bank.unassigned ?? 0} chưa gán
              </span>
            )}
          </p>
        </Card>
        <Button onClick={() => void navigate('/doi-soat')}>Mở đối soát chi tiết</Button>

        <div className="mt-4">
          <SectionLabel>Ghi chú ca</SectionLabel>
        </div>
        <textarea
          rows={4}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Bàn 06 lệch 100.000₫, đã báo trưởng ca…"
          className="w-full rounded-sm border border-line-3 bg-surface-0 p-3 text-[length:var(--fs-b2)] text-ink-hi"
        />

        <div className="mt-auto flex flex-col gap-2.5 pt-4">
          <p className="text-[length:var(--fs-c1)] text-ink-mute">
            Đóng ca xong máy đăng xuất — ca sau đăng nhập lại và đếm tiền đầu ca.
          </p>
          <Button
            variant="primary"
            size="lg"
            block
            disabled={!touched || close.isPending}
            onClick={() => close.mutate()}
          >
            {touched ? 'Đóng ca' : 'Đếm két trước đã'}
          </Button>
        </div>
      </aside>
    </div>
  )
}

function Row({ label, value, strong = false }: { label: string; value: number; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className={strong ? 'text-ink-hi' : 'text-ink-mute'}>{label}</span>
      <Money
        amount={value}
        className={strong ? 'text-[length:var(--fs-t1)] text-ink-hi' : 'text-ink-body'}
      />
    </div>
  )
}
