import type { SiteHeroFrame } from '@sora/contracts'
import { OptimizedImage, optimizedSrc } from '@sora/ui/image'
import { useQuery } from '@tanstack/react-query'
import { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { IconArrowRight } from '../icons'
import { useWarmMenuImages } from '../image-cache'
import { clock } from '../order-status'
import { useApplyUpdateWhenIdle } from '../pwa'
import { useTable } from '../table-context'

/** Mỗi khung ảnh đứng bảy giây (§9.1b: 6–8 s) — đủ đọc xong dòng chữ lớn rồi mới đổi */
const FRAME_MS = 7_000

/** Hỏi lại bộ khung và bản phần mềm — màn chờ đứng cả buổi chiều không ai chạm */
const REFRESH_MS = 10 * 60_000

/** iPad 1080 điểm ảnh CSS, màn mật độ 2× — tấm 1920 đủ nét cho nền tràn màn */
const BACKDROP_WIDTHS = [1080, 1920] as const

interface Slide {
  id: string
  title: string
  titleJa: string | null
  imageUrl: string | null
  videoUrl: string | null
}

/** Tấm chữ của quán — khi chưa có khung nào lẫn món ký nào có ảnh */
const BRAND: Slide = {
  id: 'sora',
  title: 'Tokyo Sora',
  titleJa: '東京空',
  imageUrl: null,
  videoUrl: null,
}

/**
 * §9.1b Màn chờ quảng cáo — iPad của bàn CHƯA mở.
 *
 * Chiếu vòng các khung marketing bật cho iPad ở Office A8, cùng ngôn ngữ với hero
 * trang chủ: ảnh hoặc video tràn màn, chữ lớn Cormorant, chữ Nhật nhạt bên dưới,
 * chữ 空 chìm. Chưa bật khung nào thì chiếu món ký của bếp như trang chủ vẫn làm —
 * màn chờ không bao giờ trống vì marketing chưa kịp nhập.
 *
 * Chạm chỗ nào cũng được là sang hộp mở bàn: một màn đặt giữa bàn ăn không nên bắt
 * khách đi tìm đúng cái nút. Nút vàng ở góc chỉ để nói là chạm được.
 *
 * Chỉ dựng ảnh của khung trước, đang chiếu và kế tiếp: A10 3 GB giải mã cả bộ nền
 * 1920 điểm ảnh một lúc là đuối. Video chỉ dựng cho khung đang chiếu.
 *
 * Bàn trống cũng là lúc duy nhất máy được làm việc nặng: áp bản phần mềm mới (§9.1)
 * và tải sẵn ảnh thực đơn vào bộ đệm (§8 quy tắc 5).
 */
export function IpadIdle({ onWake }: { onWake: () => void }) {
  const { terminal } = useTable()
  const slides = useSlides()
  const [at, setAt] = useState(0)
  /** Độ dài phim của khung đang chiếu — kèm `id` để khung ảnh sau không đứng theo số cũ */
  const [videoLen, setVideoLen] = useState<{ id: string; ms: number } | null>(null)
  /** Phim hỏng thì khung đó chiếu ảnh như khung tĩnh, không đứng màn đen */
  const [brokenVideos, setBrokenVideos] = useState<ReadonlySet<string>>(() => new Set())
  useApplyUpdateWhenIdle(REFRESH_MS)
  useWarmMenuImages(terminal?.branchId)

  const total = slides.length
  // Bộ khung có thể ngắn lại sau một lần hỏi lại — không để chỉ số trỏ ra ngoài
  const index = at % total
  const current = slides[index]!

  useEffect(() => {
    if (total < 2) return
    const playing = current.videoUrl && !brokenVideos.has(current.id)
    const ms = playing && videoLen?.id === current.id ? videoLen.ms : FRAME_MS
    const timer = setTimeout(() => setAt((v) => (v + 1) % total), ms)
    return () => clearTimeout(timer)
  }, [total, index, current.id, current.videoUrl, videoLen, brokenVideos])

  const near = (i: number) =>
    i === index || i === (index + 1) % total || i === (index - 1 + total) % total
  const table = terminal?.table
  const reservedAt = terminal?.reservedAt ?? null

  return (
    <button
      type="button"
      aria-label={reservedAt ? 'Bàn đã có khách đặt — chạm để xem' : 'Chạm để bắt đầu gọi món'}
      onClick={onWake}
      className="fixed inset-0 z-[120] block overflow-hidden bg-canvas text-left font-sans"
    >
      {slides.map((slide, i) =>
        near(i) ? (
          <span
            key={slide.id}
            aria-hidden
            className={[
              'absolute inset-0 block transition-opacity duration-[var(--dur-reveal)] ease-[var(--ease-sora)]',
              i === index ? 'opacity-100' : 'opacity-0',
            ].join(' ')}
          >
            {slide.imageUrl ? (
              <OptimizedImage
                src={slide.imageUrl}
                widths={[...BACKDROP_WIDTHS]}
                sizes="100vw"
                alt=""
                eager
                className="size-full object-cover"
              />
            ) : (
              <span className="grid size-full place-items-center bg-[radial-gradient(120%_90%_at_74%_36%,var(--sora-line-1)_0%,var(--sora-bg-base)_70%)]">
                <span className="font-jp text-[340px] leading-none text-gold-900 opacity-45">
                  空
                </span>
              </span>
            )}

            {slide.videoUrl && i === index && !brokenVideos.has(slide.id) ? (
              <video
                src={slide.videoUrl}
                // Ảnh chờ cũng phải là bản đã tối ưu, không thì kéo lại đúng tấm PNG gốc
                poster={slide.imageUrl ? optimizedSrc(slide.imageUrl, 1080) : undefined}
                autoPlay
                muted
                playsInline
                // Khung duy nhất thì lặp — không có khung nào để đi tiếp
                loop={total < 2}
                onLoadedMetadata={(e) => {
                  const secs = e.currentTarget.duration
                  if (Number.isFinite(secs) && secs > 0) {
                    setVideoLen({ id: slide.id, ms: secs * 1000 })
                  }
                }}
                onError={() => setBrokenVideos((s) => new Set(s).add(slide.id))}
                className="absolute inset-0 size-full object-cover"
              />
            ) : null}
          </span>
        ) : null,
      )}

      {/* Phủ tối bên trái và dưới đáy cho chữ, chừa nửa phải cho món ăn — như hero
          trang chủ ở khổ ngang; dải trên giữ chữ quán đọc được trên ảnh sáng */}
      <span
        aria-hidden
        className="absolute inset-0 bg-linear-to-r from-canvas/90 via-canvas/40 to-canvas/5"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 bottom-0 h-2/3 bg-linear-to-t from-canvas/95 via-canvas/50 to-transparent"
      />
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-36 bg-linear-to-b from-canvas/70 to-transparent"
      />
      {/* Chữ chìm chỉ trên khung có ảnh — tấm chữ của quán đã có chữ 空 lớn của nó */}
      {current.imageUrl ? (
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-[-48px] -translate-y-1/2 font-jp text-[520px] leading-none text-accent opacity-5"
        >
          空
        </span>
      ) : null}

      <span className="absolute top-[calc(1.75rem+env(safe-area-inset-top))] left-12 flex items-baseline gap-3">
        <span className="font-jp text-[length:var(--fs-b2)] text-gold-300">東京空</span>
        <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.2em] text-ink-hi">
          TOKYO SORA
        </span>
      </span>

      {/* `key` để chữ dựng lại theo khung — có dựng lại thì hiệu ứng trườn mới chạy */}
      <span
        key={current.id}
        className="absolute bottom-[calc(3rem+env(safe-area-inset-bottom))] left-12 block max-w-[540px]"
      >
        <span className="block animate-[sora-rise_var(--dur-reveal)_var(--ease-sora)_both] font-display text-[length:var(--fs-d1)] leading-[1.04] font-light text-ink-hi">
          {current.title}
        </span>
        {current.titleJa ? (
          <span className="mt-3 block animate-[sora-rise_var(--dur-reveal)_var(--ease-sora)_120ms_both] font-jp text-[length:var(--fs-t2)] tracking-[0.14em] text-accent-ink">
            {current.titleJa}
          </span>
        ) : null}
        {total > 1 ? (
          <span aria-hidden className="mt-7 flex gap-1.5">
            {slides.map((slide, i) => (
              <span
                key={slide.id}
                className={[
                  'h-0.5 w-7 rounded-pill',
                  i === index ? 'bg-ink-hi' : 'bg-ink-hi/25',
                ].join(' ')}
              />
            ))}
          </span>
        ) : null}
      </span>

      <span className="absolute right-12 bottom-[calc(3rem+env(safe-area-inset-bottom))] flex flex-col items-end gap-3.5">
        {table ? (
          <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.14em] text-ink-body uppercase">
            {['Bàn ' + table.code, table.area].filter(Boolean).join(' · ')}
          </span>
        ) : null}
        {reservedAt ? (
          // Bàn giữ cho khách đặt: không mời "bắt đầu gọi món" để rồi chặn ngay sau đó
          <span className="inline-flex h-14 items-center rounded-pill border border-line-3 bg-canvas/70 px-7 text-[length:var(--fs-b1)] text-ink-hi">
            Bàn đã có khách đặt lúc&nbsp;<span className="font-mono">{clock(reservedAt)}</span>
          </span>
        ) : (
          <span className="relative inline-flex h-14 items-center gap-2.5 rounded-pill bg-accent-strong px-7 text-[length:var(--fs-b1)] font-semibold text-on-accent">
            <span
              aria-hidden
              className="absolute -inset-1.5 rounded-pill border border-accent/45 animate-[sora-pulse_2.4s_var(--ease-sora)_infinite]"
            />
            Chạm để bắt đầu gọi món
            <IconArrowRight size={18} stroke={1.8} />
          </span>
        )}
      </span>
    </button>
  )
}

