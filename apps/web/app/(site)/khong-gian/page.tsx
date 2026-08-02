import type { Metadata } from 'next'
import Link from 'next/link'
import { PhotoFrame } from '../../../components/visuals'
import { BRANCH_EXTRAS } from '../../../content/site'
import { getBranches } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'Không gian & chi nhánh',
  description:
    'Ba chi nhánh Tokyo Sora: khu bếp than tại bàn, phòng riêng, giờ mở cửa và bản đồ từng nơi.',
  alternates: { canonical: '/khong-gian' },
}

/**
 * W5 — Không gian & chi nhánh.
 *
 * Địa chỉ, giờ mở, số bàn đọc thẳng từ hệ thống: sửa ở A10 hoặc vẽ lại sơ đồ bàn
 * ở A3 là trang này đổi theo, không ai phải nhớ sửa hai chỗ.
 */
export default async function SpacesPage() {
  const branches = await getBranches()

  return (
    <>
      <section className="mx-auto max-w-[1280px] px-5 pt-16 lg:px-10 lg:pt-24">
        <span className="font-jp text-[length:var(--fs-b1)] tracking-[0.3em] text-accent">店舗</span>
        <h1 className="mt-5 font-display text-[38px] font-light text-ink-hi lg:text-[length:var(--fs-d1)]">
          Không gian
        </h1>
        <p className="mt-5 max-w-[460px] text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
          Ba chi nhánh, ba kiểu khói. Chọn chỗ trước khi chọn món.
        </p>
      </section>

      <div className="mx-auto max-w-[1280px] px-5 pt-12 pb-20 lg:px-10 lg:pt-20 lg:pb-32">
        {branches.map((branch, index) => {
          const extra = BRANCH_EXTRAS[branch.id]
          return (
            <section
              key={branch.id}
              id={branch.id}
              className={`scroll-mt-28 ${
                index < branches.length - 1
                  ? 'mb-14 border-b border-accent/16 pb-14 lg:mb-24 lg:pb-24'
                  : ''
              }`}
            >
              <div className="grid auto-rows-[110px] grid-cols-2 gap-2.5 lg:auto-rows-[132px] lg:grid-cols-4 lg:gap-3">
                <PhotoFrame
                  glyph={extra?.kanji}
                  className="col-span-2 row-span-2 lg:col-span-2 lg:row-span-2"
                />
                <PhotoFrame glyph="炭" />
                <PhotoFrame glyph="間" />
                <PhotoFrame glyph="盃" className="hidden lg:block" />
                <PhotoFrame glyph="夜" className="hidden lg:block" />
              </div>

              <div className="mt-8 grid items-start gap-8 lg:mt-12 lg:grid-cols-[1fr_1fr_320px] lg:gap-16">
                <div>
                  <h2 className="font-display text-[30px] font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
                    {branch.name}
                  </h2>
                  <p className="mt-4 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
                    {branch.address}
                  </p>

                  <div className="mt-6 flex flex-wrap gap-2">
                    {(extra?.highlights ?? branch.areas).map((zone) => (
                      <span
                        key={zone}
                        className="inline-flex h-7.5 items-center rounded-pill border border-accent px-3 text-[length:var(--fs-c1)] text-accent-ink"
                      >
                        {zone}
                      </span>
                    ))}
                  </div>

                  <dl className="mt-8 grid grid-cols-[auto_1fr] gap-x-6 gap-y-3 text-[length:var(--fs-b2)]">
                    <dt className="text-ink-mute">Giờ mở</dt>
                    <dd className="m-0 font-mono text-ink-hi">{branch.openHours ?? '—'}</dd>
                    <dt className="text-ink-mute">Số bàn</dt>
                    <dd className="m-0 text-ink-hi">
                      {branch.seats.total} bàn · {branch.seats.grill} bàn có bếp
                      {branch.seats.private > 0 ? ` · ${branch.seats.private} phòng riêng` : ''}
                    </dd>
                    <dt className="text-ink-mute">Điện thoại</dt>
                    <dd className="m-0 font-mono text-ink-hi">
                      {branch.phone ? (
                        <a href={`tel:${branch.phone.replace(/\s/g, '')}`}>{branch.phone}</a>
                      ) : (
                        '—'
                      )}
                    </dd>
                  </dl>

                  <Link
                    href={`/dat-ban?chi-nhanh=${branch.id}`}
                    className="mt-9 inline-flex h-13 items-center rounded-sm border border-accent px-7 text-[length:var(--fs-b1)] font-medium text-accent-ink transition-colors hover:border-gold-300 hover:text-gold-200"
                  >
                    Đặt bàn tại đây
                  </Link>
                </div>

                <PhotoFrame glyph="地図" className="h-[220px] lg:h-[280px]" />

                <div className="hidden text-right font-jp text-[96px] leading-none text-gold-900 opacity-50 lg:block">
                  {extra?.kanji}
                </div>
              </div>
            </section>
          )
        })}
      </div>

      {/* Mỗi chi nhánh là một thực thể Restaurant riêng — nền cho local SEO (§23.1.5) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify(
            branches.map((branch) => ({
              '@context': 'https://schema.org',
              '@type': 'Restaurant',
              name: `Tokyo Sora ${branch.name}`,
              servesCuisine: 'Nhật Bản · Yakiniku',
              address: { '@type': 'PostalAddress', streetAddress: branch.address },
              telephone: branch.phone ?? undefined,
              openingHours: branch.openHours ?? undefined,
              potentialAction: [
                { '@type': 'ReserveAction', target: `/dat-ban?chi-nhanh=${branch.id}` },
                { '@type': 'OrderAction', target: `/dat-mon/${branch.id}` },
              ],
            })),
          ),
        }}
      />
    </>
  )
}
