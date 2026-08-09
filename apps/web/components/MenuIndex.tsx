'use client'

import { useEffect, useRef, useState } from 'react'

/**
 * Mục lục chương của W2 — dính dưới thanh điều hướng và tự sáng đúng chương
 * khách đang đọc. O2 dùng lại nguyên thanh này cho dòng danh mục của nó.
 *
 * Là client component vì chỉ có một việc máy chủ không làm thay được: biết
 * khách đã vuốt tới đâu. Mọi thứ còn lại — tên chương, thứ tự — vẫn do trang
 * (server component) truyền xuống, ở đây không gọi dữ liệu gì thêm.
 *
 * Chương phải mang `id="chuong-{id}"` và một `scroll-margin-top` — thanh này đọc
 * đúng con số đó ra làm mốc "đang đọc", nên hai bên không bao giờ lệch nhau.
 */

export interface MenuChapter {
  id: string
  kanji: string | null
  nameVi: string
}

export function MenuIndex({
  chapters,
  /* Hai chỗ duy nhất W2 và O2 khác nhau, nên là tham số chứ không cứng hoá: chỗ
     ghim tính từ đáy thanh điều hướng của TRANG (W2 ba mức 96·104·124, O2 chỉ
     một thanh cao 56), và bề ngang dòng phải khớp cột chữ của trang đó. */
  navClass = 'top-24 mt-8 sm:top-26 lg:top-31 lg:mt-10',
  rowClass = 'mx-auto max-w-[1280px] px-5 lg:px-10',
}: {
  chapters: MenuChapter[]
  navClass?: string
  rowClass?: string
}) {
  const [dangDoc, setDangDoc] = useState(chapters[0]?.id ?? '')

  /**
   * Chương khách vừa bấm, giữ sáng cho tới cú cuộn tay tiếp theo.
   *
   * Mấy chương cuối KHÔNG BAO GIỜ leo được lên tới ngưỡng: trang hết chỗ cuộn
   * trước khi tới lượt chúng. Ở màn 1200 cao, "Bia" cần cuộn 3878 mà trang chỉ
   * cho 3861 — bấm "Bia" là trang nhảy tới đáy rồi mục sáng đứng lại ở "Ngọt",
   * khách bấm mà không thấy mình vừa bấm gì. Chỗ ghim này nói thẳng ra ý định
   * của cú bấm, thứ mà đo vị trí cuộn không bao giờ suy ra được.
   */
  const ghim = useRef<string | null>(null)

  useEffect(() => {
    let khung = 0

    const tinh = () => {
      khung = 0
      // Còn ghim thì mọi phép đo đều thua: khách vừa chỉ đúng chương họ muốn.
      if (ghim.current) {
        setDangDoc(ghim.current)
        return
      }
      // Ngưỡng lấy từ `scroll-margin-top` của chương, KHÔNG phải đáy thanh này.
      // Đó là mốc mà cú bấm vào mục lục đặt chương vào, nên bấm xong là chương
      // đó lập tức tính vào diện đang đọc. Đo đáy thanh thì hụt 17: chỗ thở mà
      // `scroll-mt` chừa ra để tiêu đề không dính thanh rơi đúng vào khe giữa
      // hai mốc, và mục sáng vẫn nằm ở chương liền trước.
      // Đọc một lần từ chương đầu: mười chương cùng một lớp nên cùng một mốc,
      // mà `getComputedStyle` mỗi khung hình cho từng chương thì tốn.
      const dau = document.getElementById(`chuong-${chapters[0]?.id ?? ''}`)
      const nguong = (dau ? parseFloat(getComputedStyle(dau).scrollMarginTop) || 0 : 0) + 1
      let tim = chapters[0]?.id ?? ''
      for (const chuong of chapters) {
        const el = document.getElementById(`chuong-${chuong.id}`)
        // Chương cuối cùng đã trôi qua ngưỡng là chương đang đọc — các mốc xếp
        // theo thứ tự trang nên cứ ghi đè dần là ra cái sát ngưỡng nhất.
        if (el && el.getBoundingClientRect().top <= nguong) tim = chuong.id
      }

      // Chạm đáy trang: những chương chưa vượt ngưỡng thì sẽ mãi không vượt
      // được nữa. Ở đó chương CUỐI mới là chương đang đọc — để mục sáng đứng lại
      // ở chương cuối cùng vượt ngưỡng là nó đứng ở giữa trang trong khi khách
      // đang nhìn đáy trang. `maxCuon > 0` để trang ngắn không cuộn được không
      // rơi vào nhánh này và sáng oan mục cuối.
      const maxCuon = document.documentElement.scrollHeight - innerHeight
      const dayTrang = maxCuon > 0 && Math.ceil(scrollY) >= maxCuon
      setDangDoc(dayTrang ? (chapters[chapters.length - 1]?.id ?? tim) : tim)
    }

    // Gộp theo khung hình: vuốt một cái là hàng chục sự kiện cuộn, tính mười
    // mốc mỗi lần thì phí — mắt cũng chỉ thấy được mỗi khung một lần.
    const khiCuon = () => {
      if (!khung) khung = requestAnimationFrame(tinh)
    }

    /* Nhả ghim theo CỬ CHỈ của khách, không theo sự kiện cuộn: chính cú nhảy tới
       chương cũng sinh ra sự kiện cuộn, nghe nhầm chỗ đó là ghim tự tháo ngay
       trong lúc trang đang bay tới nơi. Bốn cử chỉ này đều nổ TRƯỚC `click` của
       thẻ mục lục, nên bấm mục lục vẫn ghim được. */
    const nhaGhim = () => {
      ghim.current = null
    }

    tinh()
    addEventListener('scroll', khiCuon, { passive: true })
    addEventListener('resize', khiCuon)
    addEventListener('wheel', nhaGhim, { passive: true })
    addEventListener('touchstart', nhaGhim, { passive: true })
    addEventListener('keydown', nhaGhim)
    addEventListener('pointerdown', nhaGhim)
    return () => {
      removeEventListener('scroll', khiCuon)
      removeEventListener('resize', khiCuon)
      removeEventListener('wheel', nhaGhim)
      removeEventListener('touchstart', nhaGhim)
      removeEventListener('keydown', nhaGhim)
      removeEventListener('pointerdown', nhaGhim)
      if (khung) cancelAnimationFrame(khung)
    }
  }, [chapters])

  return (
    <nav
      /* Mặc định là đáy phần đã ghim của W2, theo `SiteTopBar` và `SiteHeader`:
         dải vàng cao 32 · 40 · 44, thanh điều hướng dính ngay dưới nó và cao
         64 · 64 · 80 — ra 96 · 104 · 124. Ba mức chứ không một: ghim cứng 96 thì
         trên laptop thanh điều hướng cao 80 đè mất 28 phía trên thanh này, chữ
         mục lục bị cắt ngang. Số lấy từ hai component đó chứ không đo trong
         preview — máy chủ dev đang phục vụ CSS thiếu, ở đó header báo cao 64 với
         mọi khổ. */
      className={`sticky z-40 border-y border-accent/22 bg-canvas/94 py-1.5 backdrop-blur-md ${navClass}`}
    >
      {/* `justify-between` chứ không phải xếp liền từ trái: mười tên xếp liền
          thì dòng nào cũng hụt một khúc bên phải — trên laptop hụt tới 480, đọc
          ra là thanh bị lỗi chứ không phải thanh có chừng ấy mục. Trải đều thì
          mục đầu chạm lề trái, mục cuối chạm lề phải, khoảng cách còn lại chia
          cho các khe. `gap-x` chỉ là mức tối thiểu để dòng đầy vẫn không dính
          chữ vào nhau. */}
      <div className={`flex flex-wrap justify-between gap-x-2 ${rowClass}`}>
        {chapters.map((chuong) => {
          const dang = chuong.id === dangDoc
          return (
            <a
              key={chuong.id}
              href={`#chuong-${chuong.id}`}
              aria-current={dang ? 'location' : undefined}
              onClick={() => {
                ghim.current = chuong.id
                setDangDoc(chuong.id)
              }}
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
