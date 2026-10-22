import { Button, Card, Money, QrCode, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef, useState } from 'react'
import { api, type CollectResult, type CorporatePick, type VietQrTicket } from '../../api'
import {
  ApprovalFields,
  approvalOf,
  approvalReady,
  EMPTY_APPROVAL,
  needsApprovalError,
  type ApprovalDraft,
} from '../ApprovalFields'

type Method = 'cash' | 'card' | 'transfer' | 'corporate'

const METHODS: { id: Method; label: string }[] = [
  { id: 'cash', label: 'Tiền mặt' },
  { id: 'card', label: 'Thẻ' },
  { id: 'transfer', label: 'Chuyển khoản' },
  { id: 'corporate', label: 'Ghi nợ công ty' },
]

/** Mệnh giá hay dùng — bấm nhanh thay vì gõ số */
const QUICK_CASH = [50_000, 100_000, 200_000, 500_000]

interface PanelProps {
  sessionId: number
  orderId: number | undefined
  tableCode: string
  outstanding: number
  /** Số của một lượt thu riêng (P9 tách theo %) — 0 = không có */
  preset: number
  /** Hoá đơn điện tử đang bật — ghi nợ cần hồ sơ có địa chỉ */
  einvoiceEnabled: boolean
  /** Một khoản đã vào sổ; `change` = tiền thối của lượt tiền mặt */
  onCollected: (change: number) => void
}

/**
 * P10 "Hình thức thanh toán". Tiền mặt và thẻ đi qua hàng đợi offline như mọi lệnh
 * ghi ở quầy; chuyển khoản và ghi nợ cần mạng (mã QR do ngân hàng cấp, ghi nợ cần
 * biết ngay có phải xin duyệt).
 */
export function PaymentPanel(props: PanelProps) {
  const [method, setMethod] = useState<Method>('cash')

  return (
    <Card className="flex flex-col gap-4 p-4">
      <SectionLabel>Hình thức thanh toán</SectionLabel>
      <div role="radiogroup" aria-label="Hình thức thanh toán" className="grid grid-cols-2 gap-2">
        {METHODS.map((m) => (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={method === m.id}
            onClick={() => setMethod(m.id)}
            className={[
              'h-[var(--hit-target)] rounded-sm border px-3 text-[length:var(--fs-b2)]',
              method === m.id
                ? 'border-accent bg-surface-3 font-semibold text-ink-hi'
                : 'border-line-3 text-ink-body',
            ].join(' ')}
          >
            {m.label}
          </button>
        ))}
      </div>
      {method === 'cash' ? <CashPanel {...props} /> : null}
      {method === 'card' ? <CardPanel {...props} /> : null}
      {method === 'transfer' ? <TransferPanel {...props} /> : null}
      {method === 'corporate' ? <CorporatePanel {...props} /> : null}
    </Card>
  )
}

/** Sau một khoản thu: bảng kê, hoá đơn và sơ đồ bàn cùng làm mới */
function useAfterCollect(sessionId: number) {
  const queryClient = useQueryClient()
  return () => {
    for (const key of ['bill', 'invoice', 'order']) {
      void queryClient.invalidateQueries({ queryKey: [key, sessionId] })
    }
    void queryClient.invalidateQueries({ queryKey: ['tables'] })
  }
}

/** Kết quả một lượt tiền mặt / thẻ: null = lệnh nằm hàng đợi chờ mạng */
function useCollectToast() {
  const toast = useToast()
  return (result: CollectResult | null) => {
    if (!result) {
      toast('Đang chờ mạng — khoản thu sẽ gửi khi nối lại', 'warn')
      return
    }
    toast(
      result.paymentState === 'paid'
        ? 'Đã thu đủ'
        : `Còn lại ${new Intl.NumberFormat('vi-VN').format(result.outstanding)}₫`,
      'ok',
    )
  }
}

