'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { DishGlyph } from './visuals'

/**
 * Hai hàng ảnh món trượt ngang theo lượng cuộn dọc.
 *
 * Hàng trên đi sang trái, hàng dưới đi sang phải — hai chiều ngược nhau nên mắt
 * bắt được chuyển động ngay cả khi cuộn chậm. Khối KHÔNG ghim trang: khách cuộn
 * qua với tốc độ của họ, ảnh chỉ trượt theo, không ai bị giữ lại.
 *
 * Mỗi ô dẫn vào trang món của nó. Khách nhìn thấy món mình muốn ăn ở đây thì
 * phải bấm được ngay — bắt họ nhớ tên rồi đi tìm lại trong thực đơn là mất khách
 * giữa đường.
 *
 * Vị trí ngang ghi thẳng vào `style.transform` qua ref chứ không qua state: ba
 * mươi lần render một giây thì React nào cũng đuối, còn đổi một dòng transform
 * thì trình duyệt lo trên GPU.
 */

export interface RailDish {
  id: string
  nameVi: string
  /** Chữ vẽ thay ảnh khi món chưa có ảnh thật */
  glyph: string
  imageUrl: string | null
}

export function DishRails({ top, bottom }: { top: RailDish[]; bottom: RailDish[] }) {
  const frameRef = useRef<HTMLElement>(null)
  const topRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const frame = frameRef.current
    const rowTop = topRef.current
    const rowBottom = bottomRef.current
    if (!frame || !rowTop || !rowBottom) return

    let pending = 0

    const draw = () => {
      pending = 0
      const box = frame.getBoundingClientRect()

      // 0 lúc khối vừa ló lên từ mép dưới màn, 1 lúc nó vừa khuất khỏi mép trên.
      // Chia cho cả chiều cao màn cộng chiều cao khối để quãng trượt trải đều
      // suốt lúc khối còn nhìn thấy được, chứ không dồn vào một đoạn ngắn.
      const span = window.innerHeight + box.height
      const at = span > 0 ? (window.innerHeight - box.top) / span : 0
      const p = at < 0 ? 0 : at > 1 ? 1 : at

      const slack = (row: HTMLDivElement) =>
        Math.max(0, row.scrollWidth - (row.parentElement?.clientWidth ?? 0))

      rowTop.style.transform = `translate3d(${-p * slack(rowTop)}px,0,0)`
      rowBottom.style.transform = `translate3d(${-(1 - p) * slack(rowBottom)}px,0,0)`
    }

    const schedule = () => {
      if (pending) return
      pending = requestAnimationFrame(draw)
    }

    draw()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    return () => {
      if (pending) cancelAnimationFrame(pending)
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
    }
  }, [])

  return (
    <section
      ref={frameRef}
      aria-label="Món ở Tokyo Sora"
      /* 36 trên điện thoại chứ không 64: cộng với đệm dưới của khối trên là 144
         điểm ảnh trống liền nhau — gần một phần năm màn hình, đọc ra như trang
         bị lỗi chứ không ra khoảng thở */
      className="overflow-hidden py-9 lg:py-24"
    >
      {[
        { ref: topRef, dishes: top },
        { ref: bottomRef, dishes: bottom },
      ].map((row, i) => (
        <div key={i} className={`overflow-hidden ${i > 0 ? 'mt-4 lg:mt-5' : ''}`}>
          <div ref={row.ref} className="flex w-max gap-3 will-change-transform lg:gap-4">
            {/* 276×143 ở khung 1280 — đo từ trang mẫu. Tỉ lệ gần 2:1 chứ không
                phải 4:3: ô thấp thì hai hàng chồng lên nhau vẫn gọn, và mắt đọc
                được cả dải trong một tầm nhìn. */}
            {row.dishes.map((dish, at) => (
              /* `aria-label` vì món chưa có ảnh thì ô chỉ là một chữ trang trí đã
                 `aria-hidden` — không có nhãn thì trình đọc màn hình đọc ra một
                 liên kết trống. */
              <Link
                key={`${dish.id}-${at}`}
                href={`/thuc-don/${dish.id}`}
                aria-label={dish.nameVi}
                className="relative aspect-[276/143] w-[180px] flex-none overflow-hidden rounded-md border border-accent/16 transition-colors hover:border-accent/45 sm:w-[220px] lg:w-[276px]"
              >
                <DishGlyph
                  glyph={dish.glyph}
                  src={dish.imageUrl}
                  alt={dish.nameVi}
                  className="size-full"
                />
              </Link>
            ))}
          </div>
        </div>
      ))}
    </section>
  )
}
