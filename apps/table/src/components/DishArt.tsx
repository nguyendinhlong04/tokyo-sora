import type { ReactNode } from 'react'
import type { Dish } from '../api'

const FRAMES = {
  /** Thẻ ở lưới ba cột — ô hiển thị khoảng 176×132 */
  card: {
    frame: 'aspect-4/3',
    kanji: 'text-[34px]',
    stamp: 'h-[38px] px-4 text-[length:var(--fs-b1)]',
  },
  /** Cột trái của chi tiết món — ô khoảng 280×187 */
  detail: {
    frame: 'aspect-3/2 rounded-md border border-line-1',
    kanji: 'text-[56px]',
    stamp: 'h-11 px-5 text-[length:var(--fs-t2)]',
  },
}

/**
 * Ảnh món trên iPad: "đĩa ảnh" vẽ bằng CSS, món đặt giữa đĩa (§4.7).
 *
 * Chưa có ảnh thì đĩa trống mang chữ kana đầu tên món — vẫn là ngôn ngữ đồ hoạ
 * của thực đơn, không phải ô xám chờ ảnh. Có ảnh thì ảnh tách nền nằm giữa đĩa,
 * chiếm khoảng 80% khung.
 *
 * Món hết: đĩa mờ đi và đóng dấu "Đã hết" nghiêng lên trên — nhìn lướt cả lưới
 * là thấy ngay, không cần đọc tới dòng giá.
 */
export function DishArt({
  dish,
  soldOut,
  size,
  children,
}: {
  dish: Dish
  soldOut: boolean
  size: keyof typeof FRAMES
  /** Nhãn góc trên — "Còn 3" */
  children?: ReactNode
}) {
  const f = FRAMES[size]
  return (
    <span
      className={[
        'relative grid w-full place-items-center overflow-hidden',
        'bg-[radial-gradient(120%_100%_at_50%_20%,var(--sora-line-1)_0%,var(--sora-surface-4)_74%)]',
        f.frame,
      ].join(' ')}
    >
      {dish.imageUrl ? (
        // `<img>` thuần: app Vite chưa có đường ống ảnh (§8) — kích thước khai sẵn để
        // khung không nhảy, `lazy` để lưới chỉ giải mã ảnh đang ở trên màn.
        <img
          src={dish.imageUrl}
          alt=""
          width={400}
          height={300}
          loading="lazy"
          decoding="async"
          className={[
            'h-[80%] w-[80%] object-contain drop-shadow-lg',
            soldOut ? 'opacity-30' : '',
          ].join(' ')}
        />
      ) : (
        <span
          aria-hidden
          className={[
            'grid aspect-[1.55/1] w-[70%] place-items-center rounded-pill border border-accent/12',
            'bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--sora-line-4)_60%,transparent),color-mix(in_srgb,var(--sora-line-1)_25%,transparent))]',
            soldOut ? 'opacity-30' : '',
          ].join(' ')}
        >
          <span className={['font-jp leading-none text-gold-700', f.kanji].join(' ')}>
            {dish.kana ?? '空'}
          </span>
        </span>
      )}
      {soldOut ? (
        <span
          className={[
            'absolute top-1/2 left-1/2 flex -translate-x-1/2 -translate-y-1/2 -rotate-10 items-center rounded-sm bg-danger/92',
            'font-bold tracking-[0.16em] whitespace-nowrap text-ink-hi uppercase',
            'outline-1 -outline-offset-[5px] outline-ink-hi/55',
            f.stamp,
          ].join(' ')}
        >
          Đã hết
        </span>
      ) : null}
      {children}
    </span>
  )
}
