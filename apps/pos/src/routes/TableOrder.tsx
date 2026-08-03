import {
  Badge,
  Button,
  Card,
  MenuItemCard,
  Modal,
  Money,
  QrCode,
  SectionLabel,
  useToast,
} from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router'
import { api, type ConfigDish, type ModifierGroup, type OrderLineRow } from '../api'
import { useSession } from '../session-context'

interface PadLine {
  /** Món + đúng bộ tuỳ chọn — hai phần thăn bò khác vị là hai dòng khác nhau */
  key: string
  dishId: string
  name: string
  /** Giá một phần ĐÃ cộng chênh giá tuỳ chọn */
  price: number
  qty: number
  options: { id: string; name: string; priceDelta: number }[]
}

/**
 * P4 Gọi món — ba cột: nhóm · lưới món · phiếu order.
 *
 * Phiếu order dựng ở CLIENT trước, chỉ gửi server khi bấm GỬI BẾP. Nhân viên bấm
 * rất nhanh và hay sửa; gọi API mỗi lần chạm sẽ vừa chậm vừa tạo rác trên đơn.
 */
export function TableOrder() {
  const { sessionId } = useParams()
  const [searchParams] = useSearchParams()
  const tableCode = searchParams.get('code') ?? ''
  const { branchId } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()

  /** `null` = tất cả · `'quick'` = bàn phím nhanh P5 · còn lại là mã nhóm món */
  const [category, setCategory] = useState<string | null>('quick')
  const [pad, setPad] = useState<PadLine[]>([])
  const [voiding, setVoiding] = useState<OrderLineRow | null>(null)
  const [showQr, setShowQr] = useState(false)
  const [modifierFor, setModifierFor] = useState<ConfigDish | null>(null)

  const id = Number(sessionId)

  const config = useQuery({
    queryKey: ['config', branchId],
    queryFn: () => api.config(branchId!),
    enabled: Boolean(branchId),
    staleTime: 5 * 60_000,
  })

  const availability = useQuery({
    queryKey: ['availability', branchId],
    queryFn: () => api.availability(branchId!),
    enabled: Boolean(branchId),
    refetchInterval: 15_000,
  })

  const order = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.sessionOrder(id),
    refetchInterval: 10_000,
  })

  const soldOut = useMemo(
    () => new Map((availability.data ?? []).map((a) => [a.dishId, a])),
    [availability.data],
  )

  /**
   * P5 bàn phím nhanh. Máy chủ chỉ trả về THỨ TỰ mã món; tên, giá, món hết vẫn
   * đọc từ config bundle như mọi ô khác — một nguồn cho một con số.
   */
  const quick = useQuery({
    queryKey: ['quick-keys', branchId],
    queryFn: () => api.quickKeys(branchId!),
    enabled: Boolean(branchId),
    staleTime: 10 * 60_000,
  })

  const categories = config.data?.categories ?? []
  const dishes = useMemo(() => {
    const all = config.data?.dishes ?? []
    if (category === 'quick') {
      const byId = new Map(all.map((d) => [d.id, d]))
      return (quick.data?.dishIds ?? []).map((id) => byId.get(id)).filter((d) => d !== undefined)
    }
    return all.filter((d) => !category || d.categoryId === category)
  }, [config.data?.dishes, category, quick.data?.dishIds])

  const groupsOf = (dish: ConfigDish): ModifierGroup[] =>
    dish.modifierGroupIds
      .map((gid) => (config.data?.modifiers ?? []).find((g) => g.id === gid))
      .filter((g): g is ModifierGroup => g !== undefined)

  const padTotal = pad.reduce((sum, l) => sum + l.price * l.qty, 0)

  const addLines = useMutation({
    mutationFn: () =>
      api.addLines(
        id,
        pad.map((l) => ({
          dishId: l.dishId,
          qty: l.qty,
          modifierOptionIds: l.options.map((o) => o.id),
        })),
        `Thêm ${pad.length} món bàn ${tableCode}`,
      ),
    onSuccess: () => {
      setPad([])
      void queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const send = useMutation({
    mutationFn: () => api.send(id, tableCode),
    onSuccess: (result) => {
      toast(result ? `Đã gửi bếp — ${result.tickets} vé` : 'Đã xếp hàng, sẽ gửi khi có mạng', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const fire = useMutation({
    mutationFn: (batchNo: number) => api.fireBatch(order.data!.order.id, batchNo),
    onSuccess: () => {
      toast('Đã ra đợt', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['order', id] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  /**
   * Thêm một phần vào phiếu order.
   *
   * Gộp dòng theo món KÈM tuỳ chọn: hai phần thăn bò một chấm muối một chấm miso
   * là hai dòng, vì bếp làm khác nhau và vé xuống bếp cũng phải khác nhau.
   */
  const push = (dish: ConfigDish, options: PadLine['options']) => {
    const key = [dish.id, ...options.map((o) => o.id).sort()].join('|')
    const price = dish.price + options.reduce((sum, o) => sum + o.priceDelta, 0)
    setPad((current) => {
      const existing = current.find((l) => l.key === key)
      if (existing) return current.map((l) => (l.key === key ? { ...l, qty: l.qty + 1 } : l))
      return [...current, { key, dishId: dish.id, name: dish.nameVi, price, qty: 1, options }]
    })
  }

  /** Món có nhóm tuỳ chọn thì chạm vào là mở P6, không thả thẳng vào phiếu */
  const tapDish = (dish: ConfigDish) => {
    if (groupsOf(dish).length > 0) {
      setModifierFor(dish)
      return
    }
    push(dish, [])
  }

  const sentLines = (order.data?.lines ?? []).filter(
    (l) => l.state !== 'voided' && l.state !== 'draft',
  )
  const draftLines = (order.data?.lines ?? []).filter((l) => l.state === 'draft')
  const heldBatches = (order.data?.batches ?? []).filter((b) => b.state === 'held')

  return (
    <div className="grid h-[calc(100dvh-56px)] grid-cols-[180px_1fr_360px]">
      {/* Cột trái: nhóm món */}
      <nav className="flex flex-col gap-1 overflow-y-auto border-r border-line-1 p-3">
        <button
          type="button"
          onClick={() => setCategory('quick')}
          className={[
            'flex items-center gap-2 rounded-sm px-3 py-3 text-left text-[length:var(--fs-b2)]',
            category === 'quick' ? 'bg-surface-3 text-ink-hi' : 'text-ink-mute hover:bg-surface-2',
          ].join(' ')}
        >
          <span className="text-accent-ink">⚡</span>
          Nhanh
        </button>
        <button
          type="button"
          onClick={() => setCategory(null)}
          className={[
            'rounded-sm px-3 py-3 text-left text-[length:var(--fs-b2)]',
            category === null ? 'bg-surface-3 text-ink-hi' : 'text-ink-mute hover:bg-surface-2',
          ].join(' ')}
        >
          Tất cả
        </button>
        {categories.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(c.id)}
            className={[
              'flex items-center gap-2 rounded-sm px-3 py-3 text-left text-[length:var(--fs-b2)]',
              category === c.id ? 'bg-surface-3 text-ink-hi' : 'text-ink-mute hover:bg-surface-2',
            ].join(' ')}
          >
            {c.kanji ? <span className="font-jp text-accent-ink">{c.kanji}</span> : null}
            {c.nameVi}
          </button>
        ))}
      </nav>

      {/* Cột giữa: lưới món */}
      <div className="overflow-y-auto p-4">
        {config.isPending || (category === 'quick' && quick.isPending) ? (
          <p className="text-ink-mute">Đang tải thực đơn…</p>
        ) : config.isError ? (
          <Card className="border-warn p-4 text-ink-body">
            Chi nhánh chưa phát hành cấu hình. Vào Office bấm “Lưu &amp; phát hành”.
          </Card>
        ) : (
          <div className="grid grid-cols-3 gap-3 xl:grid-cols-4">
            {dishes.map((d) => {
              const avail = soldOut.get(d.id)
              return (
                <MenuItemCard
                  key={d.id}
                  name={d.nameVi}
                  price={d.price}
                  station={d.routing?.stationGrill ?? null}
                  soldOut={avail?.status === 'sold_out'}
                  remaining={avail?.status === 'limited' ? avail.remaining : null}
                  hasRequiredModifier={groupsOf(d).some((g) => g.required)}
                  onClick={() => tapDish(d)}
                />
              )
            })}
          </div>
        )}
      </div>

      {/* Cột phải: phiếu order */}
      <aside className="flex flex-col border-l border-line-1 bg-surface-1">
        <header className="flex items-center justify-between border-b border-line-1 px-4 py-3">
          <div className="flex flex-col">
            <span className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
              Bàn {tableCode}
            </span>
            {order.data ? (
              <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {order.data.order.displayCode}
              </span>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={() => setShowQr(true)}>Mã QR bàn</Button>
            <Button variant="ghost" onClick={() => void navigate('/floor')}>
              Sơ đồ
            </Button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4">
          {pad.length > 0 ? (
            <section className="mb-5 flex flex-col gap-2">
              <SectionLabel>Chưa gửi bếp</SectionLabel>
              {pad.map((line) => (
                <div key={line.key} className="flex flex-col gap-1">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setPad((c) =>
                          c
                            .map((l) => (l.key === line.key ? { ...l, qty: l.qty - 1 } : l))
                            .filter((l) => l.qty > 0),
                        )
                      }
                      className="h-9 w-9 rounded-sm border border-line-3 text-ink-body"
                    >
                      −
                    </button>
                    <span className="w-8 text-center font-mono text-ink-hi">{line.qty}</span>
                    <span className="flex-1 text-[length:var(--fs-b2)] text-ink-body">{line.name}</span>
                    <Money amount={line.price * line.qty} className="text-[length:var(--fs-b2)] text-ink-body" />
                  </div>
                  {line.options.length > 0 ? (
                    <p className="pl-[76px] text-[length:var(--fs-c2)] text-warn">
                      {line.options.map((o) => o.name).join(' · ')}
                    </p>
                  ) : null}
                </div>
              ))}
              <Button
                variant="secondary"
                block
                disabled={addLines.isPending}
                onClick={() => addLines.mutate()}
              >
                Thêm vào đơn · <Money amount={padTotal} />
              </Button>
            </section>
          ) : null}

          {draftLines.length > 0 ? (
            <section className="mb-5 flex flex-col gap-2">
              <SectionLabel>Trong đơn, chờ gửi bếp</SectionLabel>
              {draftLines.map((line) => (
                <LineRow key={line.id} line={line} onVoid={() => setVoiding(line)} />
              ))}
            </section>
          ) : null}

          {sentLines.length > 0 ? (
            <section className="flex flex-col gap-2">
              <SectionLabel>Đã gửi bếp</SectionLabel>
              {sentLines.map((line) => (
                <LineRow key={line.id} line={line} onVoid={() => setVoiding(line)} />
              ))}
            </section>
          ) : null}

          {heldBatches.length > 0 ? (
            <section className="mt-5 flex flex-col gap-2">
              <SectionLabel>Đợt đang chờ</SectionLabel>
              {heldBatches.map((b) => (
                <Button key={b.batchNo} onClick={() => fire.mutate(b.batchNo)} block>
                  Ra đợt {b.batchNo}
                </Button>
              ))}
            </section>
          ) : null}
        </div>

        <footer className="flex flex-col gap-2 border-t border-line-1 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-[length:var(--fs-b2)] text-ink-mute">Tạm tính</span>
            <Money
              amount={order.data?.order.moneyTotal ?? 0}
              className="text-[length:var(--fs-t1)] text-ink-hi"
            />
          </div>
          <Button
            variant="primary"
            size="lg"
            block
            disabled={draftLines.length === 0 || send.isPending}
            onClick={() => send.mutate()}
          >
            GỬI BẾP
          </Button>
          <div className="flex gap-2">
            <Button
              className="flex-1"
              onClick={() => void navigate(`/table/${id}/chuyen?code=${tableCode}`)}
            >
              Chuyển · ghép · tách
            </Button>
            <Button
              className="flex-1"
              onClick={() => void navigate(`/table/${id}/pay?code=${tableCode}`)}
            >
              Tính tiền
            </Button>
          </div>
        </footer>
      </aside>

      {modifierFor ? (
        <ModifierDialog
          key={modifierFor.id}
          dish={modifierFor}
          groups={groupsOf(modifierFor)}
          onClose={() => setModifierFor(null)}
          onDone={(options) => {
            push(modifierFor, options)
            setModifierFor(null)
          }}
        />
      ) : null}

      <TableQrDialog
        sessionId={id}
        tableCode={tableCode}
        open={showQr}
        onClose={() => setShowQr(false)}
      />

      <VoidDialog
        line={voiding}
        onClose={() => setVoiding(null)}
        onDone={() => {
          setVoiding(null)
          void queryClient.invalidateQueries({ queryKey: ['order', id] })
        }}
      />
    </div>
  )
}

function LineRow({ line, onVoid }: { line: OrderLineRow; onVoid: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-center font-mono text-ink-hi">{line.qty}</span>
      <div className="flex flex-1 flex-col">
        <span className="text-[length:var(--fs-b2)] text-ink-body">{line.nameSnapshot}</span>
        {line.setLabel ? (
          <span className="text-[length:var(--fs-c2)] text-accent">[{line.setLabel}]</span>
        ) : null}
      </div>
      {line.state !== 'draft' ? <Badge tone="accent">Đợt {line.batchNo}</Badge> : null}
      <button
        type="button"
        onClick={onVoid}
        className="px-2 text-[length:var(--fs-b2)] text-ink-mute hover:text-danger"
      >
        Huỷ
      </button>
    </div>
  )
}

/**
 * P6 Popup modifier.
 *
 * Nhóm bắt buộc mở sẵn lựa chọn đầu tiên: nhân viên bấm rất nhanh, và phần lớn
 * khách lấy vị mặc định. Ai đổi ý thì chạm một cái. "Bỏ qua" là HUỶ chứ không
 * phải "thêm không tuỳ chọn" — món nướng không có vị chấm thì bếp phải chạy ra
 * hỏi lại, tức là chậm hơn hẳn việc bấm thêm một nút ở đây.
 */
function ModifierDialog({
  dish,
  groups,
  onClose,
  onDone,
}: {
  dish: ConfigDish
  groups: ModifierGroup[]
  onClose: () => void
  onDone: (options: { id: string; name: string; priceDelta: number }[]) => void
}) {
  const [picked, setPicked] = useState<Record<string, string[]>>(() =>
    Object.fromEntries(
      groups.map((g) => [g.id, g.required && g.options[0] ? [g.options[0].id] : []]),
    ),
  )

  const chosen = groups.flatMap((g) =>
    g.options.filter((o) => (picked[g.id] ?? []).includes(o.id)),
  )
  const unitPrice = dish.price + chosen.reduce((sum, o) => sum + o.priceDelta, 0)
  const missing = groups.filter((g) => g.required && (picked[g.id] ?? []).length === 0)

  const toggle = (group: ModifierGroup, optionId: string) =>
    setPicked((current) => {
      const on = current[group.id] ?? []
      if (!group.multi) return { ...current, [group.id]: [optionId] }
      return {
        ...current,
        [group.id]: on.includes(optionId) ? on.filter((id) => id !== optionId) : [...on, optionId],
      }
    })

  return (
    <Modal
      open
      title={dish.nameVi}
      onClose={onClose}
      footer={
        <>
          <Button onClick={onClose}>Bỏ qua</Button>
          <Button
            variant="primary"
            disabled={missing.length > 0}
            onClick={() =>
              onDone(chosen.map((o) => ({ id: o.id, name: o.name, priceDelta: o.priceDelta })))
            }
          >
            Xong · <Money amount={unitPrice} />
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        {groups.map((group) => (
          <div key={group.id} className="flex flex-col gap-3">
            <SectionLabel>
              {group.name}
              {group.required ? ' *' : ''}
            </SectionLabel>
            <div className="grid gap-2">
              {group.options.map((option) => {
                const on = (picked[group.id] ?? []).includes(option.id)
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => toggle(group, option.id)}
                    className={[
                      'flex h-[var(--hit-target)] items-center justify-between gap-3 rounded-sm border px-4 text-left text-[length:var(--fs-b1)]',
                      on ? 'border-accent text-gold-200' : 'border-line-3 text-ink-body',
                    ].join(' ')}
                  >
                    <span>{option.name}</span>
                    {option.priceDelta > 0 ? (
                      <Money
                        amount={option.priceDelta}
                        className="flex-none text-[length:var(--fs-b2)] text-accent-ink"
                      />
                    ) : null}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  )
}

/**
 * Mã QR dán bàn cho khách quét vào Sora Table.
 *
 * Mỗi lần mở là cấp mã MỚI và mã cũ chết ngay — không có đường nào xem lại mã đã
 * cấp, vì máy chủ chỉ giữ bản băm. Đánh đổi có chủ ý: khách bàn trước không bao
 * giờ đọc được đơn của khách bàn sau.
 *
 * Sora Table nằm ở tên miền khác POS nên địa chỉ lấy từ `VITE_TABLE_ORIGIN`; máy
 * dev không đặt biến này thì lấy chính gốc của POS.
 */
function TableQrDialog({
  sessionId,
  tableCode,
  open,
  onClose,
}: {
  sessionId: number
  tableCode: string
  open: boolean
  onClose: () => void
}) {
  const toast = useToast()

  const token = useQuery({
    queryKey: ['qr-token', sessionId],
    queryFn: () => api.issueQrToken(sessionId),
    enabled: open,
    // Mỗi lần mở hộp thoại là một mã mới: giữ cache ở đây là hiện lại mã đã chết
    gcTime: 0,
    staleTime: 0,
  })

  useEffect(() => {
    if (token.error) toast((token.error as Error).message, 'danger')
  }, [token.error, toast])

  const origin = import.meta.env.VITE_TABLE_ORIGIN ?? window.location.origin
  const url = token.data ? `${origin}${token.data.url}` : null

  return (
    <Modal
      open={open}
      title={`Mã QR bàn ${tableCode}`}
      onClose={onClose}
      footer={<Button onClick={onClose}>Đóng</Button>}
    >
      <div className="flex flex-col items-center gap-4">
        {url ? (
          <>
            <div className="rounded-md bg-[var(--sora-washi-100)] p-4">
              <QrCode value={url} size={240} label={`Mã QR vào bàn ${tableCode}`} />
            </div>
            <p className="text-center text-[length:var(--fs-b2)] text-ink-body">
              Khách quét mã này để tự gọi món và tự thanh toán. Cấp mã mới sẽ làm mã cũ hết hiệu
              lực ngay.
            </p>
          </>
        ) : (
          <p className="text-ink-mute">{token.isError ? 'Không cấp được mã' : 'Đang cấp mã…'}</p>
        )}
      </div>
    </Modal>
  )
}

/**
 * P8 Huỷ món. Món đã gửi bếp cần PIN của NGƯỜI KHÁC đủ quyền — hộp này hiện thêm
 * ô PIN chỉ khi server trả về yêu cầu duyệt, chứ không đoán trước.
 */
function VoidDialog({
  line,
  onClose,
  onDone,
}: {
  line: OrderLineRow | null
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const { branchId } = useSession()
  const [reason, setReason] = useState('')
  const [needsApproval, setNeedsApproval] = useState(false)
  const [approverId, setApproverId] = useState<number | null>(null)
  const [pin, setPin] = useState('')

  const staffQuery = useQuery({
    queryKey: ['staff', branchId],
    queryFn: () => api.staffList(branchId!),
    enabled: Boolean(branchId) && needsApproval,
  })

  const submit = async () => {
    if (!line) return
    try {
      await api.voidLine(
        line.id,
        {
          reason,
          approval:
            needsApproval && approverId
              ? { approverStaffId: approverId, approverPin: pin, reason }
              : null,
        },
        `Huỷ ${line.nameSnapshot}`,
      )
      toast('Đã huỷ món', 'ok')
      reset()
      onDone()
    } catch (err) {
      const apiError = err as { code?: string; message?: string; body?: { code?: string } }
      if (apiError.body?.code === 'requires_approval' || apiError.code === 'requires_approval') {
        setNeedsApproval(true)
        toast('Món đã lên bếp — cần quản lý duyệt', 'warn')
        return
      }
      toast(apiError.message ?? 'Không huỷ được', 'danger')
    }
  }

  const reset = () => {
    setReason('')
    setNeedsApproval(false)
    setApproverId(null)
    setPin('')
  }

  return (
    <Modal
      open={line !== null}
      title={`Huỷ ${line?.nameSnapshot ?? ''}`}
      onClose={() => {
        reset()
        onClose()
      }}
      footer={
        <>
          <Button
            onClick={() => {
              reset()
              onClose()
            }}
          >
            Không huỷ
          </Button>
          <Button
            variant="danger"
            disabled={!reason.trim() || (needsApproval && (!approverId || pin.length < 4))}
            onClick={submit}
          >
            Huỷ món
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-2">
          <SectionLabel>Lý do</SectionLabel>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Khách đổi ý"
            className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
          />
        </label>

        {needsApproval ? (
          <div className="flex flex-col gap-3 rounded-md border border-warn p-3">
            <p className="text-[length:var(--fs-b2)] text-warn">
              Món đã gửi bếp — cần quản lý duyệt. Người duyệt phải khác người xin.
            </p>
            <select
              value={approverId ?? ''}
              onChange={(e) => setApproverId(Number(e.target.value))}
              className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
            >
              <option value="">Chọn người duyệt</option>
              {staffQuery.data?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName} ({p.roles.join(' · ')})
                </option>
              ))}
            </select>
            <input
              type="password"
              inputMode="numeric"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              placeholder="PIN người duyệt"
              className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 font-mono text-ink-hi"
            />
          </div>
        ) : null}
      </div>
    </Modal>
  )
}
