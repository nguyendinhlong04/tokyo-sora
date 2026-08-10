import { useEffect, useRef, useState } from 'react'

/**
 * Mục lục nhóm món của T2 — dính dưới thanh đầu trang và tự sáng đúng nhóm khách
 * đang đọc.
 *
 * BẢN SAO CÓ CHỦ Ý của `apps/web/components/MenuIndex.tsx`, cắt bỏ hai tham số mà
 * chỉ trang thương hiệu cần. Sửa cách chọn "đang đọc" ở đây thì phải sửa cả bên
 * kia — hai app không dùng chung một gói giao diện nào ngoài `@sora/ui`, mà thanh
 * này thì web không nhập từ đó.
 *
 * Thay cho dải chip cuộn ngang cũ: mười nhóm mà chỉ hở ba, bảy cái còn lại nằm
 * sau một cử chỉ không có dấu hiệu nào báo là có.
 *
 * Nhóm phải mang `id="chuong-{id}"` và một `scroll-margin-top` — thanh này đọc
 * đúng con số đó ra làm mốc "đang đọc", nên hai bên không bao giờ lệch nhau.
 */

export interface MenuChapter {
  id: string
  kanji: string | null
  nameVi: string
}

export function MenuIndex({ chapters }: { chapters: MenuChapter[] }) {
  const [dangDoc, setDangDoc] = useState(chapters[0]?.id ?? '')

  /**
   * Thanh tự báo chiều cao của mình ra biến `--sora-muc-luc`.
   *
   * Đo 10 nhóm ở mọi khổ điện thoại đều ra 2 dòng · 86px, nhưng số nhóm là do
   * Office quyết: thêm một nhóm nữa là thanh xuống 3 dòng. Ở màn này còn một dải
   * dính THỨ HAI — chặng bò · heo · hải sản · rau — phải nằm khít ngay dưới thanh,
   * nên đóng cứng một con số thì hoặc hai dải chồng nhau, hoặc hở một khe cho nội
   * dung chạy qua. Cả `scroll-mt` của nhóm lẫn `top` của dải chặng đều đọc biến
   * này, nên ba chỗ không bao giờ lệch nhau.
   */
  const thanh = useRef<HTMLElement>(null)
  useEffect(() => {
    const el = thanh.current
    if (!el) return
    const doLai = () =>
      document.documentElement.style.setProperty('--sora-muc-luc', `${el.offsetHeight}px`)
    doLai()
    const theoDoi = new ResizeObserver(doLai)
    theoDoi.observe(el)
    return () => theoDoi.disconnect()
  }, [])

  /**
   * Nhóm khách vừa bấm, giữ sáng cho tới cú cuộn tay tiếp theo.
   *
   * Mấy nhóm cuối KHÔNG BAO GIỜ leo được lên tới ngưỡng: trang hết chỗ cuộn trước
   * khi tới lượt chúng. Bấm "Trà" là trang nhảy tới đáy rồi mục sáng đứng lại ở
   * "Rượu", khách bấm mà không thấy mình vừa bấm gì. Chỗ ghim này nói thẳng ra ý
   * định của cú bấm, thứ mà đo vị trí cuộn không bao giờ suy ra được.
   */
  const ghim = useRef<string | null>(null)

  useEffect(() => {
    let khung = 0

    const tinh = () => {
      khung = 0
      // Còn ghim thì mọi phép đo đều thua: khách vừa chỉ đúng nhóm họ muốn.
      if (ghim.current) {
        setDangDoc(ghim.current)
        return
      }
      // Ngưỡng lấy từ `scroll-margin-top` của nhóm, KHÔNG phải đáy thanh này. Đó
      // là mốc mà cú bấm vào mục lục đặt nhóm vào, nên bấm xong là nhóm đó lập
      // tức tính vào diện đang đọc. Đo đáy thanh thì hụt đúng chỗ thở mà
      // `scroll-mt` chừa ra, và mục sáng vẫn nằm ở nhóm liền trước.
      // Đọc một lần từ nhóm đầu: mọi nhóm cùng một lớp nên cùng một mốc, mà
      // `getComputedStyle` mỗi khung hình cho từng nhóm thì tốn.
      const dau = document.getElementById(`chuong-${chapters[0]?.id ?? ''}`)
      const nguong = (dau ? parseFloat(getComputedStyle(dau).scrollMarginTop) || 0 : 0) + 1
      let tim = chapters[0]?.id ?? ''
      for (const chuong of chapters) {
        const el = document.getElementById(`chuong-${chuong.id}`)
        // Nhóm cuối cùng đã trôi qua ngưỡng là nhóm đang đọc — các mốc xếp theo
        // thứ tự trang nên cứ ghi đè dần là ra cái sát ngưỡng nhất.
        if (el && el.getBoundingClientRect().top <= nguong) tim = chuong.id
      }

      // Chạm đáy trang: những nhóm chưa vượt ngưỡng thì sẽ mãi không vượt được
      // nữa. Ở đó nhóm CUỐI mới là nhóm đang đọc — để mục sáng đứng lại ở nhóm
      // cuối cùng vượt ngưỡng là nó đứng ở giữa trang trong khi khách đang nhìn
      // đáy trang. `maxCuon > 0` để trang ngắn không cuộn được không rơi vào
      // nhánh này và sáng oan mục cuối.
      const maxCuon = document.documentElement.scrollHeight - innerHeight
      const dayTrang = maxCuon > 0 && Math.ceil(scrollY) >= maxCuon
      setDangDoc(dayTrang ? (chapters[chapters.length - 1]?.id ?? tim) : tim)
    }

    // Gộp theo khung hình: vuốt một cái là hàng chục sự kiện cuộn, tính mười mốc
    // mỗi lần thì phí — mắt cũng chỉ thấy được mỗi khung một lần.
    const khiCuon = () => {
      if (!khung) khung = requestAnimationFrame(tinh)
    }

    /* Nhả ghim theo CỬ CHỈ của khách, không theo sự kiện cuộn: chính cú nhảy tới
       nhóm cũng sinh ra sự kiện cuộn, nghe nhầm chỗ đó là ghim tự tháo ngay trong
       lúc trang đang bay tới nơi. Bốn cử chỉ này đều nổ TRƯỚC `click` của thẻ mục
       lục, nên bấm mục lục vẫn ghim được. */
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
      ref={thanh}
      /* Ghim ở 48 — đúng chiều cao thanh đầu trang của Shell. Dải mất mạng chỉ
         hiện lúc rớt sóng và không ghim, nên không tính vào con số này. */
      className="sticky top-12 z-40 border-y border-accent/22 bg-canvas/94 py-1.5 backdrop-blur-md"
    >
      {/* `justify-between` chứ không phải xếp liền từ trái: mười tên xếp liền thì
          dòng nào cũng hụt một khúc bên phải, đọc ra là thanh bị lỗi chứ không
          phải thanh có chừng ấy mục. Trải đều thì mục đầu chạm lề trái, mục cuối
          chạm lề phải, khoảng cách còn lại chia cho các khe. `gap-x` chỉ là mức
          tối thiểu để dòng đầy vẫn không dính chữ vào nhau. */}
      <div className="flex flex-wrap justify-between gap-x-2 px-4">
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
                 Khoảng cách giữa các mục do `gap-x` và `justify-between` của dòng
                 lo, ở đây không đặt lề riêng: mục cuối dòng mà còn mang lề phải
                 thì nó không bao giờ chạm được mép. */
              className={`py-1.5 transition-colors ${
                dang ? 'text-gold-200' : 'text-ink-body'
              }`}
            >
              {/* Không có kanji ở đây: mười chữ Nhật ăn 200 bề ngang, mà màn này
                  chỉ chạy trên điện thoại — chỗ đó là chênh lệch giữa ba dòng và
                  bốn dòng mục lục. Kanji vẫn còn ở tiêu đề của từng nhóm. */}
              {/* Gạch chân là hai việc một lúc: báo chữ này bấm được, và tách mục
                  này với mục bên cạnh khi chỉ cách nhau 10 điểm. Nhóm đang đọc thì
                  gạch dày gấp đôi và ăn màu vàng đậm.
                  Dùng `decoration` chứ không phải viền dưới: đổi độ dày 1 lên 2 mà
                  không xê dịch chữ, nên lúc vuốt qua nhóm mới không có dòng nào
                  nhảy. */}
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
