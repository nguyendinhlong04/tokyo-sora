import { calibrate, serverNow } from '@sora/core'
import { Button, EmptyState, SectionLabel } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type ReservationBoard, type ReservationRow } from '../api'
import { useSession } from '../session-context'
import { hhmm, ReservationDrawer } from './ReservationDrawer'

/** Bề rộng một cột 30 phút trên trục giờ */
const SLOT_WIDTH = 78
const SLOT_MINUTES = 30

const STATUS_BLOCK: Record<string, string> = {
  pending: 'border border-warn text-warn',
  confirmed: 'border border-accent bg-accent/18 text-ink-hi',
  seated: 'border border-ok bg-ok/18 text-ink-hi',
  done: 'border border-line-3 text-ink-mute',
  cancelled: 'border border-dashed border-danger text-danger',
  no_show: 'border border-dashed border-danger text-danger',
}

const STATUS_LABEL: Record<string, string> = {
  pending: 'Chờ xác nhận',
  confirmed: 'Đã xác nhận',
  seated: 'Đã đến',
  done: 'Đã xong',
  cancelled: 'Đã huỷ',
  no_show: 'No-show',
}

const SEAT_LABEL: Record<string, string> = {
  standard: 'Bàn thường',
  grill: 'Bàn nướng có bếp',
  private: 'Phòng riêng',
}

/**
 * R1 bảng đặt bàn · P13 đặt bàn hôm nay.
 *
 * Một nguồn dữ liệu, hai cách nhìn: danh sách để chạy ca (ai tới, mấy giờ, bấm
 * "Đã đến"), trục giờ để nhìn cả tối và xếp bàn. Kế hoạch tách P13 và R1 thành
 * hai màn vì chúng nằm ở hai app; ở đây chung một màn thì nhân viên không phải
 * học hai chỗ, mà vẫn đúng hai chế độ đọc.
 *
 * Suất từ web về KHÔNG có bàn — xếp bàn là việc của người ở quầy. Nên dải "chưa
 * gán bàn" nằm trên cùng ở cả hai chế độ: đó là hàng đợi việc phải làm.
 */
export function Reservations() {
  const { branchId } = useSession()
  const navigate = useNavigate()
  const [mode, setMode] = useState<'list' | 'timeline'>('list')
  const [date, setDate] = useState(today())
  const [openId, setOpenId] = useState<number | null>(null)

  const board = useQuery({
    queryKey: ['reservations', branchId, date],
    queryFn: () => api.reservationBoard(branchId!, date),
    enabled: Boolean(branchId),
    refetchInterval: 20_000,
  })

  useEffect(() => {
    if (board.data?.serverNow) calibrate(board.data.serverNow)
  }, [board.data?.serverNow])

  const rows = useMemo(
    () =>
      (board.data?.reservations ?? []).filter(
        (r) => r.status !== 'cancelled' && r.status !== 'no_show',
      ),
    [board.data],
  )
  const unassigned = rows.filter((r) => r.tableId === null)

  return (
    <div className="flex h-[calc(100dvh-56px)] flex-col">
      <header className="flex flex-none flex-wrap items-start gap-4 px-6 pt-5 pb-4">
        <div>
          <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Đặt bàn</h1>
          <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
            {longDate(date)} · {rows.length} lượt đặt
            {unassigned.length > 0 ? ` · ${unassigned.length} chưa gán bàn` : ''}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-2 px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
          <Button variant={mode === 'list' ? 'primary' : 'secondary'} onClick={() => setMode('list')}>
            Danh sách
          </Button>
          <Button
            variant={mode === 'timeline' ? 'primary' : 'secondary'}
            onClick={() => setMode('timeline')}
          >
            Trục giờ
          </Button>
          <Button variant="ghost" onClick={() => void navigate('/qua-gio')}>
            Quá giờ &amp; no-show
          </Button>
        </div>
      </header>

      {board.isPending ? (
        <p className="px-6 text-ink-mute">Đang tải bảng đặt bàn…</p>
      ) : rows.length === 0 ? (
        <div className="px-6">
          <EmptyState title="Ngày này chưa có đặt chỗ nào. Khách vẫn vào trực tiếp được — mở bàn từ sơ đồ bàn như thường." />
        </div>
      ) : mode === 'list' ? (
        <ListMode rows={rows} board={board.data!} onOpen={setOpenId} />
      ) : (
        <TimelineMode board={board.data!} rows={rows} onOpen={setOpenId} />
      )}

      {openId !== null ? (
        <ReservationDrawer reservationId={openId} onClose={() => setOpenId(null)} />
      ) : null}
    </div>
  )
}

