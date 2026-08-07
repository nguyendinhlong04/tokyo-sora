import { Badge, Money } from '@sora/ui'
import type { Dish } from '../api'
import { Plate } from './Plate'

/**
 * Một dòng món trên thực đơn (bố cục A của bản thiết kế — dòng 104px).
 *
 * Chạm vào phần chữ mở chi tiết; nút + thêm thẳng vào giỏ. Hai đích chạm tách
 * hẳn nhau: khách đã biết mình muốn gì thì không phải mở thêm màn nào.
 */
export function DishRow({
  dish,
  soldOut,
  needsChoice = false,
  remaining = null,
  qty = 0,
  onOpen,
  onAdd,
}: {
  dish: Dish
  soldOut: boolean
  /** Món phải chọn vị / số người ăn — chấm vàng báo trước rằng nút + sẽ mở chi tiết */
  needsChoice?: boolean
  /** Bếp đang giới hạn "còn N phần" — nói trước để khách khỏi gọi hụt */
  remaining?: number | null
  /** Đã có mấy phần món này trong giỏ — 0 thì không hiện gì */
  qty?: number
  onOpen: () => void
  onAdd: () => void
}) {
  return (
    <div className="flex h-26 items-center gap-3.5 border-b border-surface-4 px-4">
      {/*
        `min-w-0` BẮT BUỘC ở đây, không phải chỉ ở thẻ chữ bên trong.
        Mặc định một flex item không co xuống dưới bề rộng nội dung của nó, nên
        món có mô tả dài sẽ đẩy phình cả hàng và hất nút + ra ngoài mép màn hình.
        Đặt ở span con không cứu được vì chặn nằm ở đúng cấp này.
      */}
      <button
        type="button"
        onClick={onOpen}
        className="flex min-w-0 flex-1 items-center gap-3.5 text-left"
      >
        <Plate kanji={dish.kana} className="h-22 w-22 flex-none" />
        <span className="min-w-0 flex-1">
          <span className="block text-[length:var(--fs-t2)] font-semibold text-ink-hi">
            {dish.nameVi}
          </span>
          {dish.shortDesc ? (
            <span className="mt-1 block truncate text-[length:var(--fs-b2)] text-ink-body">
              {dish.shortDesc}
            </span>
          ) : null}
          <span className="mt-1.5 flex flex-wrap items-center gap-2">
            <Money amount={dish.price} className="text-[length:var(--fs-b1)] text-accent-ink" />
            {soldOut ? <Badge tone="danger">Tạm hết</Badge> : null}
            {/*
              "Còn 12" chứ không phải "Còn 12 phần": đo trên màn 375px, nhãn dài
              làm hàng giá xuống dòng thứ hai rồi tràn 15px khỏi dòng cao cố định
              104px với món tên dài. Nhãn ngắn giữ nguyên mốc cũ.
            */}
            {!soldOut && remaining !== null ? <Badge tone="warn">Còn {remaining}</Badge> : null}
          </span>
        </span>
      </button>
      <button
        type="button"
        aria-label={needsChoice ? `Chọn kiểu cho ${dish.nameVi}` : `Thêm ${dish.nameVi}`}
        disabled={soldOut}
        onClick={onAdd}
        className="relative h-[var(--hit-target)] w-[var(--hit-target)] flex-none rounded-sm border border-accent text-[length:var(--fs-t1)] text-accent-ink disabled:border-line-4 disabled:text-ink-mute"
      >
        {/*
          Số phần đã có trong giỏ, gắn thẳng lên nút thêm.

          KHÔNG đặt nó xuống hàng giá bên trái: hàng đó `flex-wrap` nằm trong dòng
          cao cố định 104px, và đo thật cho thấy chỉ cần thêm một huy hiệu là món
          tên dài (hoặc món vừa hết vừa có trong giỏ) bị đẩy xuống dòng thứ hai
          rồi tràn ra ngoài dòng.

          Có số thì số thay chỗ chấm vàng: chấm chỉ là lời báo trước rằng bấm +
          sẽ mở màn chọn kiểu, mà khách đã chọn món này rồi thì họ biết điều đó.
        */}
        {qty > 0 ? (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-pill bg-accent-strong px-1 font-mono text-[length:var(--fs-c2)] font-semibold text-on-accent">
            {qty}
          </span>
        ) : needsChoice && !soldOut ? (
          <span className="absolute -top-1 -right-1 h-2 w-2 rounded-pill bg-accent" />
        ) : null}
        +
      </button>
    </div>
  )
}
