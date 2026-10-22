import { IconBack } from '../icons'

const STEPS = ['Cách trả', 'Quét mã', 'Xác nhận', 'Hoá đơn']

/** Nút lùi nhỏ phía trên tiêu đề màn — chữ xám, vùng chạm vẫn 44px */
export function BackLink({ onClick, children }: { onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="-mt-1 -mb-1.5 -ml-2.5 inline-flex h-11 items-center gap-1 rounded-sm px-2.5 text-[length:var(--fs-b2)] text-ink-mute"
    >
      <IconBack size={16} />
      {children}
    </button>
  )
}

/**
 * Đầu các màn thanh toán trên iPad: tiêu đề bên trái, bốn bước bên phải.
 *
 * Bốn bước luôn hiện đủ để khách biết mình đang ở đâu trong chuyện trả tiền —
 * nhất là ở bước chờ ngân hàng, lúc người ta hay nghĩ "xong chưa nhỉ".
 */
export function PayHeader({
  step,
  title,
  sub,
  back,
}: {
  /**
   * 1 Cách trả · 2 Quét mã · 3 Xác nhận · 4 Hoá đơn (4 = mọi bước đã qua).
   * Bỏ trống khi màn không nằm trên đường trả tiền — tạm tính xem trước khi trả.
   */
  step?: 1 | 2 | 3 | 4
  title: string
  sub: string
  back?: { label: string; onClick: () => void }
}) {
  return (
    <div className="flex flex-none items-end gap-4 border-b border-surface-4 px-6 pt-2.5 pb-3.5">
      <div className="min-w-0 flex-1">
        {back ? <BackLink onClick={back.onClick}>{back.label}</BackLink> : null}
        <h1 className="font-display text-[length:var(--fs-d3)] leading-[1.15] font-light text-ink-hi">
          {title}
        </h1>
        <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">{sub}</p>
      </div>
      {step === undefined ? null : (
        <ol aria-label="Các bước thanh toán" className="mb-1 flex items-center gap-2">
          {STEPS.map((label, i) => {
            const no = i + 1
            const on = no === step && step !== 4
            const done = no < step || step === 4
            return (
              <li
                key={label}
                aria-current={on ? 'step' : undefined}
                className={[
                  'flex items-center gap-1.5 text-[length:var(--fs-c1)] whitespace-nowrap',
                  on ? 'font-semibold text-ink-hi' : done ? 'text-ink-body' : 'text-ink-mute',
                ].join(' ')}
              >
                {i > 0 ? <span aria-hidden className="mr-1 h-px w-3.5 bg-line-3" /> : null}
                <span
                  className={[
                    'grid h-5 w-5 place-items-center rounded-sm font-mono text-[length:var(--fs-c1)]',
                    on
                      ? 'border border-accent text-gold-200'
                      : done
                        ? 'bg-line-1 text-ink-body'
                        : 'border border-line-3 text-ink-mute',
                  ].join(' ')}
                >
                  {no}
                </span>
                {label}
              </li>
            )
          })}
        </ol>
      )}
    </div>
  )
}
