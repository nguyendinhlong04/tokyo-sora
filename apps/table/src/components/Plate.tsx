/**
 * Ô ảnh món.
 *
 * Bộ thiết kế để sẵn `<image-slot>` với id ổn định vì ảnh thật chưa chụp
 * (README §6). Cho tới lúc có CDN ảnh, ô này giữ đúng khung hình và đặt chữ kanji
 * của món vào giữa — khách vẫn phân biệt được món bằng mắt, và khi thay bằng
 * <img> thì bố cục không xê dịch.
 */
export function Plate({
  kanji,
  className = '',
  textClassName = 'text-[40px]',
}: {
  kanji: string | null
  className?: string
  textClassName?: string
}) {
  return (
    <div
      className={[
        'grid place-items-center overflow-hidden rounded-md border border-line-1',
        'bg-[radial-gradient(120%_100%_at_50%_20%,var(--sora-line-1)_0%,var(--sora-surface-4)_74%)]',
        className,
      ].join(' ')}
    >
      <span className={['font-jp leading-none text-gold-900', textClassName].join(' ')}>
        {kanji ?? '空'}
      </span>
    </div>
  )
}
