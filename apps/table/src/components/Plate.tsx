/**
 * Ô ảnh món.
 *
 * Có ảnh thì hiện ảnh; CHƯA có thì dựng bằng đúng ngôn ngữ đồ hoạ của thiết kế —
 * nền than gradient, chữ kanji vàng đồng — thay vì ô xám hay ảnh mượn. Đường dẫn
 * ảnh nhập ở Office M1 và đi xuống theo config bundle, nên một món được bổ sung
 * ảnh là mọi màn đang vẽ ô chữ đổi sang ảnh thật, không phải sửa chỗ nào trong mã.
 *
 * Khung giữ nguyên trong cả hai trường hợp: `object-cover` để ảnh tỉ lệ nào cũng
 * lấp đầy ô mà không kéo méo, và bố cục quanh nó không nhảy.
 */
export function Plate({
  kanji,
  src = null,
  alt,
  className = '',
  textClassName = 'text-[40px]',
}: {
  kanji: string | null
  src?: string | null
  /** Chỉ cần khi có ảnh thật — ô chữ là trang trí nên vẫn `aria-hidden` */
  alt?: string
  className?: string
  textClassName?: string
}) {
  if (src) {
    return (
      <div
        className={['overflow-hidden rounded-md border border-line-1 bg-surface-4', className].join(
          ' ',
        )}
      >
        {/* `<img>` thuần: đường dẫn do người nhập khai ở Office nên không biết
            trước miền, và app này không có tầng tối ưu ảnh nào để đi qua. */}
        <img src={src} alt={alt ?? ''} className="size-full object-cover" loading="lazy" />
      </div>
    )
  }

  return (
    <div
      aria-hidden
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
