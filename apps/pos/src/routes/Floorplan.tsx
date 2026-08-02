import { Button, Card, EmptyState, Modal, SectionLabel, TableTile, useToast, type TableState } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type TableRow } from '../api'
import { useSession } from '../session-context'

/** Trạng thái hiển thị suy từ phiên bàn và trạng thái thanh toán */
function stateOf(row: TableRow): TableState {
  const session = row.session
  if (!session) return 'empty'
  if (session.status === 'paid_wait_clear') return 'paid'
  if (session.paymentState === 'partial') return 'partial'
  if (session.total > 0) return 'ordered'
  return 'seated'
}

export function Floorplan() {
  const { branchId } = useSession()
  const navigate = useNavigate()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [opening, setOpening] = useState<TableRow | null>(null)
  const [guestCount, setGuestCount] = useState(2)
  /** Bàn có khách đặt — đã hỏi lại và nhân viên vẫn muốn mở */
  const [override, setOverride] = useState(false)

  const tables = useQuery({
    queryKey: ['tables', branchId],
    queryFn: () => api.tables(branchId!),
    enabled: Boolean(branchId),
    // Thay cho realtime khi chưa cấu hình Supabase: hỏi lại định kỳ. Có Realtime
    // rồi thì con số này chỉ còn là lưới an toàn.
    refetchInterval: 10_000,
  })

  const shift = useQuery({
    queryKey: ['shift', branchId],
    queryFn: () => api.openShiftOf(branchId!),
    enabled: Boolean(branchId),
  })

  const openShift = useMutation({
    mutationFn: () => api.openShift(branchId!, 0),
    onSuccess: () => {
      toast('Đã mở ca', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['shift', branchId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  /**
   * P3 mở bàn. Bàn đã hứa cho khách đặt thì máy chủ chặn lần bấm đầu; lần thứ
   * hai nhân viên bấm là mở đè, và lựa chọn đó nằm trong nhật ký.
   */
  const openTable = useMutation({
    mutationFn: ({ row, override }: { row: TableRow; override: boolean }) =>
      api.openTable(row.id, guestCount, row.code, override),
    onSuccess: (result, { row }) => {
      setOpening(null)
      setOverride(false)
      void queryClient.invalidateQueries({ queryKey: ['tables', branchId] })
      void queryClient.invalidateQueries({ queryKey: ['reservations'] })
      if (result?.id) void navigate(`/table/${result.id}?code=${row.code}`)
      else toast('Đang chờ mạng — bàn sẽ mở khi gửi được', 'warn')
    },
    onError: (err: Error) => {
      /**
       * Suất mới đặt xen vào giữa lúc mở sơ đồ và lúc bấm — máy chủ vẫn chặn,
       * hộp thoại giữ nguyên và đổi thành nút xác nhận lần hai.
       */
      if (err.message.includes('đã dành cho')) setOverride(true)
      toast(err.message, 'danger')
    },
  })

  const byArea = new Map<string, TableRow[]>()
  for (const row of tables.data ?? []) {
    const key = row.area ?? 'Khác'
    byArea.set(key, [...(byArea.get(key) ?? []), row])
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      {!shift.isPending && !shift.data ? (
        <Card className="flex items-center justify-between gap-4 border-warn p-4">
          <p className="text-[length:var(--fs-b1)] text-ink-body">
            Chưa mở ca — mở ca trước khi thu tiền.
          </p>
          <Button variant="primary" onClick={() => openShift.mutate()} disabled={openShift.isPending}>
            Mở ca
          </Button>
        </Card>
      ) : null}

      {tables.isPending ? (
        <p className="text-ink-mute">Đang tải sơ đồ bàn…</p>
      ) : (tables.data?.length ?? 0) === 0 ? (
        <EmptyState title="Chi nhánh chưa khai bàn nào. Vào Office → A3 để vẽ sơ đồ bàn." />
      ) : (
        [...byArea.entries()].map(([area, rows]) => (
          <section key={area} className="flex flex-col gap-3">
            <SectionLabel>{area}</SectionLabel>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
              {rows.map((row) => (
                <TableTile
                  key={row.id}
                  code={row.code}
                  area={row.area}
                  hasGrill={row.hasGrill}
                  seatMax={row.seatMax}
                  state={stateOf(row)}
                  guestCount={row.session?.guestCount}
                  total={row.session?.total}
                  // Nhãn `Đặt 19:00` — bàn này đã hứa cho ai đó trong 90 phút tới
                  reservedAt={
                    row.reservation
                      ? new Date(row.reservation.slotAt).toLocaleTimeString('vi-VN', {
                          hour: '2-digit',
                          minute: '2-digit',
                        })
                      : undefined
                  }
                  onClick={() => {
                    if (row.session) void navigate(`/table/${row.session.id}?code=${row.code}`)
                    else {
                      setGuestCount(Math.min(2, row.seatMax))
                      // Cảnh báo đã hiện ngay trong hộp thoại, nên lần bấm đầu
                      // cũng chính là lần xác nhận — không bắt bấm hai lần để
                      // đọc lại một câu vừa đọc
                      setOverride(Boolean(row.reservation))
                      setOpening(row)
                    }
                  }}
                />
              ))}
            </div>
          </section>
        ))
      )}

      <Modal
        open={opening !== null}
        title={`Mở bàn ${opening?.code ?? ''}`}
        onClose={() => setOpening(null)}
        footer={
          <>
            <Button onClick={() => setOpening(null)}>Huỷ</Button>
            <Button
              variant={override ? 'danger' : 'primary'}
              disabled={openTable.isPending}
              onClick={() => opening && openTable.mutate({ row: opening, override })}
            >
              {override ? 'Vẫn mở bàn' : 'Mở bàn'}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          {opening?.reservation ? (
            <div className="rounded-sm border border-warn bg-warn/8 p-3">
              <p className="text-[length:var(--fs-b2)] text-ink-hi">
                Bàn này đã dành cho <strong>{opening.reservation.customerName}</strong> lúc{' '}
                {new Date(opening.reservation.slotAt).toLocaleTimeString('vi-VN', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                ({opening.reservation.guestCount} khách · {opening.reservation.displayCode}).
              </p>
              <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
                Xếp khách khác vào đây thì lát nữa phải mời một trong hai bàn đứng dậy. Còn bàn
                trống khác không?
              </p>
            </div>
          ) : null}
          <SectionLabel>Số khách</SectionLabel>
          <div className="flex flex-wrap gap-2">
            {Array.from({ length: opening?.seatMax ?? 4 }, (_, i) => i + 1).map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setGuestCount(n)}
                className={[
                  'h-[var(--hit-target)] w-[var(--hit-target)] rounded-sm border font-mono',
                  n === guestCount
                    ? 'border-accent bg-accent-strong text-on-accent'
                    : 'border-line-3 text-ink-body',
                ].join(' ')}
              >
                {n}
              </button>
            ))}
          </div>
          {opening?.hasGrill ? (
            <p className="text-[length:var(--fs-b2)] text-ember-2">
              Bàn có bếp than — món sống ra quầy sống để khách tự nướng.
            </p>
          ) : (
            <p className="text-[length:var(--fs-b2)] text-info">
              Bàn không có bếp — bếp nướng hộ, món thêm khoảng 8 phút.
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
