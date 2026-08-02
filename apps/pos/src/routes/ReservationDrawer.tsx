import { checkPermission, type Role } from '@sora/contracts'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { useSession } from '../session-context'

const SEAT_LABEL: Record<string, string> = {
  standard: 'Bàn thường',
  grill: 'Bàn nướng có bếp',
  private: 'Phòng riêng',
}

const SOURCE_LABEL: Record<string, string> = {
  web: 'Đặt trên web',
  phone: 'Gọi điện',
  walkin: 'Khách vãng lai',
}

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'Chờ xác nhận', className: 'border-warn text-warn' },
  confirmed: { label: 'Đã xác nhận', className: 'border-accent text-accent-ink' },
  seated: { label: 'Đã đến', className: 'border-ok text-ok' },
  done: { label: 'Đã xong', className: 'border-line-3 text-ink-mute' },
  cancelled: { label: 'Đã huỷ', className: 'border-danger text-danger' },
  no_show: { label: 'No-show', className: 'border-danger text-danger' },
}

/**
 * R2 — chi tiết đặt chỗ.
 *
 * Ngăn kéo bên phải, cùng khuôn với O9: nhân viên vẫn nhìn thấy bảng phía sau
 * trong lúc xử lý một suất.
 */
export function ReservationDrawer({
  reservationId,
  onClose,
}: {
  reservationId: number
  onClose: () => void
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { staff } = useSession()
  /**
   * Vai trò không được đổi trạng thái đặt chỗ thì làm mờ nút ngay, thay vì để
   * bấm rồi ăn 403 — guard ở máy chủ vẫn là thứ cưỡng chế, đây chỉ là phép lịch
   * sự với người đang đứng ở quầy.
   */
  const mayDecide =
    checkPermission('reservation.confirm-or-noshow', (staff?.roles ?? []) as Role[]) !== 'deny'
  const [note, setNote] = useState('')
  const [askCancel, setAskCancel] = useState(false)
  const [reason, setReason] = useState('')

  const detail = useQuery({
    queryKey: ['reservation', reservationId],
    queryFn: () => api.reservationDetail(reservationId),
  })

  useEffect(() => {
    if (detail.data) setNote(detail.data.note ?? '')
  }, [detail.data])

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['reservation', reservationId] })
    void queryClient.invalidateQueries({ queryKey: ['reservations'] })
    void queryClient.invalidateQueries({ queryKey: ['reservations-late'] })
    void queryClient.invalidateQueries({ queryKey: ['tables'] })
  }

  const fail = (err: Error) => toast(err.message, 'danger')

  const assign = useMutation({
    mutationFn: (tableId: number | null) => api.assignReservationTable(reservationId, tableId),
    onSuccess: (row) => {
      toast(row.tableId ? 'Đã gán bàn' : 'Đã bỏ gán bàn', 'ok')
      refresh()
    },
    onError: fail,
  })

  const saveNote = useMutation({
    mutationFn: () => api.setReservationNote(reservationId, note),
    onSuccess: () => {
      toast('Đã lưu ghi chú', 'ok')
      refresh()
    },
    onError: fail,
  })

  const confirm = useMutation({
    mutationFn: () => api.confirmReservation(reservationId),
    onSuccess: () => {
      toast('Đã xác nhận với khách', 'ok')
      refresh()
    },
    onError: fail,
  })

  const arrive = useMutation({
    mutationFn: () => api.arriveReservation(reservationId),
    onSuccess: (result) => {
      toast(`Đã mở bàn cho ${detail.data?.customerName ?? 'khách'}`, 'ok')
      refresh()
      onClose()
      void navigate(`/table/${result.sessionId}`)
    },
    onError: fail,
  })

  const noShow = useMutation({
    mutationFn: () => api.noShowReservation(reservationId),
    onSuccess: () => {
      toast('Đã đánh no-show', 'warn')
      refresh()
    },
    onError: fail,
  })

  const cancel = useMutation({
    mutationFn: () => api.cancelReservation(reservationId, reason.trim()),
    onSuccess: () => {
      toast('Đã huỷ đặt chỗ', 'warn')
      refresh()
      onClose()
    },
    onError: fail,
  })

  const row = detail.data
  const status = row ? STATUS[row.status] : null
  const assigned = row?.fittingTables.find((t) => t.id === row.tableId)
  const busy =
    assign.isPending || arrive.isPending || noShow.isPending || cancel.isPending || confirm.isPending

  return (
    <div className="fixed inset-0 z-100 flex justify-end bg-canvas/72" onClick={onClose}>
      <aside
        className="flex h-full w-[480px] flex-col border-l border-line-1 bg-surface-4"
        onClick={(e) => e.stopPropagation()}
      >
        {row === undefined ? (
          <p className="p-6 text-ink-mute">Đang tải…</p>
        ) : (
          <>
            <header className="flex-none border-b border-line-1 p-5">
              <div className="flex items-baseline justify-between gap-3">
                <div>
                  <p className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                    {row.customerName}
                  </p>
                  <p className="mt-1.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {row.customerPhone} · {row.displayCode}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onClose}
                  aria-label="Đóng"
                  className="size-11 text-[22px] text-ink-mute"
                >
                  ×
                </button>
              </div>
              <div className="mt-3.5 flex flex-wrap items-center gap-2.5">
                <span
                  className={`inline-flex h-6.5 items-center rounded-pill border px-2.5 text-[length:var(--fs-c1)] ${status?.className}`}
                >
                  {status?.label}
                </span>
                <span className="inline-flex h-6.5 items-center rounded-pill border border-line-1 px-2.5 text-[length:var(--fs-c1)] text-ink-mute">
                  {SOURCE_LABEL[row.source] ?? row.source}
                </span>
                <span className="inline-flex h-6.5 items-center rounded-pill border border-line-1 px-2.5 text-[length:var(--fs-c1)] text-ink-mute">
                  {row.history.visits} lần đến · {row.history.noShows} no-show
                </span>
              </div>
            </header>

            <div className="min-h-0 flex-1 overflow-y-auto p-5">
              <dl className="grid grid-cols-[auto_1fr] gap-x-5 gap-y-3.5 text-[length:var(--fs-b2)]">
                <dt className="text-ink-mute">Giờ hẹn</dt>
                <dd className="m-0 font-mono text-ink-hi">{hhmm(row.slotAt)}</dd>
                <dt className="text-ink-mute">Giữ tới</dt>
                <dd className="m-0 font-mono text-ink-hi">{hhmm(row.endAt)}</dd>
                <dt className="text-ink-mute">Số người</dt>
                <dd className="m-0 font-mono text-ink-hi">{row.guestCount}</dd>
                <dt className="text-ink-mute">Kiểu chỗ</dt>
                <dd className="m-0 text-ink-hi">{SEAT_LABEL[row.seatKind] ?? row.seatKind}</dd>
              </dl>

              <p className="mt-6 mb-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Bàn gán
              </p>
              {row.fittingTables.length === 0 ? (
                <p className="text-[length:var(--fs-c1)] leading-relaxed text-danger">
                  Không có bàn nào đúng kiểu chỗ và đủ sức chứa cho {row.guestCount} khách. Cần ghép
                  bàn hoặc đổi kiểu chỗ với khách.
                </p>
              ) : (
                <div className="grid gap-2">
                  {row.fittingTables.map((table) => {
                    const picked = table.id === row.tableId
                    return (
                      <button
                        key={table.id}
                        type="button"
                        disabled={busy || (!table.free && !picked)}
                        onClick={() => assign.mutate(picked ? null : table.id)}
                        className={`flex items-center gap-3 rounded-sm border p-3 text-left disabled:cursor-not-allowed ${
                          picked
                            ? 'border-accent bg-surface-3'
                            : table.free
                              ? 'border-line-3 hover:border-accent'
                              : 'border-line-1 opacity-60'
                        }`}
                      >
                        <span className="flex-1">
                          <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                            Bàn {table.code}
                          </span>
                          <span className="mt-1 block text-[length:var(--fs-c1)] text-ink-mute">
                            {table.area} · {table.seatMax} chỗ
                            {table.takenBy ? ` · đã dành cho ${table.takenBy}` : ''}
                            {table.free && table.occupiedNow ? ' · đang có khách ngồi' : ''}
                          </span>
                        </span>
                        <span className="flex-none text-[length:var(--fs-c1)] text-accent-ink">
                          {picked ? 'Bỏ gán' : 'Gán →'}
                        </span>
                      </button>
                    )
                  })}
                </div>
              )}

              <p className="mt-6 mb-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                Ghi chú
              </p>
              <textarea
                rows={3}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={() => note !== (row.note ?? '') && saveNote.mutate()}
                placeholder="Sinh nhật, dị ứng, cần ghế em bé…"
                className="w-full resize-y rounded-sm border border-line-1 bg-surface-2 p-3 text-[length:var(--fs-b2)] leading-relaxed text-ink-hi placeholder:text-ink-mute focus:border-accent focus:outline-none"
              />
              <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
                Ghi chú đi theo sang phiên bàn khi khách tới — bếp đọc được mà không phải mở lại màn
                này.
              </p>

              {row.cancelReason ? (
                <p className="mt-5 rounded-sm border border-danger p-3 text-[length:var(--fs-c1)] text-ink-body">
                  Lý do huỷ: {row.cancelReason}
                </p>
              ) : null}

              {askCancel ? (
                <div className="mt-5 rounded-sm border border-danger p-3">
                  <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-danger uppercase">
                    Lý do huỷ
                  </p>
                  <input
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Khách gọi báo bận"
                    className="mt-2.5 h-11 w-full rounded-sm border border-line-1 bg-surface-2 px-3 text-[length:var(--fs-b2)] text-ink-hi"
                  />
                  <div className="mt-3 flex gap-2">
                    <Button onClick={() => setAskCancel(false)}>Thôi</Button>
                    <Button
                      variant="danger"
                      disabled={reason.trim().length === 0 || busy}
                      onClick={() => cancel.mutate()}
                    >
                      Huỷ đặt chỗ
                    </Button>
                  </div>
                </div>
              ) : null}
            </div>

            <footer className="grid flex-none gap-2 border-t border-line-1 p-4">
              {mayDecide ? null : (
                <p className="text-[length:var(--fs-c1)] text-warn">
                  Vai trò của bạn không đổi được trạng thái đặt chỗ — nhờ phục vụ hoặc quản lý ca.
                </p>
              )}
              <Button
                variant="primary"
                block
                disabled={busy || !mayDecide || row.status === 'seated' || row.tableId === null}
                onClick={() => arrive.mutate()}
              >
                {row.tableId === null
                  ? 'Gán bàn trước khi mở phiên'
                  : `Đã đến · mở bàn ${assigned?.code ?? ''}`}
              </Button>
              <div className="flex gap-2">
                {row.status === 'pending' ? (
                  <Button block disabled={busy || !mayDecide} onClick={() => confirm.mutate()}>
                    Xác nhận
                  </Button>
                ) : null}
                <Button
                  block
                  disabled={busy || !mayDecide || row.status === 'seated' || row.status === 'no_show'}
                  onClick={() => noShow.mutate()}
                >
                  No-show
                </Button>
                <Button
                  block
                  variant="danger"
                  disabled={busy || !mayDecide || row.status === 'seated'}
                  onClick={() => setAskCancel(true)}
                >
                  Huỷ
                </Button>
              </div>
            </footer>
          </>
        )}
      </aside>
    </div>
  )
}

/** Giờ treo tường của quán — nhân viên và khách cùng múi giờ */
export function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}
