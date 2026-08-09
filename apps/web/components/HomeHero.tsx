'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { SITE } from '../content/site'
import { seedOrderDraft, type ReceiveMode } from '../lib/order-draft'
import type { SiteWard } from '../lib/site'

/**
 * Hero W1 — ảnh món chiếu vòng, và ngay trên nó là bước đầu của việc đặt món.
 *
 * Khách vào trang chủ để đặt, nên bước đầu tiên của luồng đặt món — giao hay đến
 * lấy, chi nhánh nào — được kéo lên đây thay vì bắt họ bấm sang màn khác rồi mới
 * chọn. Lựa chọn ghi vào bản nháp đơn (`seedOrderDraft`) nên sang `/dat-mon` là
 * đã chọn sẵn, không phải khai lại.
 *
 * Hỏi đủ để BỎ HẲN màn O1: cách nhận, địa chỉ, phường (kèm phí giao hiện ngay),
 * và chi nhánh — thứ cuối suy ra từ phường chứ không hỏi thêm câu nào. Trả lời
 * xong ở đây là vào thẳng thực đơn. Chỉ khi thiếu mới rơi về O1.
 */

/**
 * Một khung của băng chuyền hero.
 *
 * Nguồn là bộ ảnh và video xếp ở Office A8, hoặc năm món ký khi bộ đó còn rỗng —
 * hero không cần biết nền từ đâu tới, chỉ cần biết chiếu gì và chú gì dưới góc.
 */
export interface HeroSlide {
  id: string
  /** Chữ lớn của hero: tên món, hoặc chú thích ảnh, hoặc tên quán khi ảnh không có gì để chú */
  nameVi: string
  nameJa: string | null
  /** Chữ vẽ thay ảnh khi chưa có ảnh thật */
  glyph: string
  imageUrl: string | null
  /** Video chiếu đè lên ảnh; null là khung ảnh tĩnh. `imageUrl` là ảnh chờ của nó. */
  videoUrl: string | null
  /**
   * Điểm giữ lại giữa khung khi hero lên điện thoại, dạng `'62% 35%'` — đặt ở A8.
   *
   * Chỉ áp dưới 1024. Trên laptop hero nằm ngang nên ảnh ngang lấp gần vừa khung,
   * cắt không đáng kể; xuống điện thoại khung dựng đứng, cùng tấm ảnh đó bị xén
   * mất hai bên và chủ thể lệch tâm biến mất. `'50% 50%'` là đúng thứ trình duyệt
   * vẫn làm, nên khung chưa ai đặt tâm thì y như cũ.
   */
  mobileFocus: string
}

export interface HeroBranch {
  id: string
  name: string
  address: string | null
  /** Chuỗi giờ như nhân viên gõ ở A10: '11:30–14:00 · 17:00–23:00' */
  openHours: string | null
}

/**
 * Đang mở hay không, suy từ chuỗi giờ của A10.
 *
 * Chuỗi đó là CHỮ TỰ DO nhân viên gõ, không phải lịch có cấu trúc — nên đọc
 * không ra khung giờ nào thì trả `null` và dòng chi nhánh không gắn nhãn gì.
 * Thà không nói còn hơn dán "Đang mở" lên một quán đã đóng cửa.
 */
function dangMo(raw: string | null): boolean | null {
  if (!raw) return null
  const khung = [...raw.matchAll(/(\d{1,2}):(\d{2})\s*[–-]\s*(\d{1,2}):(\d{2})/g)]
  if (khung.length === 0) return null

  const now = new Date()
  const phut = now.getHours() * 60 + now.getMinutes()
  return khung.some((m) => {
    const dau = Number(m[1]) * 60 + Number(m[2])
    const cuoi = Number(m[3]) * 60 + Number(m[4])
    // Khung vắt qua nửa đêm (17:00–02:00): mở là sau giờ đầu HOẶC trước giờ cuối
    return cuoi > dau ? phut >= dau && phut < cuoi : phut >= dau || phut < cuoi
  })
}

/**
 * Bỏ dấu để so khớp: khách gõ "nguyen du" phải ra "Nguyễn Du".
 *
 * `đ` phải xử riêng — nó là một CHỮ CÁI trong bảng chữ cái tiếng Việt chứ không
 * phải `d` đội dấu, nên tách tổ hợp Unicode không đụng được tới nó.
 */