function CashPanel({ sessionId, tableCode, outstanding, preset, onCollected }: PanelProps) {
  const toast = useToast()
  const refresh = useAfterCollect(sessionId)
  const report = useCollectToast()
  const [tendered, setTendered] = useState(0)

  const pay = useMutation({
    mutationFn: (amount: number) => api.payCash(sessionId, amount, tendered || null, tableCode),
    onSuccess: (result) => {
      report(result)
      if (result) onCollected(result.change)
      setTendered(0)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const partial = preset > 0 && preset < outstanding
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-baseline justify-between">
        <span className="text-[length:var(--fs-b2)] text-ink-mute">Khách đưa</span>
        <Money amount={tendered} className="text-[length:var(--fs-t1)] text-ink-hi" />
      </div>
      <div className="flex flex-wrap gap-2">
        {QUICK_CASH.map((amount) => (
          <Button key={amount} onClick={() => setTendered((t) => t + amount)}>
            +{amount.toLocaleString('vi-VN')}
          </Button>
        ))}
        <Button variant="ghost" onClick={() => setTendered(0)}>
          Xoá
        </Button>
      </div>
      {partial ? (
        <Button
          variant="primary"
          size="lg"
          block
          disabled={pay.isPending}
          onClick={() => pay.mutate(preset)}
        >
          Thu phần này · <Money amount={preset} />
        </Button>
      ) : null}
      <Button
        variant={partial ? 'secondary' : 'primary'}
        size="lg"
        block
        disabled={outstanding === 0 || pay.isPending}
        onClick={() => pay.mutate(outstanding)}
      >
        Thu đủ · <Money amount={outstanding} />
      </Button>
    </div>
  )
}

function CardPanel({ sessionId, tableCode, outstanding, preset, onCollected }: PanelProps) {
  const toast = useToast()
  const refresh = useAfterCollect(sessionId)
  const report = useCollectToast()
  const [reference, setReference] = useState('')
  const amount = preset > 0 && preset < outstanding ? preset : outstanding

  const pay = useMutation({
    mutationFn: () => api.payCard(sessionId, amount, reference.trim() || null, tableCode),
    onSuccess: (result) => {
      report(result)
      if (result) onCollected(0)
      setReference('')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[length:var(--fs-b2)] text-ink-body">
        Quẹt thẻ trên máy POS ngân hàng đúng <Money amount={amount} className="text-ink-hi" />, đợi
        máy in phiếu chuẩn chi rồi mới ghi nhận.
      </p>
      <label className="flex flex-col gap-1.5">
        <span className="text-[length:var(--fs-c1)] text-ink-mute">
          Số phiếu / mã chuẩn chi (không bắt buộc)
        </span>
        <input
          value={reference}
          onChange={(e) => setReference(e.target.value)}
          inputMode="numeric"
          autoComplete="off"
          maxLength={40}
          className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 font-mono text-ink-hi"
        />
      </label>
      <Button
        variant="primary"
        size="lg"
        block
        disabled={amount === 0 || pay.isPending}
        onClick={() => pay.mutate()}
      >
        Ghi nhận thẻ · <Money amount={amount} />
      </Button>
    </div>
  )
}

/**
 * Chuyển khoản VietQR: ngân hàng cấp tài khoản ảo đúng số tiền; CHỈ webhook ngân
 * hàng mới đổi trạng thái đã trả (§20) — màn này chỉ hỏi lại mỗi 3 giây.
 */
function TransferPanel({ sessionId, outstanding, onCollected }: PanelProps) {
  const toast = useToast()
  const refresh = useAfterCollect(sessionId)
  const [ticket, setTicket] = useState<VietQrTicket | null>(null)

  const create = useMutation({
    mutationFn: () => api.createVietQr(sessionId, outstanding),
    onSuccess: setTicket,
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const status = useQuery({
    queryKey: ['payment-status', ticket?.id],
    queryFn: () => api.paymentStatus(ticket!.id),
    enabled: ticket !== null,
    refetchInterval: (q) => (q.state.data?.state === 'pending' || !q.state.data ? 3_000 : false),
  })
  const state = status.data?.state

  // Một mã chỉ báo "đã nhận" một lần, dù màn vẽ lại bao nhiêu lần trước khi mã được gỡ
  const handled = useRef<number | null>(null)
  useEffect(() => {
    if (state !== 'paid' || !ticket || handled.current === ticket.id) return
    handled.current = ticket.id
    toast('Đã nhận tiền chuyển khoản', 'ok')
    onCollected(0)
    refresh()
    setTicket(null)
  }, [state, ticket, toast, onCollected, refresh])

  if (!ticket) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[length:var(--fs-b2)] text-ink-body">
          Mã QR mang đúng số tiền còn phải thu. Khách quét bằng app ngân hàng; tiền về là bill tự
          đóng.
        </p>
        <Button
          variant="primary"
          size="lg"
          block
          disabled={outstanding === 0 || create.isPending}
          onClick={() => create.mutate()}
        >
          Tạo mã chuyển khoản · <Money amount={outstanding} />
        </Button>
      </div>
    )
  }

  const dead = state === 'expired' || state === 'failed' || state === 'mismatch'
  return (
    <div className="flex flex-col items-center gap-3">
      <QrCode value={ticket.qrString} size={240} label="Mã VietQR chuyển khoản" />
      <Money amount={ticket.amount} className="text-[length:var(--fs-t1)] text-ink-hi" />
      <span className="font-mono text-[length:var(--fs-b2)] text-ink-body">{ticket.vaNumber}</span>
      <p
        className={[
          'text-center text-[length:var(--fs-b2)]',
          dead ? 'text-warn' : 'text-ink-mute',
        ].join(' ')}
      >
        {state === 'mismatch'
          ? 'Tiền về KHÁC số trên mã — xử lý ở Đối soát (P15)'
          : dead
            ? 'Mã đã hết hạn — tạo mã mới'
            : `Đang chờ ngân hàng báo có · mã hết hạn lúc ${new Date(ticket.expiresAt).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}`}
      </p>
      {dead ? (
        <Button block onClick={() => create.mutate()} disabled={create.isPending}>
          Tạo mã mới
        </Button>
      ) : null}
    </div>
  )
}

/**
 * Ghi nợ công ty (B15): công ty nợ phần còn lại của bill; hoá đơn đứng tên công ty
 * và lập ngay. Thu ngân R2 cần PIN quản lý ca; quản lý ca, chủ tự bấm được.
 */
function CorporatePanel({
  orderId,
  outstanding,
  einvoiceEnabled,
  sessionId,
  onCollected,
}: PanelProps) {
  const toast = useToast()
  const refresh = useAfterCollect(sessionId)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [picked, setPicked] = useState<CorporatePick | null>(null)
  const [signer, setSigner] = useState('')
  const [needsApproval, setNeedsApproval] = useState(false)
  const [approval, setApproval] = useState<ApprovalDraft>(EMPTY_APPROVAL)

  // Gõ tên công ty: chờ dừng tay mới hỏi
  useEffect(() => {
    const timer = setTimeout(() => setTerm(q.trim()), 250)
    return () => clearTimeout(timer)
  }, [q])

  const companies = useQuery({
    queryKey: ['corporate-pick', term],
    queryFn: () => api.corporatePick(term),
  })

  const charge = useMutation({
    mutationFn: () =>
      api.corporateCharge({
        corporateId: picked!.id,
        orderId: orderId!,
        signer: signer.trim() || null,
        approval: needsApproval ? approvalOf(approval, `Ghi nợ ${picked!.name}`) : null,
      }),
    onSuccess: (result) => {
      toast(
        `Đã ghi nợ ${picked!.name} · ${new Intl.NumberFormat('vi-VN').format(result.amountVnd)}₫`,
        'ok',
      )
      onCollected(0)
      refresh()
    },
    onError: (err: Error) => {
      if (needsApprovalError(err)) {
        setNeedsApproval(true)
        toast('Ghi nợ cần quản lý ca duyệt', 'warn')
        return
      }
      toast(err.message, 'danger')
    },
  })

  const missingAddress = (c: CorporatePick) => einvoiceEnabled && c.address === null

  return (
    <div className="flex flex-col gap-3">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Tìm công ty theo tên, mã hay MST"
        aria-label="Tìm công ty"
        autoComplete="off"
        className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
      />
      <ul className="flex max-h-72 flex-col gap-2 overflow-y-auto">
        {(companies.data ?? []).map((c) => {
          const blocked = c.blockedReason !== null || missingAddress(c)
          const selected = picked?.id === c.id
          return (
            <li key={c.id}>
              <button
                type="button"
                disabled={blocked}
                onClick={() => {
                  setPicked(c)
                  setNeedsApproval(false)
                  setApproval(EMPTY_APPROVAL)
                }}
                className={[
                  'flex w-full flex-col gap-1 rounded-md border p-3 text-left',
                  blocked
                    ? 'border-danger-line opacity-80'
                    : selected
                      ? 'border-accent bg-surface-3'
                      : 'border-line-2',
                ].join(' ')}
              >
                <span className="text-[length:var(--fs-b1)] text-ink-hi">{c.name}</span>
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {c.code} · MST {c.taxCode}
                </span>
                {c.blockedReason ? (
                  <span className="text-[length:var(--fs-c1)] text-danger-line">
                    {c.blockedReason} — đã chặn ghi nợ
                  </span>
                ) : missingAddress(c) ? (
                  <span className="text-[length:var(--fs-c1)] text-warn">
                    Hồ sơ thiếu địa chỉ — kế toán bổ sung ở B15 rồi mới ghi nợ được
                  </span>
                ) : (
                  <span className="text-[length:var(--fs-c1)] text-ink-body">
                    Còn hạn mức <Money amount={c.availableVnd} />
                  </span>
                )}
              </button>
            </li>
          )
        })}
        {companies.data && companies.data.length === 0 ? (
          <li className="text-[length:var(--fs-b2)] text-ink-mute">
            Không thấy công ty nào — hồ sơ khách doanh nghiệp khai ở Office B15.
          </li>
        ) : null}
      </ul>

      {picked ? (
        <>
          <label className="flex flex-col gap-1.5">
            <span className="text-[length:var(--fs-c1)] text-ink-mute">
              Người ký nhận nợ (họ tên — ghi trên hoá đơn là người mua hàng)
            </span>
            <input
              value={signer}
              onChange={(e) => setSigner(e.target.value)}
              autoComplete="off"
              maxLength={120}
              className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
            />
          </label>
          {needsApproval ? (
            <ApprovalFields
              value={approval}
              onChange={setApproval}
              note={`Ghi nợ ${picked.name} cần quản lý ca duyệt. Người duyệt phải khác người xin.`}
            />
          ) : null}
          <Button
            variant="primary"
            size="lg"
            block
            disabled={
              orderId === undefined ||
              outstanding === 0 ||
              charge.isPending ||
              (needsApproval && !approvalReady(approval))
            }
            onClick={() => charge.mutate()}
          >
            Ghi nợ · <Money amount={outstanding} />
          </Button>
        </>
      ) : null}
    </div>
  )
}
