import { formatVnd } from '@sora/contracts'
import type { Metadata } from 'next'
import Link from 'next/link'
import { DishGlyph } from '../../../components/visuals'
import { OFFERS } from '../../../content/site'
import { dishGlyph, getMenu } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'Ưu đãi & Set',
  description:
    'Set phần của Tokyo Sora và các ưu đãi đang chạy: giờ vàng, sinh nhật trong tuần, tích hoá đơn.',
  alternates: { canonical: '/uu-dai' },
}

/**
 * W7 — Ưu đãi & Set.
 *
 * Set lấy từ danh mục chứ không gõ tay vào trang: giá set là giá bán thật, đổi ở
 * Office thì đổi ở đây. Set mới chỉ cần khai ở M1 là tự hiện ra.
 */
export default async function OffersPage() {
  const menu = await getMenu()
  const sets = menu.dishes.filter((d) => d.kind === 'set')

  return (
    <>
      <section className="mx-auto max-w-[1280px] px-5 pt-16 lg:px-10 lg:pt-24">
        <span className="font-jp text-[length:var(--fs-b1)] tracking-[0.3em] text-accent">御膳</span>
        <h1 className="mt-5 font-display text-[38px] font-light text-ink-hi lg:text-[length:var(--fs-d1)]">
          Ưu đãi &amp; Set
        </h1>
        <p className="mt-5 max-w-[520px] text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
          Set là cách nhanh nhất để ăn đúng thứ tự. Bếp đã chọn phần thịt và lượng cho bạn.
        </p>
      </section>

      <section className="mx-auto max-w-[1280px] px-5 pt-10 lg:px-10 lg:pt-16">
        <div className="grid gap-5 lg:grid-cols-3 lg:gap-6">
          {OFFERS.map((offer) => (
            <div
              key={offer.title}
              className="rounded-lg border border-accent/16 bg-surface-2 p-7"
            >
              <span className="font-jp text-[30px] leading-none text-gold-900">{offer.kanji}</span>
              <p className="mt-5 text-[length:var(--fs-t2)] leading-snug font-semibold text-ink-hi">
                {offer.title}
              </p>
              <p className="mt-3 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
                {offer.desc}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-5 pt-16 pb-20 lg:px-10 lg:pt-24 lg:pb-32">
        <div className="pb-10 text-center lg:pb-14">
          <h2 className="font-display text-[30px] font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
            {sets.length === 6 ? 'Sáu set' : `${sets.length} set của bếp`}
          </h2>
          <p className="mt-3.5 font-jp text-[length:var(--fs-b1)] tracking-[0.2em] text-ink-mute">
            — 膳 —
          </p>
        </div>

        <div className="grid gap-6 lg:grid-cols-3 lg:gap-8">
          {sets.map((set) => {
            const story = set.story
            return (
              <article
                key={set.id}
                className="flex flex-col overflow-hidden rounded-lg border border-accent/16 bg-surface-2"
              >
                <DishGlyph glyph={dishGlyph(set)} src={set.imageUrl} alt={set.nameVi} className="aspect-[4/3] w-full" />
                <div className="flex flex-1 flex-col p-7">
                  <h3 className="font-display text-[26px] font-light text-ink-hi lg:text-[length:var(--fs-d3)]">
                    {set.nameVi}
                  </h3>
                  {set.nameJa ? (
                    <p className="mt-2 font-jp text-[length:var(--fs-b2)] tracking-[0.12em] text-accent-ink">
                      {set.nameJa}
                    </p>
                  ) : null}
                  {story?.serves || story?.duration ? (
                    <p className="mt-4 text-[length:var(--fs-b2)] text-ink-mute">
                      {[story.serves ? `Dành cho ${story.serves}` : null, story.duration]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  ) : null}
                  <p className="mt-3.5 flex-1 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
                    {set.shortDesc ?? story?.intro}
                  </p>
                  <div className="mt-6 flex items-baseline justify-between gap-4 border-t border-line-1 pt-5">
                    <span className="font-mono text-[length:var(--fs-t2)] text-accent-ink lg:text-[length:var(--fs-t1)]">
                      {formatVnd(set.price)}
                    </span>
                    <div className="flex flex-none gap-2">
                      <Link
                        href={`/thuc-don/${set.id}`}
                        className="inline-flex h-11 items-center rounded-md border border-line-3 px-4 text-[length:var(--fs-b2)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi"
                      >
                        Xem set
                      </Link>
                      <Link
                        href="/dat-ban"
                        className="inline-flex h-11 items-center rounded-md bg-accent-strong px-4 text-[length:var(--fs-b2)] font-semibold text-on-accent transition-colors hover:bg-accent"
                      >
                        Đặt set này
                      </Link>
                    </div>
                  </div>
                </div>
              </article>
            )
          })}
        </div>

        <p className="mt-12 max-w-[640px] text-[length:var(--fs-b2)] leading-relaxed text-ink-mute">
          Set không đổi món lẻ. Nếu bạn muốn thay, gọi riêng từng món từ thực đơn sẽ hợp hơn.
        </p>
      </section>
    </>
  )
}