// ------------------------------------------------------------------ P13 danh sách

function ListMode({
  rows,
  board,
  onOpen,
}: {
  rows: ReservationRow[]
  board: ReservationBoard
  onOpen: (id: number) => void
}) {
  const tableOf = (id: number | null) =>
    id === null ? null : (board.tables.find((t) => t.id === id)?.code ?? null)

  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-6">
      <div className="grid gap-2.5">
        {rows.map((row) => {
          const table = tableOf(row.tableId)
          return (
            <button
              key={row.id}
              type="button"
              onClick={() => onOpen(row.id)}
              className="flex items-center gap-5 rounded-md border border-accent/16 bg-surface-4 p-4 text-left hover:border-accent"
            >
              <span className="w-16 flex-none font-mono text-[length:var(--fs-t1)] text-accent-ink">
                {hhmm(row.slotAt)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                  {row.customerName}
                </span>
                <span className="mt-1 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {row.customerPhone}
                </span>
              </span>
              <span className="w-20 flex-none text-[length:var(--fs-b2)] text-ink-body">
                {row.guestCount} khách
              </span>
              <span className="w-44 flex-none text-[length:var(--fs-b2)] text-ink-body">
                {SEAT_LABEL[row.seatKind]}
              </span>
              <span
                className={`w-28 flex-none text-[length:var(--fs-b2)] ${
                  table ? 'text-ink-hi' : 'text-warn'
                }`}
              >
                {table ? `Bàn ${table}` : 'Chưa gán bàn'}
              </span>
              <span
                className={`inline-flex h-7 flex-none items-center rounded-pill px-3 text-[length:var(--fs-c1)] ${
                  STATUS_BLOCK[row.status]
                }`}
              >
                {STATUS_LABEL[row.status]}
              </span>
              {row.note ? (
                <span className="w-40 flex-none truncate text-[length:var(--fs-c1)] text-gold-300">
                  {row.note}
                </span>
              ) : null}
            </button>
          )
        })}
      </div>
    </div>
  )
}

// -------------------------------------------------------------------- R1 trục giờ

