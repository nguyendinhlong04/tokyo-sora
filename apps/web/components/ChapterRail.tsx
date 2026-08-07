'use client'

import Link from 'next/link'
import { useEffect, useRef } from 'react'
import { DishGlyph } from './visuals'

/**
 * Dải chương thực đơn, mỗi giây tự nhích sang một ô.
 *
 * Danh sách được xếp hai lượt: khi cuộn quá lượt đầu thì kéo vị trí lùi lại đúng
 * một lượt, không kèm chuyển động — mắt không bắt được cú kéo đó nên dải chạy như
 * vòng tròn không có mối nối. Lượt sau `aria-hidden` để trình đọc màn hình không
 * đọc mười chương thành hai mươi.
 *
 * Đứng lại khi con trỏ đặt lên hoặc khi có ô đang được chọn bằng bàn phím: dải
 * này là lối vào từng chương, mà một dải cứ trôi thì không ai bấm trúng.
 */

export interface RailChapter {
  id: string
  nameVi: string
  /** Chữ vẽ thay ảnh khi chương chưa có món nào có ảnh */
  glyph: string
  imageUrl: string | null
}

export function ChapterRail({ chapters }: { chapters: RailChapter[] }) {
  const scrollerRef = useRef<HTMLDivElement>(null)
  const heldRef = useRef(false)

  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || chapters.length < 2) return

    const timer = setInterval(() => {
      if (heldRef.current) return

      const row = scroller.firstElementChild
      const first = row?.children[0]
      const second = row?.children[1]
      if (!(first instanceof HTMLElement) || !(second instanceof HTMLElement)) return

      // Một lượt = nửa hàng, vì hàng xếp hai lượt giống nhau
      const lap = scroller.scrollWidth / 2
      if (scroller.scrollLeft >= lap) scroller.scrollLeft -= lap

      scroller.scrollBy({ left: second.offsetLeft - first.offsetLeft, behavior: 'smooth' })
    }, 1000)

    return () => clearInterval(timer)
  }, [chapters.length])

  const hold = () => {
    heldRef.current = true
  }
  const release = () => {
    heldRef.current = false
  }

  return (
    <div
      ref={scrollerRef}
      onMouseEnter={hold}
      onMouseLeave={release}
      onFocusCapture={hold}
      onBlurCapture={release}
      onTouchStart={hold}
      onTouchEnd={release}
      className="mt-7 overflow-x-auto px-5 pb-2 lg:mt-9 lg:px-10 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex w-max gap-3 lg:gap-4">
        {[...chapters, ...chapters].map((chapter, at) => (
          <Link
            key={`${chapter.id}-${at}`}
            href={`/thuc-don#chuong-${chapter.id}`}
            aria-hidden={at >= chapters.length}
            tabIndex={at >= chapters.length ? -1 : undefined}
            className="relative aspect-[276/143] w-[180px] flex-none overflow-hidden rounded-md border border-accent/16 transition-colors hover:border-accent/45 sm:w-[220px] lg:w-[276px]"
          >
            <DishGlyph glyph={chapter.glyph} src={chapter.imageUrl} alt="" className="size-full" />
            <div
              aria-hidden
              className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,10,0.1)_0%,rgba(7,8,10,0.86)_100%)]"
            />
            <span className="absolute inset-x-0 bottom-0 p-4 text-[length:var(--fs-b2)] font-semibold text-ink-hi lg:text-[length:var(--fs-t2)]">
              {chapter.nameVi}
            </span>
          </Link>
        ))}
      </div>
    </div>
  )
}