/**
 * Bộ khung để chiếu: khung bật cho iPad ở A8, không có thì món ký của bếp như hero
 * trang chủ (món chưa có ảnh không vào — trên nền tràn màn một chữ to thay ảnh đã
 * có tấm chữ của quán lo), không có cả hai thì tấm chữ của quán.
 */
function useSlides(): Slide[] {
  const frames = useQuery({
    queryKey: ['idle-frames'],
    queryFn: () => api.idleFrames(),
    staleTime: REFRESH_MS,
    refetchInterval: REFRESH_MS,
  })
  const noFrames = frames.data !== undefined && frames.data.length === 0
  const site = useQuery({
    // Cùng khoá với "Bí quyết thưởng thức" — một lượt tải cho cả hai
    queryKey: ['site-menu'],
    queryFn: () => api.siteMenu(),
    staleTime: 30 * 60_000,
    enabled: noFrames,
  })

  return useMemo(() => {
    if (frames.data && frames.data.length > 0) return frames.data.map(fromFrame)
    const signatures = (site.data?.dishes ?? [])
      .filter((d) => d.signature && d.kind !== 'set' && d.imageUrl)
      .slice(0, 5)
      .map<Slide>((d) => ({
        id: `mon-${d.id}`,
        title: d.nameVi,
        titleJa: d.nameJa,
        imageUrl: d.imageUrl,
        videoUrl: null,
      }))
    return signatures.length > 0 ? signatures : [BRAND]
  }, [frames.data, site.data])
}

/** Như hero trang chủ: khung không chú thích thì nói tên quán, không để chữ lớn trống */
function fromFrame(frame: SiteHeroFrame): Slide {
  return {
    id: `khung-${frame.id}`,
    title: frame.caption ?? BRAND.title,
    titleJa: frame.caption ? frame.captionJa : BRAND.titleJa,
    imageUrl: frame.imageUrl,
    videoUrl: frame.videoUrl,
  }
}