function TimelineMode({
  board,
  rows,
  onOpen,
}: {
  board: ReservationBoard
  rows: ReservationRow[]
  onOpen: (id: number) => void
}) {
  const assigned = rows.filter((r) => r.tableId !== null)
  const unassigned = rows.filter((r) => r.tableId === null)

  // Trục giờ ôm trọn mọi suất trong ngày, tối thiểu 17:00–23:00
  const minutes = assigned.concat(unassigned).flatMap((r) => [minuteOf(r.slotAt), minuteOf(r.endAt)])
  const from = Math.floor(Math.min(17 * 60, ...minutes) / SLOT_MINUTES) * SLOT_MINUTES
  const to = Math.ceil(Math.max(23 * 60, ...minutes) / SLOT_MINUTES) * SLOT_MINUTES
  const columns = Array.from(
    { length: Math.max(1, (to - from) / SLOT_MINUTES) },
    (_, i) => from + i * SLOT_MINUTES,
  )

  const byArea = new Map<string, ReservationBoard['tables']>()
  for (const table of board.tables) {
    const key = table.area ?? 'Khác'
    byArea.set(key, [...(byArea.get(key) ?? []), table])
  }

  const nowMinute = minuteOfDate(new Date(serverNow()))
  const showNow = board.businessDate === today() && nowMinute >= from && nowMinute <= to

  return (
    <div className="min-h-0 flex-1 overflow-auto px-6 pb-6">
      {unassigned.length > 0 ? (
        <div className="mb-4 rounded-md border border-warn bg-warn/8 p-4">
          <SectionLabel>Chưa gán bàn · {unassigned.length}</SectionLabel>
          <div className="mt-3 flex flex-wrap gap-2">
            {unassigned.map((row) => (
              <button
                key={row.id}
                type="button"
                onClick={() => onOpen(row.id)}
                className="rounded-sm border border-warn px-3 py-2 text-left hover:border-accent"
              >
                <span className="font-mono text-[length:var(--fs-b2)] text-accent-ink">
                  {hhmm(row.slotAt)}
                </span>
                <span className="ml-2 text-[length:var(--fs-b2)] text-ink-hi">
                  {row.customerName}
                </span>
                <span className="ml-2 text-[length:var(--fs-c1)] text-ink-mute">
                  {row.guestCount} khách · {SEAT_LABEL[row.seatKind]}
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        className="overflow-hidden rounded-md border border-line-1 bg-surface-4"
        style={{ minWidth: 130 + columns.length * SLOT_WIDTH }}
      >
        <div className="sticky top-0 z-10 flex border-b border-line-1 bg-surface-2">
          <div className="w-[130px] flex-none px-3.5 py-2.5 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            Bàn
          </div>
          {columns.map((minute) => (
            <div
              key={minute}
              className="flex-none border-l border-line-1 py-2.5 text-center font-mono text-[length:var(--fs-c1)] text-ink-mute"
              style={{ width: SLOT_WIDTH }}
            >
              {label(minute)}
            </div>
          ))}
        </div>

        {[...byArea.entries()].map(([area, tables]) => (
          <div key={area}>
            <div className="sticky left-0 border-b border-line-1 bg-surface-2 px-3.5 py-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-accent-ink uppercase">
              {area}
            </div>
            {tables.map((table) => (
              <div key={table.id} className="relative flex h-14 border-b border-line-1">
                <div className="sticky left-0 z-5 flex w-[130px] flex-none flex-col justify-center border-r border-line-1 bg-surface-4 px-3.5">
                  <span className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                    Bàn {table.code}
                  </span>
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {table.seatMax} chỗ
                  </span>
                </div>
                <div className="relative flex flex-1">
                  {columns.map((minute) => (
                    <div
                      key={minute}
                      className="flex-none border-l border-line-1"
                      style={{ width: SLOT_WIDTH }}
                    />
                  ))}
                  {showNow ? (
                    <div
                      aria-hidden
                      className="absolute top-0 bottom-0 w-px bg-ember-2"
                      style={{ left: ((nowMinute - from) / SLOT_MINUTES) * SLOT_WIDTH }}
                    />
                  ) : null}
                  {assigned
                    .filter((r) => r.tableId === table.id)
                    .map((row) => {
                      const start = minuteOf(row.slotAt)
                      const end = minuteOf(row.endAt)
                      return (
                        <button
                          key={row.id}
                          type="button"
                          onClick={() => onOpen(row.id)}
                          className={`absolute top-1.5 bottom-1.5 overflow-hidden rounded-sm px-2 py-1.5 text-left ${
                            STATUS_BLOCK[row.status]
                          }`}
                          style={{
                            left: ((start - from) / SLOT_MINUTES) * SLOT_WIDTH + 4,
                            width: Math.max(
                              SLOT_WIDTH - 8,
                              ((end - start) / SLOT_MINUTES) * SLOT_WIDTH - 8,
                            ),
                          }}
                        >
                          <span className="block truncate text-[length:var(--fs-c1)] font-semibold">
                            {row.customerName}
                          </span>
                          <span className="mt-0.5 block truncate text-[length:var(--fs-c2)] opacity-80">
                            {row.guestCount} khách · {STATUS_LABEL[row.status]}
                          </span>
                        </button>
                      )
                    })}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------- tiện ích

function today(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  const dow = ['Chủ nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'][
    d.getDay()
  ]
  return `${dow} · ${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`
}

function minuteOf(iso: string): number {
  return minuteOfDate(new Date(iso))
}

function minuteOfDate(at: Date): number {
  return at.getHours() * 60 + at.getMinutes()
}

function label(minute: number): string {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}