function khongDau(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .trim()
}

/** Đoạn sau dấu phẩy cuối cùng — chỗ khách đang gõ tên phường */
function doanCuoi(s: string): string {
  return (s.split(',').pop() ?? '').trim()
}

const MODES: { id: ReceiveMode; label: string }[] = [
  { id: 'delivery', label: 'Giao tận nơi' },
  { id: 'takeaway', label: 'Đến lấy' },
]

/** Chiếu gì khi API chưa trả món nào — trang vẫn phải dựng được */
const FALLBACK: HeroSlide = {
  id: 'sora',
  nameVi: SITE.name,
  nameJa: SITE.kanji,
  glyph: '空',
  imageUrl: null,
  videoUrl: null,
  mobileFocus: '50% 50%',
}

export function HomeHero({
  slides,
  branches,
  wards,
}: {
  slides: HeroSlide[]
  branches: HeroBranch[]
  wards: SiteWard[]
}) {
  const router = useRouter()
  const [mode, setMode] = useState<ReceiveMode>('delivery')
  /**
   * KHÔNG chọn sẵn chi nhánh nào.
   *
   * Chọn sẵn `branches[0]` thì ô đến lấy mở ra đã ghi sẵn một tên quán — trông như
   * khách đã chọn, mà thật ra chỉ là chi nhánh đầu danh sách. Để rỗng thì ô đọc ra
   * lời mời "Chọn địa chỉ quán", cân với ô địa chỉ của chế độ giao ngay bên cạnh.
   * Chưa chọn mà bấm đi thì O1 hứng: nó tự lấy chi nhánh đầu và bày cả danh sách.
   */
  const [branchId, setBranchId] = useState('')
  const [address, setAddress] = useState('')
  /** Phường khách đã CHỌN từ gợi ý — khác với chữ trong ô, thứ này khớp bảng vùng giao */
  const [ward, setWard] = useState('')
  /** Tấm danh sách chi nhánh đang bung hay không — chỉ dựng khi bung, xem chú ở chỗ dựng */
  const [dangBung, setDangBung] = useState(false)
  const oChon = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState(0)
  /**
   * Độ dài đoạn phim của khung đang chiếu, đọc được lúc video tải xong phần đầu.
   *
   * Kèm `id` của khung chứ không để trần một con số: sang khung khác mà số cũ còn
   * đấy thì một tấm ảnh tĩnh sẽ nằm lại đúng bằng độ dài đoạn phim vừa xem.
   */
  const [videoLen, setVideoLen] = useState<{ id: string; ms: number } | null>(null)

  const shown = slides.length > 0 ? slides : [FALLBACK]
  const current = shown[at] ?? shown[0]!
  const total = shown.length
  const move = (step: number) => setAt((v) => (v + step + total) % total)

  /**
   * Tự sang món sau sau sáu giây — đủ để đọc xong tên món rồi mới đổi.
   *
   * `at` nằm trong danh sách phụ thuộc nên bấm mũi tên là đồng hồ đếm lại từ
   * đầu: khách vừa chủ động chọn thì không bị giật đi sau nửa giây.
   *
   * Chạy cả khi máy khách bật giảm chuyển động — băng chuyền vẫn quay, chỉ là
   * quy tắc trong tokens.css rút hiệu ứng trườn về gần không nên ảnh và chữ đổi
   * ngay thay vì trượt. Nội dung không bị giấu mất của ai.
   *
   * Khung video ở lại đúng độ dài đoạn phim — cắt mọi đoạn phim ở giây thứ sáu
   * thì đưa video lên đây làm gì. Vẫn là ĐỒNG HỒ NÀY đếm, không phải sự kiện
   * "video chạy hết": tab bị trình duyệt ghìm hay mạng đứt giữa chừng là sự kiện
   * đó không bao giờ bắn, và băng chuyền đứng lại vĩnh viễn ở một khung. Chưa đọc
   * được độ dài thì rơi về sáu giây như mọi khung ảnh.
   */
  useEffect(() => {
    if (total < 2) return
    const ms = current.videoUrl && videoLen?.id === current.id ? videoLen.ms : 6000
    const timer = setTimeout(() => setAt((v) => (v + 1) % total), ms)
    return () => clearTimeout(timer)
  }, [total, at, current.id, current.videoUrl, videoLen])

  /* Bấm ra ngoài hoặc Esc thì cụp tấm chi nhánh lại. Nghe ở `pointerdown` chứ
     không `click`: bấm vào một nút khác trên trang thì tấm phải cụp TRƯỚC khi nút
     đó xử lý, không thì khách bấm một lần mà thấy hai việc xảy ra. */
  useEffect(() => {
    if (!dangBung) return
    const raNgoai = (e: PointerEvent) => {
      if (!oChon.current?.contains(e.target as Node)) setDangBung(false)
    }
    const bamPhim = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDangBung(false)
    }
    window.addEventListener('pointerdown', raNgoai)
    window.addEventListener('keydown', bamPhim)
    return () => {
      window.removeEventListener('pointerdown', raNgoai)
      window.removeEventListener('keydown', bamPhim)
    }
  }, [dangBung])

  /**
   * Gợi ý phường khớp đoạn khách đang gõ.
   *
   * Chọn xong thì thôi gợi ý: chữ trong ô lúc đó ĐÚNG BẰNG tên phường vừa chọn,
   * để tấm gợi ý nằm lại thì nó che mất nút "Đặt món ngay" ngay dưới.
   */
  const dangGo = doanCuoi(address)
  const goiY =
    dangGo !== '' && khongDau(dangGo) !== khongDau(ward)
      ? wards.filter((w) => khongDau(w.name).includes(khongDau(dangGo))).slice(0, 6)
      : []

  function doiDiaChi(giaTri: string) {
    setAddress(giaTri)
    // Gõ tiếp sau khi đã chọn thì phường coi như bỏ chọn: giữ lại một giá trị mà
    // chữ trong ô không còn nói tới nữa là gửi sang O1 một cái phường ma.
    if (ward && khongDau(doanCuoi(giaTri)) !== khongDau(ward)) setWard('')
  }

  /**
   * Chọn phường là ĐI LUÔN, không đợi bấm "Đặt món ngay".
   *
   * Chọn xong thì hero hết việc: cách nhận, địa chỉ, phường đã có, và chi nhánh
   * suy ra từ phường. Bắt bấm thêm một nút nữa chỉ để đi tới chỗ chắc chắn phải
   * tới là thêm một bước thừa giữa lúc khách đang muốn xem món.
   */
  function chonPhuong(w: SiteWard) {
    const truoc = address.split(',').slice(0, -1).join(',').trim()
    const diaChi = truoc ? `${truoc}, ${w.name}` : w.name
    setAddress(diaChi)
    setWard(w.name)
    seedOrderDraft({ mode, address: diaChi, ward: w.name, branchId: w.branchId })
    router.push(`/dat-mon/${w.branchId}`)
  }

  /**
   * Đi thẳng vào thực đơn khi hero đã đủ thông tin, bỏ hẳn màn O1.
   *
   * O1 hỏi bốn thứ: chi nhánh, cách nhận, địa chỉ, phường. Hero hỏi xong cả bốn
   * rồi thì đẩy khách qua đó nữa là bắt trả lời lại thứ vừa trả lời.
   *
   * Chọn giao mà đã CHỌN PHƯỜNG từ gợi ý là biết luôn chi nhánh — phường thuộc
   * một vùng giao, vùng giao thuộc một chi nhánh (`branchId` về kèm trong gợi
   * ý). Chọn đến lấy mà đã chọn quán thì cũng vậy.
   *
   * Còn thiếu thì mới về O1: gõ địa chỉ tay không chọn phường nào thì không suy
   * ra được chi nhánh, và đoán bừa một chi nhánh để giao đồ ăn là sai kiểu tệ
   * nhất — khách nhận hàng từ quán cách xa hơn, phí và giờ đều lệch.
   */
  function startOrder() {
    if (mode === 'delivery') {
      /**
       * Chọn phường từ gợi ý là đã đi thẳng vào thực đơn (`chonPhuong`), nên tới
       * được đây nghĩa là khách gõ tay mà không chọn phường nào. Không suy ra
       * được chi nhánh, và đoán bừa một quán để giao đồ ăn là sai kiểu tệ nhất —
       * khách nhận hàng từ quán xa hơn, phí lẫn giờ đều lệch. Để O1 hỏi tiếp.
       *
       * KHÔNG ghi `branchId: ''` cho xong: O1 đọc bằng `??` nên chuỗi rỗng lọt
       * qua chỗ đáng lẽ rơi về chi nhánh đầu, rồi `ready` cho qua vì
       * `'' !== null` còn `onClick` lại chặn vì `''` là falsy — nút "Xem thực
       * đơn" sáng đèn mà bấm không đi đâu cả.
       */
      const diaChi = address.trim()
      seedOrderDraft(diaChi ? { mode, address: diaChi } : { mode })
      router.push('/dat-mon')
      return
    }

    seedOrderDraft(branchId ? { mode, branchId } : { mode })
    router.push(branchId ? `/dat-mon/${branchId}` : '/dat-mon')
  }

  // Hero cao đúng phần màn còn lại sau dải vàng (44) + thanh điều hướng (81) +
  // dải cam kết (72): màn đầu phải chứa trọn cả bốn tầng, thấy hết rồi mới cuộn.
  return (
    <section className="relative flex min-h-[520px] flex-col overflow-hidden md:min-h-[calc(100dvh-200px)]">
      {shown.map((slide, i) => (
        <div
          key={slide.id}
          aria-hidden
          className={`sora-hero-fade absolute inset-0 transition-opacity duration-[var(--dur-reveal)] ease-[var(--ease-sora)] ${
            i === at ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {slide.imageUrl ? (
            /* `<img>` chứ không `next/image`: đường dẫn ảnh do người nhập khai ở
               Office nên không biết trước miền */
            /* Tâm đi qua biến CSS chứ không viết thẳng vào `style`: giá trị là
               của riêng từng khung nên phải nội tuyến, nhưng chỉ được áp dưới
               1024 — mà `style` thì không có điểm gãy. Biến nội tuyến, lớp quyết
               định khổ nào dùng nó. */
            <img
              src={slide.imageUrl}
              alt=""
              style={{ '--tieu-diem': slide.mobileFocus } as CSSProperties}
              className="size-full object-cover [object-position:var(--tieu-diem)] lg:[object-position:50%_50%]"
            />
          ) : (
            <div className="grid size-full place-items-center bg-[radial-gradient(120%_90%_at_74%_36%,var(--sora-line-1)_0%,var(--sora-bg-base)_70%)]">
              <span className="font-jp text-[200px] leading-none text-gold-900 opacity-45 lg:text-[340px]">
                {slide.glyph}
              </span>
            </div>
          )}

          {/* Video chỉ dựng cho khung ĐANG chiếu, và nằm đè lên ảnh của chính
              khung đó. Dựng sẵn cả bộ như với ảnh thì ba đoạn phim cùng tải một
              lúc, mà khách chỉ xem được một. Ảnh ở dưới là thứ hiện trong lúc
              video tải và là thứ ở lại khi khung mờ đi. */}
          {slide.videoUrl && i === at ? (
            <video
              src={slide.videoUrl}
              poster={slide.imageUrl ?? undefined}
              autoPlay
              muted
              playsInline
              /* Lặp khi nó là khung duy nhất — lúc đó không có khung nào để đi
                 tiếp, mà đứng lại ở khung hình cuối thì thành một tấm ảnh. */
              loop={total < 2}
              onLoadedMetadata={(e) => {
                const secs = e.currentTarget.duration
                // Phát trực tiếp trả về Infinity — lúc đó cứ để nhịp sáu giây
                if (Number.isFinite(secs) && secs > 0) {
                  setVideoLen({ id: slide.id, ms: secs * 1000 })
                }
              }}
              style={{ '--tieu-diem': slide.mobileFocus } as CSSProperties}
              className="absolute inset-0 size-full object-cover [object-position:var(--tieu-diem)] lg:[object-position:50%_50%]"
            />
          ) : null}
        </div>
      ))}

      {/* Ba lớp phủ: dọc trang để chữ đọc được trên ảnh sáng, trên và dưới để hero
          nối liền với dải vàng phía trên và khối kế tiếp phía dưới.

          Lớp thứ nhất ĐỔI CHIỀU theo khổ màn. Ở laptop hero nằm ngang, chữ bám mép
          trái và món ăn ở nửa phải, nên phủ chéo 100deg — tối bên trái, chừa món
          bên phải. Ép đúng dải chéo đó vào khung dọc của điện thoại thì nó tối
          đều cả tấm và món ăn chìm nghỉm; mà món ăn mới là thứ bán hàng.

          Nên trên điện thoại phủ theo chiều DỌC. Các mốc bám ĐO ĐẠC chứ không ước
          lượng: tên món chiếm 48–57% chiều cao hero, hai nút 68–79%. Vậy chừa một
          cửa sổ sáng 15–38% cho món ăn, rồi dốc đậm từ 46% — ngay trước dòng chữ
          đầu tiên — và giữ đậm tới đáy. Để nhạt tới quá nửa như bản trước là chữ
          trắng rơi trúng chỗ sáng nhất của ảnh và không đọc nổi. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,10,0.55)_0%,rgba(7,8,10,0.13)_16%,rgba(7,8,10,0.19)_30%,rgba(7,8,10,0.36)_42%,rgba(7,8,10,0.60)_52%,rgba(7,8,10,0.79)_64%,rgba(7,8,10,0.90)_80%,rgba(7,8,10,0.95)_100%)] lg:bg-[linear-gradient(100deg,rgba(7,8,10,0.95)_0%,rgba(7,8,10,0.82)_34%,rgba(7,8,10,0.42)_66%,rgba(7,8,10,0.72)_100%)]"
      />
      {/* Dải hoà vào thanh điều hướng phía trên. 96 trên điện thoại chứ không 176:
          176 là một phần ba chiều cao hero, đủ để nuốt luôn phần trên của tấm ảnh */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-0 h-24 bg-[linear-gradient(180deg,var(--sora-bg-base)_0%,rgba(7,8,10,0)_100%)] lg:h-44"
      />
      <div
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-32 bg-[linear-gradient(180deg,rgba(7,8,10,0)_0%,var(--sora-bg-base)_100%)]"
      />

      {/* ------------------------------------------ Bước đầu của việc đặt món */}
      {/* Cụm chọn cố tình nhỏ và hẹp: nó là bước đầu của việc đặt, không phải nhân
          vật chính của màn — ảnh món mới là thứ phải được nhìn thấy trước */}
      {/* Khung của cụm chọn. Trên điện thoại bó ở 272 chứ không thả theo bề ngang
          màn: ô chi nhánh là `w-full` nên thả ra là nó dài 335 và biến thành một
          thanh trắng vắt ngang hero, nặng hơn cả tên món. Bó lại còn 232 — vẫn
          thừa chỗ cho tên chi nhánh dài nhất, mà ảnh món lấy lại được nền.
          Cặp nút chọn cách nhận không ảnh hưởng vì nó `w-fit mx-auto`. */}
      <div className="relative mx-auto w-full max-w-[272px] px-5 pt-5 sm:max-w-[400px] lg:max-w-[520px] lg:pt-7">
        {/* Đệm 2 chứ không 3: nút 36 + đệm 4 + viền 2 = viên cao 42, ngang tầm ô
            chi nhánh 40 ngay dưới. Đệm 1 thì ra đúng 40 nhưng viên trắng bên trong
            gần như dính vào viền, xấu hơn là được 2 điểm ảnh. */}
        <div className="mx-auto flex w-fit gap-1 rounded-pill border border-ink-hi/12 bg-canvas/70 p-0.5 backdrop-blur-md lg:p-1">
          {MODES.map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setMode(option.id)}
              aria-pressed={mode === option.id}
              /* 36 trên điện thoại, 44 từ laptop. Cộng đệm và viền của viên bọc
                 là 42 — ngang tầm ô chi nhánh 40 ngay dưới, nên hai thứ đọc ra
                 như một bộ. Trước đây viên cao 46, tức cái phụ to hơn cái chính.

                 36 vẫn bấm được thoải mái vì bề NGANG nút hơn trăm điểm ảnh:
                 vùng chạm rộng, chỉ có chiều dọc là hẹp, và 36 vẫn trên ngưỡng
                 24 của WCAG khá xa. Đừng hạ tiếp — dưới 32 thì bắt đầu trượt. */
              className={`h-9 rounded-pill px-3.5 text-[length:var(--fs-c1)] font-semibold transition-colors lg:h-11 lg:px-6 ${
                mode === option.id ? 'bg-ink-hi text-canvas' : 'text-ink-body hover:text-ink-hi'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        <div ref={oChon} className="relative mt-2.5 lg:mt-3">
          {/* Cao ĐÚNG BẰNG ô chứ không `inset-y-0`: khung này còn chứa dòng phí
              giao hiện ra sau khi chọn phường, mà căng theo cả khung thì khung
              cao thêm bao nhiêu ghim tụt xuống một nửa bấy nhiêu — chọn xong là
              ghim rơi khỏi ô. Neo vào chiều cao của ô thì dưới nó mọc thêm gì
              cũng không xê dịch. */}
          <span
            aria-hidden
            className="pointer-events-none absolute top-0 left-3.5 grid h-10 place-items-center text-gold-700 lg:left-4 lg:h-12"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              className="size-3.5 lg:size-4"
            >
              <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" />
              <circle cx="12" cy="10" r="2.8" />
            </svg>
          </span>
          {/* MỘT ô, đổi nội dung theo chế độ — giao thì hỏi địa chỉ, đến lấy thì
              hỏi chi nhánh. Trước đây ô chi nhánh hiện ở cả hai chế độ, tức là
              hỏi khách chọn quán trong lúc họ vừa nói muốn được giao tận nhà.

              Hai nhánh KHÔNG dùng chung `id`: nhãn `sr-only` trỏ vào `htmlFor`
              nào thì phần tử đó phải có mặt, mà mỗi lúc chỉ một trong hai có. */}
          {mode === 'delivery' ? (
            <>
              <label htmlFor="hero-address" className="sr-only">
                Địa chỉ giao
              </label>
              <input
                id="hero-address"
                value={address}
                onChange={(e) => doiDiaChi(e.target.value)}
                placeholder="Số nhà, đường, phường"
                /* Tắt gợi ý của trình duyệt: nó bung một tấm riêng đè lên tấm
                   gợi ý phường bên dưới, hai danh sách chồng nhau. */
                autoComplete="off"
                className="h-10 w-full rounded-pill bg-ink-hi pr-4 pl-9 text-[length:var(--fs-c1)] text-kraft-ink shadow-[0_14px_34px_rgba(0,0,0,0.5)] outline-none placeholder:text-kraft-ink-2 lg:h-12 lg:pr-5 lg:pl-11 lg:text-[length:var(--fs-b2)]"
              />

              {/* ------------------------------------------- Gợi ý phường
                  Nguồn là BẢNG VÙNG GIAO của chính quán, không phải dịch vụ bản
                  đồ nào. Nhờ vậy mỗi dòng hiện ra là một phường chắc chắn giao
                  được, và phí kèm theo là phí thật lấy từ đúng hàng dữ liệu sẽ
                  tính tiền — thứ mà một máy tra địa chỉ ngoài không biết. */}
              {goiY.length > 0 ? (
                <div
                  role="listbox"
                  className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-line-2 bg-canvas shadow-[0_18px_44px_rgba(0,0,0,0.6)]"
                >
                  {goiY.map((w) => (
                    <button
                      key={w.name}
                      type="button"
                      role="option"
                      aria-selected={w.name === ward}
                      onClick={() => chonPhuong(w)}
                      className="block w-full border-b border-line-1 px-4 py-2.5 text-left text-[length:var(--fs-c1)] text-ink-hi transition-colors last:border-b-0 hover:bg-surface-2"
                    >
                      {w.name}
                    </button>
                  ))}
                </div>
              ) : null}

            </>
          ) : (
            <>
              {/* Nút mở tấm chứ không phải `<select>`: mỗi chi nhánh phải nói được
                  ba dòng — tên, địa chỉ, còn mở hay đã đóng — mà `<option>` của
                  trình duyệt chỉ chứa được một dòng chữ trơn. */}
              <button
                type="button"
                onClick={() => setDangBung((v) => !v)}
                disabled={branches.length === 0}
                aria-haspopup="listbox"
                aria-expanded={dangBung}
                /* Chưa chọn thì chữ nhạt đúng bằng chữ mờ của ô địa chỉ bên chế độ
                   giao (`placeholder:text-kraft-ink-2`) — hai chế độ dùng chung một
                   ô, nên lời mời chọn và lời mời gõ phải nặng ngang nhau. Chọn rồi
                   thì đậm lên, vì lúc đó nó là câu trả lời chứ không còn là lời mời. */
                className={`h-10 w-full truncate rounded-pill bg-ink-hi pr-9 pl-9 text-left text-[length:var(--fs-c1)] shadow-[0_14px_34px_rgba(0,0,0,0.5)] outline-none lg:h-12 lg:pr-11 lg:pl-11 lg:text-[length:var(--fs-b2)] ${
                  branchId ? 'text-kraft-ink' : 'text-kraft-ink-2'
                }`}
              >
                {branches.length === 0
                  ? 'Chưa tải được chi nhánh'
                  : (branches.find((b) => b.id === branchId)?.name ?? 'Chọn địa chỉ quán')}
              </button>
              <span
                aria-hidden
                className={`pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-kraft-ink-2 transition-transform lg:right-5 ${
                  dangBung ? 'rotate-180' : ''
                }`}
              >
                <svg
                  viewBox="0 0 14 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  className="h-[7px] w-[10px] lg:h-2 lg:w-3"
                >
                  <path d="m1 1 6 6 6-6" />
                </svg>
              </span>

              {/* Chỉ dựng khi bung — và đó cũng là thứ giữ cho nhãn "Đang mở"
                  không lệch hydrate: nhãn tính theo GIỜ MÁY KHÁCH, mà máy chủ
                  dựng HTML lúc khác thì hai bên ra hai kết quả. Tấm này không bao
                  giờ có mặt trong HTML của máy chủ nên không có gì để lệch. */}
              {dangBung ? (
                <div
                  role="listbox"
                  className="absolute inset-x-0 top-full z-30 mt-2 overflow-hidden rounded-lg border border-line-2 bg-canvas shadow-[0_18px_44px_rgba(0,0,0,0.6)]"
                >
                  {branches.map((branch) => {
                    const mo = dangMo(branch.openHours)
                    const dangChon = branch.id === branchId
                    return (
                      <button
                        key={branch.id}
                        type="button"
                        role="option"
                        aria-selected={dangChon}
                        /* Bấm vào chi nhánh là ĐI LUÔN vào thực đơn của nó, không
                           bắt bấm thêm "Đặt món ngay": chọn quán để đến lấy là câu
                           hỏi CUỐI CÙNG của chế độ này — chi nhánh nào thì thực đơn
                           ấy, không còn gì để khai thêm. Khác chế độ giao, nơi còn
                           phải kiểm vùng giao theo phường trước khi vào thực đơn.

                           Vẫn ghi `branchId` dù sắp rời trang: đi sang trang máy chủ
                           mất một vòng mạng, trong lúc đó ô phải đọc ra tên quán vừa
                           chọn chứ không nằm im ở "Chọn địa chỉ quán". */
                        onClick={() => {
                          setBranchId(branch.id)
                          setDangBung(false)
                          seedOrderDraft({ mode, branchId: branch.id })
                          router.push(`/dat-mon/${branch.id}`)
                        }}
                        className={`block w-full border-b border-line-1 px-4 py-3 text-left last:border-b-0 transition-colors ${
                          dangChon ? 'bg-surface-3' : 'hover:bg-surface-2'
                        }`}
                      >
                        <span className="block text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                          {branch.name}
                        </span>
                        {branch.address ? (
                          <span className="mt-0.5 block text-[length:var(--fs-c1)] leading-relaxed text-ink-body">
                            {branch.address}
                          </span>
                        ) : null}
                        <span className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          {mo !== null ? (
                            <span
                              className={`text-[length:var(--fs-c2)] font-semibold ${
                                mo ? 'text-ok' : 'text-danger'
                              }`}
                            >
                              {mo ? 'Đang mở' : 'Đã đóng'}
                            </span>
                          ) : null}
                          {branch.openHours ? (
                            <span className="font-mono text-[length:var(--fs-c2)] text-ink-mute">
                              {branch.openHours}
                            </span>
                          ) : null}
                        </span>
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* ------------------------------------------------- Tên món và hai nút */}
      <div className="relative mx-auto mt-auto w-full max-w-[1280px] px-5 pt-8 pb-10 lg:px-10 lg:pt-10 lg:pb-12">
        {/* `key` để React dựng lại khối khi sang món khác — có dựng lại thì hiệu
            ứng trườn mới chạy lại. Tên tiếng Nhật vào trễ hơn một nhịp để hai
            dòng nối nhau chứ không ập vào cùng lúc. */}
        <div key={current.id}>
          {/* Ảnh không gian thường không có chú — lúc đó in tên quán, vì trang
              phải luôn có đúng một `h1` và nó không được rỗng */}
          {/* Bóng chữ chứ không tăng độ tối của lớp phủ: ảnh hero có khung lửa
              sáng gần trắng đúng chỗ dòng này rơi vào, mà làm tối cả tấm để cứu
              một khung thì mọi khung còn lại chịu chung. Bóng chỉ bám lấy chữ,
              trên nền tối nó vô hình. */}
          <h1 className="sora-hero-morph max-w-[620px] animate-[sora-hero-in_var(--dur-reveal)_var(--ease-sora)_both] font-display text-[44px] leading-[1.04] font-light text-ink-hi [text-shadow:0_1px_3px_rgba(7,8,10,0.55),0_10px_30px_rgba(7,8,10,0.65)] lg:text-[56px]">
            {current.nameVi || SITE.name}
          </h1>
          {current.nameJa ? (
            <p className="sora-hero-morph mt-2 animate-[sora-hero-in_var(--dur-reveal)_var(--ease-sora)_120ms_both] font-jp text-[length:var(--fs-t2)] tracking-[0.14em] text-accent-ink [text-shadow:0_1px_3px_rgba(7,8,10,0.6)]">
              {current.nameJa}
            </p>
          ) : null}

          {/* Nút NẰM TRONG khối `key={current.id}` chứ không ngoài như trước: có
              nằm trong thì sang món khác React mới dựng lại nó, và hiệu ứng trườn
              mới chạy lại. Để ngoài thì tên món trượt còn nút đứng chết một chỗ.

              240ms là nhịp thứ ba: tên Việt vào ở 0, tên Nhật ở 120, nút ở 240 —
              ba dòng nối đuôi nhau chứ không ập vào cùng lúc.

              `items-start` cũ bỏ được vì chỉ còn một nút và nó `inline-flex`, tự
              co theo chữ, không trải hết bề ngang để chui xuống dưới hai mũi tên
              đang nổi ở góc phải. */}
          <div className="sora-hero-morph mt-6 animate-[sora-hero-in_var(--dur-reveal)_var(--ease-sora)_240ms_both] lg:mt-7">
            <button
              type="button"
              onClick={startOrder}
              /* 48 và đệm 24 trên điện thoại; 56 với đệm 36 là cỡ của laptop */
              className="inline-flex h-12 items-center justify-center rounded-pill bg-accent px-6 text-[length:var(--fs-b1)] font-semibold text-on-accent transition-colors hover:bg-gold-300 lg:h-14 lg:px-9"
            >
              Đặt món ngay
            </button>
          </div>
        </div>
      </div>

      {/* Mũi tên nổi trên ảnh chứ không chiếm một dòng riêng — một dòng nữa là hero
          cao thêm gần trăm điểm ảnh và dải cam kết rơi xuống màn thứ hai */}
      {total > 1 ? (
        <div className="absolute right-5 bottom-8 flex gap-2.5 lg:right-10 lg:bottom-10">
          {[
            { step: -1, label: 'Món trước', path: 'M8 1 1 8l7 7' },
            { step: 1, label: 'Món sau', path: 'm1 1 7 7-7 7' },
          ].map((arrow) => (
            <button
              key={arrow.label}
              type="button"
              onClick={() => move(arrow.step)}
              aria-label={arrow.label}
              /* 40 trên điện thoại: hai mũi tên nổi trên ảnh, chỉ là lối đi phụ —
                 khách vẫn xem hết băng chuyền dù không bấm lần nào */
              className="grid size-10 place-items-center rounded-full border border-ink-hi/30 bg-canvas/30 text-ink-hi backdrop-blur-sm transition-colors hover:border-ink-hi hover:bg-ink-hi/10 lg:size-11"
            >
              <svg
                width="9"
                height="16"
                viewBox="0 0 9 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
              >
                <path d={arrow.path} />
              </svg>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  )
}
