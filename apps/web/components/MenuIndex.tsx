'use client'

import { useEffect, useState } from 'react'

/**
 * Mục lục chương của W2 — dính dưới thanh điều hướng và tự sáng đúng chương
 * khách đang đọc.
 *
 * Là client component vì chỉ có một việc máy chủ không làm thay được: biết
 * khách đã vuốt tới đâu. Mọi thứ còn lại — tên chương, thứ tự — vẫn do trang
 * (server component) truyền xuống, ở đây không gọi dữ liệu gì thêm.
 */

export interface MenuChapter {
  id: string
  kanji: string | null
  nameVi: string
}

export function MenuIndex({ chapters }: { chapters: MenuChapter[] }) {
  const [dangDoc, setDangDoc] = useState(chapters[0]?.id ?? '')

  useEffect(() => {
    let khung = 0

    const tinh = () => {
      khung = 0
      // Ngưỡng lấy từ chính đáy thanh này chứ không phải một số cứng: dải vàng
      // và thanh điều hướng đều dính, thanh này lại đổi từ hai dòng xuống một
      // dòng theo bề ngang — đo tại chỗ thì không có con số nào để lệch.
      const nguong = (document.getElementById('muc-luc')?.getBoundingClientRect().bottom ?? 0) + 1
      let tim = chapters[0]?.id ?? ''
      for (const chuong of chapters) {
        const el = document.getElementById(`chuong-${chuong.id}`)
        // Chương cuối cùng đã trôi qua ngưỡng là chương đang đọc — các mốc xếp
        // theo thứ tự trang nên cứ ghi đè dần là ra cái sát ngưỡng nhất.
        if (el && el.getBoundingClientRect().top <= nguong) tim = chuong.id
      }
      setDangDoc(tim)
    }

    // Gộp theo khung hình: vuốt một cái là hàng chục sự kiện cuộn, tính mười
    // mốc mỗi lần thì phí — mắt cũng chỉ thấy được mỗi khung một lần.
    const khiCuon = () => {
      if (!khung) khung = requestAnimationFrame(tinh)
    }

    tinh()
    addEventListener('scroll', khiCuon, { passive: true })
    addEventListener('resize', khiCuon)
    return () => {
      removeEventListener('scroll', khiCuon)
      removeEventListener('resize', khiCuon)
      if (khung) cancelAnimationFrame(khung)
    }
  }, [chapters])

  return (
    <nav
      id="muc-luc"
      /* Đáy phần đã ghim, theo `SiteTopBar` và `SiteHeader`: dải vàng cao
         32 · 40 · 44, thanh điều hướng dính ngay dưới nó và cao 64 · 64 · 80 —
         ra 96 · 104 · 124. Ba mức chứ không một: ghim cứng 96 thì trên laptop
         thanh điều hướng cao 80 đè mất 28 phía trên thanh này, chữ mục lục bị
         cắt ngang. Số lấy từ hai component đó chứ không đo trong preview — máy
         chủ dev đang phục vụ CSS thiếu, ở đó header báo cao 64 với mọi khổ. */
      className="sticky top-24 z-40 mt-8 border-y border-accent/22 bg-canvas/94 py-1.5 backdrop-blur-md sm:top-26 lg:top-31 lg:mt-10"
    >
      {/* `justify-between` chứ không phải xếp liền từ trái: mười tên xếp liền
          thì dòng nào cũng hụt một khúc bên phải — trên laptop hụt tới 480, đọc
          ra là thanh bị lỗi chứ không phải thanh có chừng ấy mục. Trải đều thì
          mục đầu chạm lề trái, mục cuối chạm lề phải, khoảng cách còn lại chia
          cho các khe. `gap-x` chỉ là mức tối thiểu để dòng đầy vẫn không dính
          chữ vào nhau. */}
      <div className="mx-auto flex max-w-[1280px] flex-wrap justify-between gap-x-2 px-5 lg:px-10">
        {chapters.map((chuong) => {
          const dang = chuong.id === dangDoc
          return (
            <a
              key={chuong.id}
              href={`#chuong-${chuong.id}`}
              aria-current={dang ? 'location' : undefined}
              /* Đệm dọc để ngón tay có chỗ bấm — chữ 14 một mình chỉ cao 20.
                 Khoảng cách giữa các mục do `gap-x` và `justify-between` của
                 dòng lo, ở đây không đặt lề riêng: mục cuối dòng mà còn mang
                 lề phải thì nó không bao giờ chạm được mép. */
              className={`py-1.5 transition-colors ${
                dang ? 'text-gold-200' : 'text-ink-body hover:text-gold-200'
              }`}
            >
              {/* Kanji chỉ hiện từ 1024: mười chữ Nhật ăn 200 bề ngang. Trên
                  máy đó là chỗ thiếu để mục lục vượt từ hai dòng lên ba; trên
                  máy bảng còn tệ hơn — 768 vừa đủ hụt, dòng dưới còn hai mục bị
                  đẩy ra hai đầu cách nhau 611. Bỏ kanji thì 768 gom lại một
                  dòng, chỗ nào có kanji là chỗ chắc chắn đủ rộng. */}
              {chuong.kanji ? (
                <span className="mr-1.5 hidden font-jp text-[length:var(--fs-b2)] text-accent lg:inline">
                  {chuong.kanji}
                </span>
              ) : null}
              {/* Gạch chân là hai việc một lúc: báo chữ này bấm được, và tách
                  mục này với mục bên cạnh khi chỉ cách nhau 10 điểm. Chương
                  đang đọc thì gạch dày gấp đôi và ăn màu vàng đậm.
                  Dùng `decoration` chứ không phải viền dưới: đổi độ dày 1 lên 2
                  mà không xê dịch chữ, nên lúc vuốt qua chương mới không có
                  dòng nào nhảy. */}
              <span
                className={`text-[length:var(--fs-b2)] font-medium tracking-[0.04em] underline underline-offset-[6px] ${
                  dang ? 'decoration-accent decoration-2' : 'decoration-accent/40 decoration-1'
                }`}
              >
                {chuong.nameVi}
              </span>
            </a>
          )
        })}
      </div>
    </nav>
  )
}
