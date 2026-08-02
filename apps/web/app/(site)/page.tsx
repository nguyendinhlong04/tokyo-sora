import { formatVnd } from '@sora/contracts'
import Link from 'next/link'
import { DishGlyph, Eyebrow, PhotoFrame, SignatureBadge } from '../../components/visuals'
import { HOW_TO_EAT, PROMISES, SITE } from '../../content/site'
import { dishGlyph, getBranches, getMenu } from '../../lib/site'

/**
 * W1 — Trang chủ.
 *
 * Hai nút hành động ngang hàng ngay trong hero, và một dải tìm bàn ở cuối trang:
 * website tồn tại để bán hai việc, đặt bàn và đặt món mang về (§19).
 */
export default async function HomePage() {
  const [menu, branches] = await Promise.all([getMenu(), getBranches()])
  const signatures = menu.dishes.filter((d) => d.signature && d.kind !== 'set').slice(0, 6)
  const hero = signatures[0]

  const today = new Date()
  const dates = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today.getTime() + i * 86_400_000)
    return {
      value: d.toISOString().slice(0, 10),
      label: i === 0 ? 'Hôm nay' : i === 1 ? 'Ngày mai' : formatDate(d),
    }
  })

  return (
    <>
      {/* ---------------------------------------------------------- Hero */}
      <section className="relative flex min-h-[560px] flex-col justify-center overflow-hidden lg:min-h-[820px]">
        <div
          aria-hidden
          className="absolute inset-0 bg-[radial-gradient(120%_90%_at_78%_38%,var(--sora-line-1)_0%,var(--sora-bg-base)_68%)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,var(--sora-bg-base)_0%,rgba(7,8,10,0.92)_38%,rgba(7,8,10,0.35)_72%,rgba(7,8,10,0)_100%)]"
        />
        <span
          aria-hidden
          className="pointer-events-none absolute top-1/2 right-14 hidden -translate-y-1/2 font-jp text-[112px] leading-none tracking-[0.12em] text-ink-hi opacity-8 [writing-mode:vertical-rl] lg:block"
        >
          炭火焼
        </span>

        <div className="relative mx-auto w-full max-w-[1280px] px-5 py-24 lg:px-10 lg:py-0">
          <span className="font-jp text-[length:var(--fs-t2)] tracking-[0.3em] text-accent">
            {SITE.kanji}
          </span>
          <h1 className="mt-5 max-w-[620px] font-display text-[44px] leading-[1.08] font-light text-ink-hi lg:mt-6 lg:text-[length:var(--fs-d1)]">
            Bầu trời Tokyo,
            <br />
            trên bếp than.
          </h1>
          <p className="mt-6 max-w-[420px] text-[length:var(--fs-b1)] leading-relaxed text-ink-body lg:mt-7">
            {SITE.lead}
          </p>
          <div className="mt-10 flex flex-col gap-3 lg:mt-11 lg:flex-row lg:gap-3.5">
            <Link
              href="/dat-ban"
              className="inline-flex h-14 items-center justify-center rounded-sm border border-accent px-8 text-[length:var(--fs-b1)] font-medium text-accent-ink transition-colors hover:border-gold-300 hover:text-gold-200"
            >
              Đặt bàn
            </Link>
            <Link
              href="/thuc-don"
              className="inline-flex h-14 items-center justify-center rounded-sm border border-line-3 px-8 text-[length:var(--fs-b1)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi"
            >
              Xem thực đơn
            </Link>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- Món ký mở đầu */}
      {hero ? (
        <section className="relative overflow-hidden px-5 py-20 lg:px-10 lg:py-32">
          <div
            aria-hidden
            className="absolute inset-0 bg-[radial-gradient(60%_70%_at_62%_45%,var(--sora-line-1)_0%,var(--sora-bg-base)_72%)]"
          />
          <div className="relative mx-auto grid max-w-[1280px] items-center gap-12 lg:grid-cols-2 lg:gap-0">
            <div className="order-2 lg:order-1">
              <Eyebrow>Món ký</Eyebrow>
              <h2 className="mt-5 font-display text-[44px] leading-[1.1] font-light text-ink-hi lg:text-[length:var(--fs-d1)]">
                {hero.nameVi}
              </h2>
              {hero.nameJa ? (
                <p className="mt-3 font-jp text-[length:var(--fs-t2)] tracking-[0.1em] text-accent-ink">
                  {hero.nameJa}
                </p>
              ) : null}
              <p className="mt-7 max-w-[380px] text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
                {hero.shortDesc ?? hero.longDesc}
              </p>
              <p className="mt-8 font-mono text-[length:var(--fs-t1)] text-accent-ink">
                {formatVnd(hero.price)}
              </p>
              <Link
                href={`/thuc-don/${hero.id}`}
                className="mt-8 inline-flex h-13 items-center rounded-sm border border-line-3 px-7 text-[length:var(--fs-b1)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi"
              >
                Xem chi tiết món
              </Link>
            </div>
            <div className="order-1 flex justify-center lg:order-2">
              <DishGlyph
                glyph={dishGlyph(hero)}
                size="xl"
                className="size-[250px] rounded-md drop-shadow-[0_12px_24px_rgba(0,0,0,0.45)] lg:size-[420px]"
              />
            </div>
          </div>
        </section>
      ) : null}

      {/* ------------------------------------------------------ Ba lời hứa */}
      <section className="px-5 pb-20 lg:px-10 lg:pb-32">
        <div className="mx-auto grid max-w-[1280px] gap-9 border-t border-accent/16 pt-10 lg:grid-cols-3 lg:gap-16 lg:pt-16">
          {PROMISES.map((promise) => (
            <div key={promise.text} className="flex gap-5 lg:block">
              <span className="flex-none text-accent lg:block">
                <PromiseIcon kind={promise.icon} />
              </span>
              <p className="text-[length:var(--fs-t2)] leading-relaxed text-ink-hi lg:mt-6">
                {promise.text}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ Sáu món ký */}
      {signatures.length > 0 ? (
        <section className="px-5 pb-20 lg:px-10 lg:pb-32">
          <div className="mx-auto max-w-[1280px]">
            <div className="flex items-baseline justify-between gap-6">
              <h2 className="font-display text-[30px] font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
                {signatures.length === 6 ? 'Sáu món ký' : 'Món ký của bếp'}
              </h2>
              <Link href="/thuc-don" className="text-[length:var(--fs-b2)] text-accent-ink">
                Toàn bộ thực đơn →
              </Link>
            </div>
            <p className="mt-3 font-jp text-[length:var(--fs-b1)] tracking-[0.14em] text-ink-mute">
              — 焼 —
            </p>

            <div className="mt-9 grid grid-cols-2 gap-4 lg:mt-14 lg:grid-cols-3 lg:gap-8">
              {signatures.map((dish) => (
                <Link key={dish.id} href={`/thuc-don/${dish.id}`} className="group">
                  <div className="relative aspect-[4/3] overflow-hidden rounded-md border border-accent/16">
                    <DishGlyph glyph={dishGlyph(dish)} className="size-full" />
                    <span className="absolute top-3 left-3 hidden lg:block">
                      <SignatureBadge />
                    </span>
                  </div>
                  <div className="mt-4 flex items-baseline justify-between gap-4 lg:mt-5">
                    <div>
                      <p className="text-[length:var(--fs-b2)] font-semibold text-ink-hi lg:text-[length:var(--fs-t2)]">
                        {dish.nameVi}
                      </p>
                      {dish.nameJa ? (
                        <p className="mt-1.5 font-jp text-[length:var(--fs-b2)] tracking-[0.08em] text-ink-mute">
                          {dish.nameJa}
                        </p>
                      ) : null}
                    </div>
                    <span className="flex-none font-mono text-[length:var(--fs-b2)] text-accent-ink lg:text-[length:var(--fs-b1)]">
                      {formatVnd(dish.price)}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      {/* -------------------------------------------------- Cách ăn Yakiniku */}
      <section className="px-5 pb-20 lg:px-10 lg:pb-32">
        <div className="mx-auto grid max-w-[1280px] gap-10 border-t border-accent/16 pt-10 lg:grid-cols-[340px_1fr] lg:gap-24 lg:pt-24">
          <div>
            <h2 className="font-display text-[30px] leading-tight font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
              Cách ăn Yakiniku
            </h2>
            <p className="mt-3.5 font-jp text-[length:var(--fs-b1)] tracking-[0.14em] text-ink-mute">
              焼肉の食べ方
            </p>
            <p className="mt-6 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
              Bốn bước, làm đúng thì miếng thịt nào cũng ngon.
            </p>
          </div>
          <ol className="relative pl-13 lg:pl-14">
            <div
              aria-hidden
              className="absolute top-3 bottom-6 left-[17px] w-px bg-[linear-gradient(var(--sora-gold-900),var(--sora-line-3))] lg:left-[19px]"
            />
            {HOW_TO_EAT.map((step) => (
              <li key={step.n} className="relative pb-9 lg:pb-11">
                <span className="absolute top-0 -left-13 grid size-9 place-items-center rounded-full border border-gold-900 bg-canvas font-mono text-[length:var(--fs-b2)] text-accent-ink lg:-left-14 lg:size-10">
                  {step.n}
                </span>
                <p className="text-[length:var(--fs-t2)] leading-snug font-medium text-ink-hi lg:text-[length:var(--fs-t1)]">
                  {step.title}
                </p>
                <p className="mt-2.5 text-[length:var(--fs-b2)] leading-relaxed text-ink-mute lg:text-[length:var(--fs-b1)]">
                  {step.desc}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ------------------------------------------------------- Không gian */}
      <section className="px-5 pb-20 lg:px-10 lg:pb-32">
        <div className="mx-auto grid max-w-[1280px] auto-rows-[120px] grid-cols-2 gap-2.5 lg:auto-rows-[150px] lg:grid-cols-6 lg:gap-4">
          <PhotoFrame glyph="炭" className="col-span-2 row-span-2 lg:col-span-3" />
          <PhotoFrame glyph="間" className="row-span-2 lg:col-span-2 lg:mt-10" />
          <PhotoFrame glyph="盃" className="hidden lg:block" />
          <PhotoFrame glyph="火" className="hidden lg:block" />
          <PhotoFrame glyph="夜" className="col-span-2 lg:col-span-3 lg:mt-4" />
        </div>
      </section>

      {/* ------------------------------------------------- Dải tìm bàn tối nay */}
      <section className="relative overflow-hidden bg-gold-900">
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(180deg,rgba(7,8,10,0.42),rgba(7,8,10,0.62))]"
        />
        <div className="relative mx-auto grid max-w-[1280px] items-center gap-8 px-5 py-12 lg:grid-cols-[360px_1fr] lg:gap-20 lg:px-10 lg:py-24">
          <div>
            <h2 className="font-display text-[30px] leading-tight font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
              Còn bàn tối nay
            </h2>
            <p className="mt-4 text-[length:var(--fs-b1)] leading-relaxed text-gold-200">
              Chọn ngày và số khách, chúng tôi hiện giờ còn trống ngay.
            </p>
          </div>

          {/* GET sang W6: không mang gì hơn ngày và số khách — thông tin cá nhân
              không đi qua thanh địa chỉ */}
          <form action="/dat-ban" className="grid gap-3.5 lg:grid-cols-[1fr_1fr_auto] lg:gap-4">
            <label className="block">
              <span className="mb-2 block text-[length:var(--fs-c2)] font-semibold tracking-[0.08em] text-gold-200 uppercase">
                Ngày
              </span>
              <select
                name="ngay"
                defaultValue={dates[0]!.value}
                className="h-13 w-full rounded-sm border border-ink-hi/28 bg-canvas/50 px-3.5 text-[length:var(--fs-b1)] text-ink-hi"
              >
                {dates.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-[length:var(--fs-c2)] font-semibold tracking-[0.08em] text-gold-200 uppercase">
                Số khách
              </span>
              <select
                name="khach"
                defaultValue="4"
                className="h-13 w-full rounded-sm border border-ink-hi/28 bg-canvas/50 px-3.5 text-[length:var(--fs-b1)] text-ink-hi"
              >
                {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                  <option key={n} value={n}>
                    {n} khách
                  </option>
                ))}
              </select>
            </label>
            <button
              type="submit"
              className="h-13 rounded-sm border border-ink-hi px-7 text-[length:var(--fs-b1)] font-semibold whitespace-nowrap text-ink-hi transition-colors hover:bg-ink-hi hover:text-canvas lg:self-end"
            >
              Tìm bàn trống
            </button>
          </form>
        </div>
      </section>

      {/* Hai hành động gắn thẳng vào thực thể Restaurant — điều kiện để nút đặt
          hiện ngay trên kết quả tìm kiếm (§23.1.4) */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'Restaurant',
            name: SITE.name,
            alternateName: SITE.kanji,
            description: SITE.blurb,
            servesCuisine: 'Nhật Bản · Yakiniku',
            priceRange: '₫₫',
            hasMenu: '/thuc-don',
            telephone: branches[0]?.phone ?? undefined,
            address: branches.map((branch) => ({
              '@type': 'PostalAddress',
              streetAddress: branch.address,
            })),
            potentialAction: [
              { '@type': 'ReserveAction', target: '/dat-ban' },
              { '@type': 'OrderAction', target: '/dat-mon' },
            ],
          }),
        }}
      />
    </>
  )
}

function formatDate(d: Date): string {
  const dow = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'][d.getDay()]
  return `${dow} ${d.getDate()}/${d.getMonth() + 1}`
}

function PromiseIcon({ kind }: { kind: 'fire' | 'knife' | 'room' }) {
  const common = {
    width: 26,
    height: 26,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.4,
  }
  if (kind === 'fire') {
    return (
      <svg {...common}>
        <path d="M12 3c1.6 3.2.4 4.6-.8 6-1 1.2-1.6 2.3-1.6 3.7a2.4 2.4 0 0 0 4.8 0c0-.9-.3-1.6-.7-2.2 1.9 1 3.3 2.7 3.3 5A5 5 0 0 1 7 15.5C7 10 12 9 12 3Z" />
      </svg>
    )
  }
  if (kind === 'knife') {
    return (
      <svg {...common}>
        <path d="M4 15 15 4l5 5L9 20H4v-5Z" />
        <path d="M12.5 6.5 17.5 11.5" />
      </svg>
    )
  }
  return (
    <svg {...common}>
      <path d="M4 20V5a1 1 0 0 1 1-1h9a1 1 0 0 1 1 1v15" />
      <path d="M15 9h4a1 1 0 0 1 1 1v10" />
      <path d="M3 20h18" />
      <circle cx="11.5" cy="12" r=".9" fill="currentColor" stroke="none" />
    </svg>
  )
}
