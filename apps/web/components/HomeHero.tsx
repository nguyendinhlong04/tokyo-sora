'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { SITE } from '../content/site'
import { seedOrderDraft, type ReceiveMode } from '../lib/order-draft'

/**
 * Hero W1 — ảnh món chiếu vòng, và ngay trên nó là bước đầu của việc đặt món.
 *
 * Khách vào trang chủ để đặt, nên bước đầu tiên của luồng đặt món — giao hay đến
 * lấy, chi nhánh nào — được kéo lên đây thay vì bắt họ bấm sang màn khác rồi mới
 * chọn. Lựa chọn ghi vào bản nháp đơn (`seedOrderDraft`) nên sang `/dat-mon` là
 * đã chọn sẵn, không phải khai lại.
 *
 * Chỉ chọn tới chi nhánh: địa chỉ giao và phí giao vẫn hỏi ở màn O1, nơi đã có
 * sẵn API vùng giao. Trang marketing không gọi ba API để giữ LCP dưới 2.5s.
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
}

export interface HeroBranch {
  id: string
  name: string
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
}

export function HomeHero({ slides, branches }: { slides: HeroSlide[]; branches: HeroBranch[] }) {
  const router = useRouter()
  const [mode, setMode] = useState<ReceiveMode>('delivery')
  const [branchId, setBranchId] = useState(branches[0]?.id ?? '')
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

  function startOrder() {
    seedOrderDraft(branchId ? { mode, branchId } : { mode })
    // Đến lấy thì đã đủ thông tin để vào thẳng thực đơn của chi nhánh; giao tận
    // nơi thì còn phải nhập địa chỉ và kiểm vùng giao, việc đó của màn O1.
    router.push(mode === 'takeaway' && branchId ? `/dat-mon/${branchId}` : '/dat-mon')
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
            <img src={slide.imageUrl} alt="" className="size-full object-cover" />
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
              className="absolute inset-0 size-full object-cover"
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

        <div className="relative mt-2.5 lg:mt-3">
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-3.5 grid place-items-center text-gold-700 lg:left-4"
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
          <label htmlFor="hero-branch" className="sr-only">
            Chi nhánh
          </label>
          <select
            id="hero-branch"
            value={branchId}
            onChange={(e) => setBranchId(e.target.value)}
            disabled={branches.length === 0}
            className="h-10 w-full appearance-none rounded-pill bg-ink-hi pr-9 pl-9 text-[length:var(--fs-c1)] text-kraft-ink shadow-[0_14px_34px_rgba(0,0,0,0.5)] outline-none lg:h-12 lg:pr-11 lg:pl-11 lg:text-[length:var(--fs-b2)]"
          >
            {branches.length === 0 ? <option value="">Chưa tải được chi nhánh</option> : null}
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
          <span
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-4 grid place-items-center text-kraft-ink-2 lg:right-5"
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
          <h1 className="sora-hero-morph max-w-[620px] animate-[sora-hero-in_var(--dur-reveal)_var(--ease-sora)_both] font-display text-[44px] leading-[1.04] font-light text-ink-hi lg:text-[56px]">
            {current.nameVi || SITE.name}
          </h1>
          {current.nameJa ? (
            <p className="sora-hero-morph mt-2 animate-[sora-hero-in_var(--dur-reveal)_var(--ease-sora)_120ms_both] font-jp text-[length:var(--fs-t2)] tracking-[0.14em] text-accent-ink">
              {current.nameJa}
            </p>
          ) : null}
        </div>

        {/* Hai hành động ngang hàng — đúng nguyên tắc §19, chỉ đổi sang dáng viên */}
        {/* `items-start` để nút co theo chữ: trên điện thoại nút trải hết bề ngang
            sẽ chui xuống dưới hai mũi tên đang nổi ở góc phải */}
        <div className="mt-6 flex flex-col items-start gap-3 sm:flex-row lg:mt-7">
          <button
            type="button"
            onClick={startOrder}
            className="inline-flex h-14 items-center justify-center rounded-pill bg-accent px-9 text-[length:var(--fs-b1)] font-semibold text-on-accent transition-colors hover:bg-gold-300"
          >
            Đặt món ngay
          </button>
          <Link
            href="/dat-ban"
            className="inline-flex h-14 items-center justify-center rounded-pill border border-ink-hi/40 px-9 text-[length:var(--fs-b1)] font-medium text-ink-hi transition-colors hover:border-ink-hi hover:bg-ink-hi/8"
          >
            Đặt bàn
          </Link>
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
              className="grid size-11 place-items-center rounded-full border border-ink-hi/30 bg-canvas/30 text-ink-hi backdrop-blur-sm transition-colors hover:border-ink-hi hover:bg-ink-hi/10"
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
