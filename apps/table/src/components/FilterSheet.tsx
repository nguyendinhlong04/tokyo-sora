import { Button } from '@sora/ui'
import { FILTER_LABELS, NO_FILTERS, countActive, type Filters } from '../menu'
import { Sheet } from './Sheet'

/**
 * T5 Bộ lọc.
 *
 * Lọc ngay khi gạt, không đợi bấm "Áp dụng": nút dưới cùng nói luôn còn bao
 * nhiêu món phù hợp nên khách thấy hậu quả của điều kiện vừa gạt, thay vì gạt
 * mù rồi mới biết mình vừa lọc sạch thực đơn.
 */
export function FilterSheet({
  open,
  filters,
  matchCount,
  onChange,
  onClose,
}: {
  open: boolean
  filters: Filters
  matchCount: number
  onChange: (next: Filters) => void
  onClose: () => void
}) {
  const active = countActive(filters)

  return (
    <Sheet open={open} onClose={onClose}>
      <div className="flex items-center justify-between px-5 pt-5">
        <p className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Bộ lọc</p>
        {active > 0 ? (
          <Button variant="ghost" onClick={() => onChange(NO_FILTERS)}>
            Xoá hết
          </Button>
        ) : null}
      </div>

      <div className="px-4 pt-4">
        {FILTER_LABELS.map((row) => {
          const on = filters[row.key]
          return (
            <button
              key={row.key}
              type="button"
              role="switch"
              aria-checked={on}
              onClick={() => onChange({ ...filters, [row.key]: !on })}
              className="flex h-13 w-full items-center justify-between gap-4 border-b border-surface-4 text-left"
            >
              <span className="text-[length:var(--fs-b1)] text-ink-hi">{row.label}</span>
              <span
                className={[
                  'relative h-7.5 w-13 flex-none rounded-pill transition-colors',
                  on ? 'bg-accent-strong' : 'bg-line-3',
                ].join(' ')}
                style={{ transitionDuration: 'var(--dur-micro)' }}
              >
                <span
                  className={[
                    'absolute top-1 h-5.5 w-5.5 rounded-pill transition-[left]',
                    on ? 'left-6.5 bg-on-accent' : 'left-1 bg-ink-mute',
                  ].join(' ')}
                  style={{ transitionDuration: 'var(--dur-micro)' }}
                />
              </span>
            </button>
          )
        })}
      </div>

      <div className="px-4 pt-6 pb-5">
        <Button variant="primary" size="lg" block onClick={onClose}>
          Xem {matchCount} món phù hợp
        </Button>
      </div>
    </Sheet>
  )
}
