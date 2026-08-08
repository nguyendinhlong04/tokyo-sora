import { formatVnd } from '@sora/contracts'
import type { Metadata } from 'next'
import Link from 'next/link'
import { AddDishButton, QuickAddProvider } from '../../../components/QuickAdd'
import { DishGlyph, Diamond, PhotoFrame, SignatureBadge } from '../../../components/visuals'
import { CATEGORY_NOTES, ORDER_ADVICE, SITE } from '../../../content/site'
import { dishGlyph, getMenu, groupByCategory, splitSubGroups } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'Thực đơn',
  description:
    'Toàn bộ thực đơn Tokyo Sora: bò nướng than hoa, hải sản, set phần, đồ uống Nhật — giá cập nhật trực tiếp từ hệ thống nhà hàng.',
  alternates: { canonical: '/thuc-don' },
}

/**
 * W2 — Thực đơn.
 *
 * Toàn bộ món lấy cùng nguồn dữ liệu hệ thống: sửa giá ở Office là trang này đổi
 * theo trong vòng một phút, không có bước đồng bộ tay (§18.1).
 */
export default async function MenuPage() {
  const menu = await getMenu()
  const groups = groupByCategory(menu)
  const signatureCount = menu.dishes.filter((d) => d.signature).length

  return (
    <QuickAddProvider>
      {/* ------------------------------------------------- Poster đầu trang */}
      <section className="mx-auto max-w-[1280px] px-5 pt-10 lg:px-10 lg:pt-14">
        <div className="grid border border-accent/30 bg-canvas lg:grid-cols-[380px_1fr]">
          <div className="flex min-w-0 flex-col border-accent/18 lg:border-r">
            <div className="p-6 pb-5 lg:p-7">
              <p className="font-display text-[26px] font-semibold tracking-[0.06em] text-ink-hi lg:text-[30px]">
                TOKYO SORA
              </p>
              <div className="mt-2.5 flex items-center gap-3">
                <span className="text-[10px] font-semibold tracking-[0.2em] text-accent">
                  YAKINIKU · RAMEN · IZAKAYA
                </span>
                <span className="ml-auto grid size-8 flex-none place-items-center border border-danger-line text-center font-jp text-[10px] leading-tight text-danger">
                  美味
                </span>
              </div>
            </div>
            <div className="relative min-h-[220px] flex-1 border-t border-accent/16 lg:min-h-[280px]">
              <PhotoFrame rounded={false} className="absolute inset-0" />
              <span className="pointer-events-none absolute top-5 left-6 font-jp text-[30px] tracking-[0.18em] text-ink-hi [writing-mode:vertical-rl]">
                御献立
              </span>
            </div>
          </div>

          <div className="grid min-w-0 content-center gap-6 p-6 lg:px-11 lg:py-9">
            <div>
              <h1 className="font-display text-[42px] leading-none font-semibold tracking-[0.04em] text-gold-200 uppercase lg:text-[64px]">
                Thực đơn
              </h1>
              <p className="mt-3.5 font-jp text-[length:var(--fs-t2)] tracking-[0.14em] text-accent-ink lg:text-[length:var(--fs-t1)]">
                お品書き — {SITE.kanji}
              </p>
            </div>
            <div className="h-px bg-[linear-gradient(90deg,rgba(201,168,92,0.5)_0%,rgba(201,168,92,0.08)_100%)]" />
            <p className="max-w-[620px] text-[length:var(--fs-b1)] leading-[1.85] text-ink-body">
              Mười chương, đọc từ trên xuống là một bữa hoàn chỉnh: khai vị lạnh — thịt nướng trên
              than trắng — món nóng xen giữa — nước dùng chốt bữa — đồ ngọt lạnh. Giá đã gồm phục
              vụ, chưa gồm thuế; thực đơn đổi theo mùa và theo chi nhánh.
            </p>
            <dl className="flex flex-wrap gap-8">
              {[
                { n: menu.dishes.length, label: 'Món trong thực đơn' },
                { n: signatureCount, label: 'Món ký của bếp' },
                { n: groups.length, label: 'Chương' },
              ].map((stat) => (
                <div key={stat.label}>
                  <dd className="font-display text-[26px] font-semibold text-accent-ink lg:text-[30px]">
                    {stat.n}
                  </dd>
                  <dt className="mt-1.5 text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
                    {stat.label}
                  </dt>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>

      {/* ------------------------------------------------ Thanh chương dính
          Dừng dưới cả dải vàng (32 · 40 · 44) lẫn thanh điều hướng (64 · 64 · 80)
          — hai thanh đó đều dính, nên 96 · 104 · 124 mới là mép dưới phần đã ghim */}
      <nav className="sticky top-24 z-40 mt-8 border-y border-accent/22 bg-canvas/94 backdrop-blur-md sm:top-26 lg:top-31 lg:mt-10">
        <div className="mx-auto flex max-w-[1280px] gap-1.5 overflow-x-auto px-5 py-3 lg:h-[70px] lg:items-center lg:px-10 lg:py-0">
          {groups.map((group) => (
            <a
              key={group.id}
              href={`#chuong-${group.id}`}
              className="inline-flex h-11 flex-none items-center gap-2.5 border border-accent/20 px-4 whitespace-nowrap text-ink-mute transition-colors hover:border-accent hover:text-gold-200"
            >
              {group.kanji ? <span className="font-jp text-[length:var(--fs-b1)]">{group.kanji}</span> : null}
              <span className="text-[length:var(--fs-c1)] font-medium tracking-[0.04em]">
                {group.nameVi}
              </span>
            </a>
          ))}
        </div>
      </nav>

      {/* ---------------------------------------------------- Từng chương */}
      <div className="mx-auto max-w-[1280px] px-5 pt-12 lg:px-10 lg:pt-16">
        {groups.map((group, index) => (
          <section
            key={group.id}
            id={`chuong-${group.id}`}
            className="scroll-mt-32 pb-14 lg:scroll-mt-44 lg:pb-18"
          >
            <header className="flex items-start gap-5 border-b border-accent/24 pb-6 lg:gap-6 lg:pb-7">
              <div className="mt-1 hidden lg:mx-2 lg:block">
                <Diamond>{String(index + 1).padStart(2, '0')}</Diamond>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-baseline gap-4 lg:gap-[18px]">
                  <h2 className="font-display text-[30px] leading-tight font-semibold tracking-[0.04em] text-gold-200 uppercase lg:text-[40px]">
                    {group.nameVi}
                  </h2>
                  {group.kanji ? (
                    <span className="font-jp text-[length:var(--fs-t1)] tracking-[0.14em] text-accent-ink">
                      {group.kanji}
                    </span>
                  ) : null}
                  <span className="ml-auto font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {group.dishes.length} món
                  </span>
                </div>
                {CATEGORY_NOTES[group.id] ? (
                  <p className="mt-3 max-w-[720px] text-[length:var(--fs-b1)] leading-relaxed text-ink-mute">
                    {CATEGORY_NOTES[group.id]}
                  </p>
                ) : null}
              </div>
            </header>

            {splitSubGroups(group.dishes).map((sub) => (
              <div key={sub.key} className="pt-8">
                {sub.label ? (
                  <div className="flex items-center gap-3 pb-5">
                    <span className="font-jp text-[length:var(--fs-b2)] text-accent">✿</span>
                    <span className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.14em] text-gold-200 uppercase">
                      {sub.label.name}
                    </span>
                    <span className="font-jp text-[length:var(--fs-t2)] tracking-[0.12em] text-ink-mute">
                      {sub.label.kanji}
                    </span>
                    <span className="h-px flex-1 bg-[linear-gradient(90deg,rgba(201,168,92,0.3)_0%,rgba(201,168,92,0.05)_100%)]" />
                  </div>
                ) : null}

                <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4 lg:gap-[18px]">
                  {sub.dishes.map((dish) => (
                    /* Thẻ ngoài là `div` chứ không còn là liên kết: nút cộng phải
                       đứng NGOÀI thẻ `a` — nút lồng trong liên kết là HTML sai và
                       bấm cộng sẽ nhảy sang trang món. */
                    <div
                      key={dish.id}
                      className="relative flex min-w-0 flex-col border border-accent/22 bg-surface-1 transition-colors hover:border-accent hover:bg-surface-3"
                    >
                      <Link href={`/thuc-don/${dish.id}`} className="flex min-w-0 flex-1 flex-col">
                        <div className="relative aspect-[4/3]">
                          <DishGlyph glyph={dishGlyph(dish)} src={dish.imageUrl} alt={dish.nameVi} className="size-full" />
                          {dish.signature ? (
                            <span className="absolute top-2.5 right-2.5">
                              <SignatureBadge compact />
                            </span>
                          ) : null}
                        </div>
                        <div className="flex min-w-0 flex-1 flex-col gap-2.5 p-4">
                          <p className="font-display text-[length:var(--fs-t2)] leading-tight font-semibold tracking-[0.03em] text-gold-200 uppercase">
                            {dish.nameVi}
                          </p>
                          {dish.nameJa ? (
                            <p className="font-jp text-[length:var(--fs-c1)] tracking-[0.1em] text-ink-mute">
                              {dish.nameJa}
                            </p>
                          ) : null}
                          {/* `pr-11` chừa đúng chỗ nút cộng ghim ở góc phải dưới:
                              giá là dòng cuối của ô, không nới lề phải thì món
                              tiền triệu chui một nửa xuống dưới nút. */}
                          <p className="mt-auto pr-11 font-mono text-[length:var(--fs-b1)] text-accent-ink">
                            {formatVnd(dish.price)}
                          </p>
                        </div>
                      </Link>
                      {/* Món không bán online thì không có nút: bấm cộng rồi tới
                          O2 mới biết không đặt được là hứa suông. */}
                      {dish.onlineVisible ? (
                        <AddDishButton dish={dish} className="absolute right-3 bottom-3" />
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </section>
        ))}
      </div>

      {/* ---------------------------------------------- Panel kraft cuối trang */}
      <section className="mx-auto max-w-[1280px] px-5 pb-20 lg:px-10 lg:pb-32">
        <div className="grid gap-8 bg-kraft p-7 lg:grid-cols-[1fr_300px] lg:gap-9 lg:px-9">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="font-jp text-[length:var(--fs-b1)] text-kraft-ink-2">✿</span>
              <span className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.14em] text-kraft-ink uppercase">
                Gọi món thế nào cho vừa
              </span>
            </div>
            <div className="mt-5 grid gap-6 lg:grid-cols-3">
              {ORDER_ADVICE.map((advice) => (
                <div key={advice.title}>
                  <p className="font-display text-[19px] font-semibold text-kraft-ink">
                    {advice.title}
                  </p>
                  <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-kraft-ink-2">
                    {advice.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>
          <div className="grid min-w-0 content-start gap-3">
            <Link
              href="/dat-ban"
              className="flex h-13 items-center justify-center bg-kraft-ink text-[length:var(--fs-b1)] font-semibold text-gold-200"
            >
              Đặt bàn để thưởng thức
            </Link>
            <Link
              href="/dat-mon"
              className="flex h-13 items-center justify-center border border-kraft-ink text-[length:var(--fs-b1)] font-semibold text-kraft-ink"
            >
              Đặt món mang về
            </Link>
          </div>
        </div>
      </section>

      {/* Schema Menu cho Google — điều kiện để món hiện trong kết quả tìm kiếm */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Menu',
            name: 'Thực đơn Tokyo Sora',
            inLanguage: 'vi-VN',
            hasMenuSection: groups.map((group) => ({
              '@type': 'MenuSection',
              name: group.nameVi,
              description: CATEGORY_NOTES[group.id],
              hasMenuItem: group.dishes.map((dish) => ({
                '@type': 'MenuItem',
                name: dish.nameVi,
                description: dish.shortDesc ?? undefined,
                offers: {
                  '@type': 'Offer',
                  price: dish.price,
                  priceCurrency: 'VND',
                },
              })),
            })),
          }),
        }}
      />
    </QuickAddProvider>
  )
}
