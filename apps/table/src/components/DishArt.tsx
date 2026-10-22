import { OptimizedImage, type OptimizerWidth } from '@sora/ui/image'
import type { ReactNode } from 'react'
import type { Dish } from '../api'

/**
 * `sizes` là bề rộng ô ảnh đo ở khung 1080: ảnh chiếm 80% ô.
 *
 * Thẻ lưới lấy tấm 256 — trên màn mật độ 2× là khoảng 1,8 lần ô 140, đúng mức "ảnh ô
 * ≤ 2× cỡ hiển thị" của §8: cả lưới chục thẻ mà mỗi thẻ giải mã một tấm to là A10 đuối.
 * Chi tiết món thì khách nhìn kỹ một tấm, nên lấy tấm 640 cho nét.
 */
const FRAMES: Record<
  'card' | 'detail',
  { frame: string; kanji: string; stamp: string; widths: OptimizerWidth[]; sizes: string }
> = {
  /** Thẻ ở lưới ba cột — ô 174×131, ảnh 139×104 */
  card: {
    frame: 'aspect-4/3',
    kanji: 'text-[34px]',
    stamp: 'h-[38px] px-4 text-[length:var(--fs-b1)]',
    widths: [160, 256],
    sizes: '140px',
  },
  /** Cột trái của chi tiết món — ô 277×184, ảnh 222×147 */
  detail: {
    frame: 'aspect-3/2 rounded-md border border-line-1',
    kanji: 'text-[56px]',
    stamp: 'h-11 px-5 text-[length:var(--fs-t2)]',
    widths: [384, 640],
    sizes: '222px',
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
        // Qua bộ tối ưu của web (§8.1): ảnh gốc ở kho là PNG 3–9 MB rộng tới 2800 điểm
        // ảnh, ô thẻ chỉ 140. Thẻ lưới tải lười — chỉ giải mã ảnh đang ở trên màn.
        <OptimizedImage
          src={dish.imageUrl}
          widths={f.widths}
          sizes={f.sizes}
          alt=""
          eager={size === 'detail'}
          width={400}
          height={300}
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
