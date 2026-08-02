import { Money } from './primitives'

export type TableState = 'empty' | 'seated' | 'ordered' | 'billing' | 'partial' | 'paid' | 'clean'

export interface TableTileProps {
  code: string
  area: string | null
  hasGrill: boolean
  seatMax: number
  state: TableState
  guestCount?: number | null
  total?: number | null
  minutesOpen?: number | null
  /** Giờ hẹn của đặt chỗ sắp tới trên bàn này — nhãn `Đặt 19:00` (§P2) */
  reservedAt?: string | null
  onClick?: () => void
}

/**
 * Ô bàn trên sơ đồ P2.
 *
 * Trạng thái KHÔNG BAO GIỜ chỉ dựa vào màu (§8.4) — mỗi ô có nhãn chữ đi kèm.
 * Sàn nhà hàng thiếu sáng và nhân viên nhìn lướt, màu một mình là không đủ.
 */
const STATE_STYLE: Record<TableState, { ring: string; label: string }> = {
  empty: { ring: 'border-line-2', label: 'Trống' },
  seated: { ring: 'border-accent', label: 'Có khách' },
  ordered: { ring: 'border-accent', label: 'Đã gọi' },
  billing: { ring: 'border-warn', label: 'Chờ tính tiền' },
  // Viền đứt đỏ: khách mới trả một phần, tuyệt đối không để nhầm là xong
  partial: { ring: 'border-danger border-dashed', label: 'Trả một phần' },
  paid: { ring: 'border-ok', label: 'Đã trả · chờ dọn' },
  clean: { ring: 'border-line-3', label: 'Cần dọn' },
}

export function TableTile({
  code,
  area,
  hasGrill,
  seatMax,
  state,
  guestCount,
  total,
  minutesOpen,
  reservedAt,
  onClick,
}: TableTileProps) {
  const style = STATE_STYLE[state]
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        'flex min-h-[124px] flex-col justify-between rounded-md border-2 bg-surface-1 p-3 text-left',
        'transition-colors hover:bg-surface-3',
        // Bàn đã hứa cho khách đặt: viền chấm vàng đồng, thấy được cả khi bàn trống
        reservedAt && state === 'empty' ? 'border-dotted border-accent' : style.ring,
      ].join(' ')}
      style={{ transitionDuration: 'var(--dur-micro)' }}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[length:var(--fs-t1)] font-semibold text-ink-hi">{code}</span>
        {reservedAt ? (
          <span className="rounded-sm border border-accent px-1.5 py-0.5 font-mono text-[length:var(--fs-c2)] text-accent-ink">
            Đặt {reservedAt}
          </span>
        ) : null}
        {hasGrill ? (
          // Bàn có bếp than: nhân viên phải biết ngay vì nó đổi cả định tuyến bếp
          <span className="text-[length:var(--fs-b2)] text-ember-2" title="Bàn có bếp than">
            ▲
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-0.5">
        <span className="text-[length:var(--fs-c2)] tracking-[0.14em] text-ink-mute uppercase">
          {style.label}
        </span>
        <span className="text-[length:var(--fs-c1)] text-ink-mute">
          {guestCount ? `${guestCount}/${seatMax} khách` : (area ?? `${seatMax} chỗ`)}
          {minutesOpen ? ` · ${minutesOpen}′` : ''}
        </span>
        {total ? (
          <Money amount={total} className="text-[length:var(--fs-b2)] text-ink-body" />
        ) : null}
      </div>
    </button>
  )
}
