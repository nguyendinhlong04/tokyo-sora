import { formatVnd } from '@sora/contracts'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  DishGlyph,
  Diamond,
  GoldRule,
  PhotoFrame,
  SignatureBadge,
} from '../../../../components/visuals'
import { DISH_STORIES, SET_STORIES } from '../../../../content/stories'
import { dishGlyph, findDish, getMenu, pairingsFor, type SiteDish } from '../../../../lib/site'

interface PageProps {
  params: Promise<{ slug: string }>
}

/** Dựng sẵn mọi trang món lúc build — trang này là mồi SEO, không được chậm */
export async function generateStaticParams() {
  const menu = await getMenu()
  return menu.dishes.map((dish) => ({ slug: dish.id }))
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const dish = findDish(await getMenu(), slug)
  if (!dish) return { title: 'Không tìm thấy món' }

  return {
    title: dish.nameJa ? `${dish.nameVi} · ${dish.nameJa}` : dish.nameVi,
    description: dish.shortDesc ?? dish.longDesc ?? undefined,
    alternates: { canonical: `/thuc-don/${dish.id}` },
  }
}

/**
 * W3 — Chi tiết món.
 *
 * Ba dạng trang trong một: món có "chuyện nguyên liệu" (khoảng 15 món chủ lực),
 * set nhiều chặng, và món thường. Tên · giá · dị ứng luôn lấy từ danh mục; phần
 * kể chuyện lấy từ nội dung biên tập.
 */
export default async function DishPage({ params }: PageProps) {
  const { slug } = await params
  const menu = await getMenu()
  const dish = findDish(menu, slug)
  if (!dish) notFound()

  const story = DISH_STORIES[dish.id]
  const setStory = SET_STORIES[dish.id]
  const setCourses = menu.sets.find((s) => s.setDishId === dish.id)?.courses ?? []
  const pairings = dish.kind === 'set' ? [] : pairingsFor(menu, dish)

  return (
    <>
      <div className="mx-auto max-w-[1280px] px-5 pt-8 lg:px-10 lg:pt-12">
        <Link href="/thuc-don" className="text-[length:var(--fs-b2)] text-ink-mute">
          ← Thực đơn
        </Link>
      </div>

      {story ? (
        <StoryPoster dish={dish} story={story} />
      ) : setStory ? (
        <SetPoster dish={dish} story={setStory} courses={setCourses} menu={menu} />
      ) : (
        <PlainPoster dish={dish} />
      )}

      {/* ------------------------------------------- Dị ứng + hai nút hành động */}
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center gap-3.5 px-5 pt-8 lg:px-10 lg:pt-9">
        {dish.signature ? <SignatureBadge /> : null}
        {dish.allergens.map((allergen) => (
          <span
            key={allergen}
            className="inline-flex h-8.5 items-center gap-2 rounded-pill border border-line-3 px-3 text-[length:var(--fs-c1)] text-ink-body"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sora-warn)" strokeWidth="2">
              <circle cx="12" cy="12" r="9" />
              <path d="M12 8v5" />
            </svg>
            {allergen}
          </span>
        ))}
        <div className="flex w-full gap-3 lg:ml-auto lg:w-auto lg:gap-3.5">
          <Link
            href="/dat-ban"
            className="inline-flex h-14 flex-1 items-center justify-center rounded-sm bg-accent-strong px-7 text-[length:var(--fs-b1)] font-semibold text-on-accent transition-colors hover:bg-accent lg:flex-none"
          >
            Đặt bàn để thưởng thức
          </Link>
          {dish.onlineVisible ? (
            <Link
              href="/dat-mon"
              className="inline-flex h-14 flex-1 items-center justify-center rounded-sm border border-line-3 px-7 text-[length:var(--fs-b1)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi lg:flex-none"
            >
              Đặt mang về
            </Link>
          ) : null}
        </div>
      </div>

      {/* ----------------------------------------------------------- Dùng kèm */}
      {pairings.length > 0 ? (
        <section className="mx-auto max-w-[1280px] px-5 py-16 lg:px-10 lg:py-32">
          <div className="border-t border-accent/16 pt-10 lg:pt-16">
            <h2 className="font-display text-[30px] font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
              Dùng kèm
            </h2>
            <p className="mt-3 font-jp text-[length:var(--fs-b1)] tracking-[0.2em] text-ink-mute">
              — 相性 —
            </p>
            <div className="mt-8 grid gap-4 lg:mt-12 lg:grid-cols-3 lg:gap-8">
              {pairings.map((pair) => (
                <Link
                  key={pair.id}
                  href={`/thuc-don/${pair.id}`}
                  className="flex items-center gap-5 rounded-md border border-accent/16 bg-surface-2 p-5 transition-colors hover:border-accent hover:bg-surface-4"
                >
                  <DishGlyph
                    glyph={dishGlyph(pair)}
                    size="sm"
                    className="size-22 flex-none rounded-md border border-accent/16"
                  />
                  <div className="min-w-0">
                    <p className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                      {pair.nameVi}
                    </p>
                    {pair.nameJa ? (
                      <p className="mt-1.5 font-jp text-[length:var(--fs-c1)] text-ink-mute">
                        {pair.nameJa}
                      </p>
                    ) : null}
                    <p className="mt-2.5 font-mono text-[length:var(--fs-b1)] text-accent-ink">
                      {formatVnd(pair.price)}
                    </p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </section>
      ) : (
        <div className="pb-16 lg:pb-24" />
      )}

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'MenuItem',
            name: dish.nameVi,
            alternateName: dish.nameJa ?? undefined,
            description: dish.longDesc ?? dish.shortDesc ?? undefined,
            suitableForDiet: dish.tags.includes('chay')
              ? 'https://schema.org/VegetarianDiet'
              : undefined,
            offers: { '@type': 'Offer', price: dish.price, priceCurrency: 'VND' },
          }),
        }}
      />
    </>
  )
}

// ---------------------------------------------------------------- Món có chuyện

function StoryPoster({
  dish,
  story,
}: {
  dish: SiteDish
  story: NonNullable<(typeof DISH_STORIES)[string]>
}) {
  return (
    <section className="mx-auto max-w-[1280px] px-5 pt-6 lg:px-10 lg:pt-7">
      <div className="grid border border-accent/30 bg-canvas lg:grid-cols-[456px_1fr]">
        {/* Cột trái: ảnh nguyên liệu, cách nướng, lưu ý */}
        <div className="flex min-w-0 flex-col border-accent/18 lg:border-r">
          <div className="p-6 pb-5 lg:p-8 lg:pb-5">
            <p className="font-display text-[28px] font-semibold tracking-[0.06em] text-ink-hi lg:text-[34px]">
              TOKYO SORA
            </p>
            <div className="mt-2.5 flex items-center gap-3">
              <span className="text-[length:var(--fs-c2)] font-semibold tracking-[0.22em] text-accent">
                YAKINIKU · RAMEN · IZAKAYA
              </span>
              <span className="ml-auto grid size-8.5 flex-none place-items-center border border-danger-line text-center font-jp text-[length:var(--fs-c2)] leading-tight text-danger">
                美味
              </span>
            </div>
          </div>

          <div className="relative min-h-[280px] flex-1 lg:min-h-[520px]">
            <DishGlyph glyph={dishGlyph(dish)} size="lg" className="absolute inset-0" />
            <div className="pointer-events-none absolute top-5 left-6 flex items-start gap-3.5">
              {story.posShort ? (
                <span className="font-jp text-[length:var(--fs-t1)] tracking-[0.16em] text-accent-ink [writing-mode:vertical-rl]">
                  {story.posShort}
                </span>
              ) : null}
              <span className="font-jp text-[30px] tracking-[0.16em] text-ink-hi [writing-mode:vertical-rl]">
                {dish.nameJa}
              </span>
            </div>
          </div>

          <div className="grid gap-5 p-6 lg:px-8 lg:pb-8">
            <div className="border border-accent/34 bg-[linear-gradient(180deg,#1A1408_0%,var(--sora-surface-2)_100%)]">
              <p className="px-6 pt-5 pb-4 text-center font-display text-[length:var(--fs-t1)] leading-tight font-semibold tracking-[0.02em] text-gold-200">
                NGON THEO CÁCH
                <br />
                ĐƠN GIẢN NHẤT
              </p>
              <div className="flex items-center gap-4.5 border-t border-accent/20 px-6 py-4.5">
                <PhotoFrame glyph="炭" className="size-16.5 flex-none rounded-sm" />
                <p className="min-w-0 text-[length:var(--fs-b1)] leading-relaxed text-ink-cream">
                  {story.fire}
                </p>
              </div>
              <div className="flex items-center gap-4.5 border-t border-accent/20 px-6 py-4.5">
                <PhotoFrame glyph="垂" className="size-16.5 flex-none rounded-full" />
                <p className="min-w-0 text-[length:var(--fs-b1)] leading-relaxed text-ink-cream">
                  {story.dip}
                </p>
              </div>
            </div>

            <div className="flex gap-4 border border-danger-line-2 px-5 py-4.5">
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--fs-c1)] font-semibold tracking-[0.2em] text-danger uppercase">
                  Lưu ý
                </p>
                <p className="mt-2.5 text-[length:var(--fs-b2)] leading-[1.75] text-ink-body">
                  {story.note}
                </p>
              </div>
              <span className="grid w-8 flex-none place-items-center border border-danger-line font-jp text-[length:var(--fs-c1)] tracking-[0.16em] text-danger [writing-mode:vertical-rl]">
                美味
              </span>
            </div>
          </div>
        </div>

        {/* Cột phải: tên, giá, hương vị, độ cắt, gia vị */}
        <div className="grid min-w-0 content-start gap-7 p-6 lg:px-11 lg:py-9">
          <div className="flex min-w-0 items-start gap-5 lg:gap-7">
            <div className="mt-1.5 hidden lg:mx-2.5 lg:block">
              <Diamond size={78}>{story.no}</Diamond>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[34px] leading-tight font-semibold tracking-[0.02em] text-gold-200 uppercase lg:text-[52px] lg:leading-[1.06]">
                {dish.nameVi}
              </h1>
              <div className="mt-3.5 flex flex-wrap items-center gap-4 lg:gap-5">
                <p className="font-jp text-[length:var(--fs-t1)] tracking-[0.08em] text-accent-ink">
                  {story.jaFull}
                </p>
                <span className="inline-flex h-9.5 items-center border border-ink-hi px-4 font-display text-[length:var(--fs-t1)] font-semibold text-ink-hi">
                  {story.portion}
                </span>
                <span className="font-mono text-[length:var(--fs-t2)] text-accent-ink lg:ml-auto lg:text-[length:var(--fs-t1)]">
                  {formatVnd(dish.price)}
                </span>
              </div>
            </div>
          </div>

          <p className="max-w-[660px] text-[length:var(--fs-b1)] leading-[1.85] text-ink-body">
            {dish.longDesc ?? dish.shortDesc}
          </p>

          <GoldRule />

          <div className="min-w-0">
            <SectionMark>Hương vị</SectionMark>
            <div className="mt-5 grid items-center gap-8 lg:grid-cols-[1fr_260px]">
              <div className="grid min-w-0 gap-4">
                {story.flavours.map((flavour, i) => (
                  <div key={flavour} className="flex min-w-0 items-center gap-4">
                    <span className="grid size-8 flex-none place-items-center rounded-full border border-accent/55 font-jp text-[length:var(--fs-b2)] text-accent">
                      {['旨', '甘', '香', '合'][i] ?? '味'}
                    </span>
                    <span className="text-[length:var(--fs-b1)] leading-snug text-ink-cream">
                      {flavour}
                    </span>
                  </div>
                ))}
              </div>
              <div className="min-w-0">
                <PhotoFrame
                  glyph={story.posShort || '部'}
                  rounded={false}
                  className="h-[150px] border-accent/20"
                />
                <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                  Vị trí:
                  <br />
                  {story.pos}
                </p>
              </div>
            </div>
          </div>

          <div className="min-w-0">
            <SectionMark>
              {['tomsu', 'muctrung', 'namdui', 'bingoi', 'sodiep'].includes(dish.id)
                ? 'Cách sơ chế'
                : 'Lựa chọn độ cắt'}
            </SectionMark>
            <div className="mt-5 grid gap-4 lg:grid-cols-3">
              {story.cuts.map((cut) => (
                <div
                  key={cut.name}
                  className="flex min-w-0 flex-col border border-accent/28 bg-surface-1"
                >
                  <div className="border-b border-accent/18 px-4 pt-4 pb-3.5 text-center">
                    <p className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.08em] text-gold-200 uppercase">
                      {cut.name}
                    </p>
                    <p className="mt-1.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {cut.size}
                    </p>
                  </div>
                  <DishGlyph glyph={dishGlyph(dish)} size="sm" className="h-[130px]" />
                  <div className="flex min-w-0 flex-1 flex-col gap-3.5 p-4">
                    <p className="flex-1 text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
                      {cut.desc}
                    </p>
                    <div className="flex items-center gap-2.5">
                      <span className="text-[10px] font-semibold tracking-[0.14em] text-ink-mute">
                        ĐỘ MỀM
                      </span>
                      <div className="flex gap-[3px]">
                        {[0, 1, 2, 3].map((i) => (
                          <span
                            key={i}
                            className={`h-2.5 w-6.5 rounded-[2px] ${
                              i < cut.soft ? 'bg-gold-500' : 'bg-line-2'
                            }`}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="min-w-0 bg-kraft p-6">
            <div className="flex items-center gap-3">
              <span className="font-jp text-[length:var(--fs-b1)] text-kraft-ink-2">✿</span>
              <span className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.14em] text-kraft-ink uppercase">
                Gợi ý thưởng thức
              </span>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-4.5 lg:grid-cols-4">
              {story.conds.map((cond) => (
                <div key={cond.name} className="min-w-0">
                  <div className="mx-auto grid size-22 place-items-center rounded-full border border-kraft-ink/25 bg-kraft-ink/5 font-jp text-[30px] text-kraft-ink-2">
                    {cond.kanji}
                  </div>
                  <p className="mt-3.5 text-center text-[length:var(--fs-c1)] font-bold tracking-[0.06em] text-kraft-ink uppercase">
                    {cond.name}
                  </p>
                  <p className="mt-2 text-[12.5px] leading-relaxed text-kraft-ink-2">{cond.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Dải chân poster */}
        <div className="grid border-t border-accent/18 lg:col-span-2 lg:grid-cols-[1fr_290px_320px_1fr]">
          <div className="flex min-w-0 items-start gap-3.5 p-6 lg:px-8">
            <span className="mt-0.5 flex-none font-jp text-[length:var(--fs-b1)] text-danger">❁</span>
            <div className="min-w-0">
              <p className="font-display text-[21px] font-semibold tracking-[0.08em] text-gold-200 uppercase">
                {dish.nameVi} — nguyên liệu quý
              </p>
              <p className="mt-2.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                {story.craft}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3.5 border-t border-accent/14 p-6 lg:border-t-0 lg:border-l lg:px-6">
            <div className="min-w-0">
              <p className="font-jp text-[26px] text-accent-ink">焼いてうまい！</p>
              <p className="mt-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.14em] text-ink-mute">
                NƯỚNG ĐÚNG CÁCH — NGON HẾT Ý
              </p>
            </div>
            <span className="grid w-7.5 flex-none place-items-center border border-danger-line py-1.5 font-jp text-[length:var(--fs-c2)] tracking-[0.14em] text-danger [writing-mode:vertical-rl]">
              絶品
            </span>
          </div>
          <PhotoFrame
            glyph="火"
            rounded={false}
            className="min-h-[130px] border-0 border-t border-accent/14 lg:border-t-0 lg:border-l"
          />
          <div className="flex min-w-0 items-center border-t border-accent/14 p-6 lg:border-t-0 lg:px-8">
            <p className="font-display text-[19px] leading-snug text-gold-200 italic">
              Thưởng thức từng lát — trọn vẹn hương vị như ở Tokyo.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------------ Set

function SetPoster({
  dish,
  story,
  courses,
  menu,
}: {
  dish: SiteDish
  story: NonNullable<(typeof SET_STORIES)[string]>
  courses: { label: string; kanji: string | null; items: { dishId: string; qty: number; portionLabel: string | null }[] }[]
  menu: Awaited<ReturnType<typeof getMenu>>
}) {
  const extras = story.extra
    .map((id) => findDish(menu, id))
    .filter((d): d is SiteDish => d !== undefined)

  return (
    <section className="mx-auto max-w-[1280px] px-5 pt-6 lg:px-10 lg:pt-7">
      <div className="grid border border-accent/30 bg-canvas lg:grid-cols-[456px_1fr]">
        <div className="flex min-w-0 flex-col border-accent/18 lg:border-r">
          <div className="p-6 pb-5 lg:p-8 lg:pb-5">
            <p className="font-display text-[28px] font-semibold tracking-[0.06em] text-ink-hi lg:text-[34px]">
              TOKYO SORA
            </p>
            <div className="mt-2.5 flex items-center gap-3">
              <span className="text-[length:var(--fs-c2)] font-semibold tracking-[0.22em] text-accent">
                SET · 御膳
              </span>
              <span className="ml-auto grid size-8.5 flex-none place-items-center border border-danger-line text-center font-jp text-[length:var(--fs-c2)] leading-tight text-danger">
                御膳
              </span>
            </div>
          </div>

          <div className="relative min-h-[260px] flex-1 lg:min-h-[460px]">
            <DishGlyph glyph={dishGlyph(dish)} size="lg" className="absolute inset-0" />
            <span className="pointer-events-none absolute top-6 left-6 font-jp text-[30px] tracking-[0.18em] text-ink-hi [writing-mode:vertical-rl]">
              {dish.nameJa}
            </span>
          </div>

          <div className="grid flex-none gap-5 p-6 lg:px-8 lg:pb-8">
            <div className="grid grid-cols-2 border border-accent/20">
              {[
                { v: story.servings, l: 'Trong set' },
                { v: story.people, l: 'Dành cho' },
                { v: story.duration, l: 'Thời lượng' },
                { v: dish.nameJa ?? '', l: 'Tên gọi', jp: true },
              ].map((cell, i) => (
                <div
                  key={cell.l}
                  className={`px-4 py-4 ${i % 2 === 0 ? 'border-r border-accent/14' : ''} ${
                    i < 2 ? 'border-b border-accent/14' : ''
                  }`}
                >
                  <p
                    className={`${cell.jp ? 'font-jp text-[length:var(--fs-t1)] tracking-[0.08em]' : 'font-display text-[length:var(--fs-t1)] font-semibold'} text-accent-ink`}
                  >
                    {cell.v}
                  </p>
                  <p className="mt-1.5 text-[10px] font-semibold tracking-[0.16em] text-ink-mute uppercase">
                    {cell.l}
                  </p>
                </div>
              ))}
            </div>

            <div className="border border-accent/34 bg-[linear-gradient(180deg,#1A1408_0%,var(--sora-surface-2)_100%)]">
              <p className="px-6 pt-5 pb-4 text-center font-display text-[length:var(--fs-t1)] leading-tight font-semibold text-gold-200">
                BỮA ĂN DIỄN RA
                <br />
                THEO THỨ TỰ NÀY
              </p>
              <ol className="grid gap-3.5 border-t border-accent/20 px-6 py-4.5">
                {story.flow.map((step, i) => (
                  <li key={step} className="flex min-w-0 items-start gap-3.5">
                    <span className="mt-0.5 grid size-6.5 flex-none place-items-center rounded-full border border-accent/50 font-mono text-[length:var(--fs-c2)] text-accent">
                      {i + 1}
                    </span>
                    <p className="min-w-0 text-[length:var(--fs-b2)] leading-relaxed text-ink-cream">
                      {step}
                    </p>
                  </li>
                ))}
              </ol>
            </div>

            <div className="flex gap-4 border border-danger-line-2 px-5 py-4.5">
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--fs-c1)] font-semibold tracking-[0.2em] text-danger uppercase">
                  Lưu ý
                </p>
                <p className="mt-2.5 text-[length:var(--fs-b2)] leading-[1.75] text-ink-body">
                  {story.note}
                </p>
              </div>
              <span className="grid w-8 flex-none place-items-center border border-danger-line font-jp text-[length:var(--fs-c1)] tracking-[0.16em] text-danger [writing-mode:vertical-rl]">
                御膳
              </span>
            </div>
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-7 p-6 lg:px-11 lg:py-9">
          <div className="flex min-w-0 items-start gap-5 lg:gap-7">
            <div className="mt-1.5 hidden lg:mx-2.5 lg:block">
              <Diamond size={78}>{story.no}</Diamond>
            </div>
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[34px] leading-tight font-semibold tracking-[0.02em] text-gold-200 uppercase lg:text-[52px] lg:leading-[1.06]">
                {dish.nameVi}
              </h1>
              <div className="mt-3.5 flex flex-wrap items-center gap-4">
                <p className="font-jp text-[length:var(--fs-t1)] tracking-[0.08em] text-accent-ink">
                  {story.jaFull}
                </p>
                <span className="inline-flex h-9 items-center border border-ink-hi px-3.5 font-display text-[19px] font-semibold text-ink-hi">
                  {story.servings}
                </span>
                <span className="font-mono text-[length:var(--fs-t1)] text-accent-ink lg:ml-auto">
                  {formatVnd(dish.price)}
                </span>
              </div>
              <div className="mt-3.5 flex flex-wrap gap-6">
                <span className="text-[length:var(--fs-c1)] text-ink-mute">
                  Dành cho <span className="text-ink-cream">{story.people}</span>
                </span>
                <span className="text-[length:var(--fs-c1)] text-ink-mute">
                  Thời lượng <span className="text-ink-cream">{story.duration}</span>
                </span>
              </div>
            </div>
          </div>

          <p className="max-w-[680px] text-[length:var(--fs-b1)] leading-[1.85] text-ink-body">
            {story.intro}
          </p>

          <GoldRule />

          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <span className="font-jp text-[length:var(--fs-b1)] text-accent">✿</span>
              <span className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.14em] text-gold-200 uppercase">
                Trong set có gì
              </span>
              <span className="ml-auto hidden text-[length:var(--fs-c1)] text-ink-mute lg:block">
                Bấm từng món để đọc chi tiết
              </span>
            </div>

            <div className="mt-5 grid gap-5">
              {courses.map((course) => (
                <div key={course.label} className="min-w-0">
                  <div className="flex items-center gap-3 pb-3">
                    <span className="grid size-7.5 flex-none place-items-center border border-accent/45 font-jp text-[length:var(--fs-b2)] text-accent-ink">
                      {course.kanji ?? '膳'}
                    </span>
                    <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.18em] text-accent-ink uppercase">
                      {course.label}
                    </span>
                    <span className="font-mono text-[length:var(--fs-c2)] text-ink-mute">
                      {course.items.length} món
                    </span>
                    <span className="h-px flex-1 bg-[linear-gradient(90deg,rgba(201,168,92,0.25)_0%,rgba(201,168,92,0.04)_100%)]" />
                  </div>
                  <div className="grid gap-3 lg:grid-cols-2">
                    {course.items.map((item) => {
                      const itemDish = findDish(menu, item.dishId)
                      if (!itemDish) return null
                      return (
                        <Link
                          key={item.dishId}
                          href={`/thuc-don/${item.dishId}`}
                          className="flex min-w-0 items-center gap-4 border border-accent/18 bg-surface-1 px-3.5 py-3 transition-colors hover:border-accent hover:bg-surface-3"
                        >
                          <DishGlyph
                            glyph={dishGlyph(itemDish)}
                            size="sm"
                            className="size-15.5 flex-none border border-accent/20"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-[length:var(--fs-b1)] leading-snug font-semibold text-ink-cream">
                              {itemDish.nameVi}
                            </p>
                            {itemDish.nameJa ? (
                              <p className="mt-1 font-jp text-[length:var(--fs-c1)] tracking-[0.06em] text-ink-mute">
                                {itemDish.nameJa}
                              </p>
                            ) : null}
                          </div>
                          <div className="flex-none text-right">
                            <p className="font-mono text-[length:var(--fs-c1)] text-accent-ink">
                              {item.portionLabel ?? `${item.qty} phần`}
                            </p>
                            <p className="mt-1.5 text-[length:var(--fs-c2)] text-ink-mute">
                              Xem món →
                            </p>
                          </div>
                        </Link>
                      )
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {extras.length > 0 ? (
            <div className="min-w-0 bg-kraft p-6">
              <div className="flex items-center gap-3">
                <span className="font-jp text-[length:var(--fs-b1)] text-kraft-ink-2">✿</span>
                <span className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.14em] text-kraft-ink uppercase">
                  Gọi thêm cho vừa miệng
                </span>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {extras.map((extra) => (
                  <Link key={extra.id} href={`/thuc-don/${extra.id}`} className="flex min-w-0 items-center gap-3.5">
                    <div className="grid size-15.5 flex-none place-items-center border border-kraft-ink/25 bg-kraft-ink/5 font-jp text-[26px] text-kraft-ink-2">
                      {dishGlyph(extra)}
                    </div>
                    <div className="min-w-0">
                      <p className="text-[length:var(--fs-b2)] leading-snug font-bold text-kraft-ink">
                        {extra.nameVi}
                      </p>
                      <p className="mt-1.5 font-mono text-[length:var(--fs-c1)] text-kraft-ink-2">
                        {formatVnd(extra.price)}
                      </p>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="grid border-t border-accent/18 lg:col-span-2 lg:grid-cols-[1fr_290px_320px_1fr]">
          <div className="flex min-w-0 items-start gap-3.5 p-6 lg:px-8">
            <span className="mt-0.5 flex-none font-jp text-[length:var(--fs-b1)] text-danger">❁</span>
            <div className="min-w-0">
              <p className="font-display text-[21px] font-semibold tracking-[0.08em] text-gold-200 uppercase">
                {dish.nameVi} — bữa dọn sẵn
              </p>
              <p className="mt-2.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                {story.craft}
              </p>
            </div>
          </div>
          <div className="flex min-w-0 items-center gap-3.5 border-t border-accent/14 p-6 lg:border-t-0 lg:border-l lg:px-6">
            <div className="min-w-0">
              <p className="font-jp text-[26px] text-accent-ink">いただきます！</p>
              <p className="mt-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.14em] text-ink-mute">
                MỜI CẢ BÀN CÙNG BẮT ĐẦU
              </p>
            </div>
            <span className="grid w-7.5 flex-none place-items-center border border-danger-line py-1.5 font-jp text-[length:var(--fs-c2)] tracking-[0.14em] text-danger [writing-mode:vertical-rl]">
              満足
            </span>
          </div>
          <PhotoFrame
            glyph="宴"
            rounded={false}
            className="min-h-[130px] border-0 border-t border-accent/14 lg:border-t-0 lg:border-l"
          />
          <div className="flex min-w-0 items-center border-t border-accent/14 p-6 lg:border-t-0 lg:px-8">
            <p className="font-display text-[19px] leading-snug text-gold-200 italic">
              Đặt bàn trước, phần thịt đẹp nhất trong ngày sẽ dành cho set của bạn.
            </p>
          </div>
        </div>
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ Món thường

function PlainPoster({ dish }: { dish: SiteDish }) {
  return (
    <section className="mx-auto max-w-[1280px] px-5 pt-6 lg:px-10 lg:pt-7">
      <div className="grid border border-accent/22 bg-canvas lg:grid-cols-[560px_1fr]">
        <div className="relative min-h-[260px] border-accent/16 lg:min-h-[420px] lg:border-r">
          <DishGlyph glyph={dishGlyph(dish)} size="lg" className="absolute inset-0" />
          <span className="pointer-events-none absolute top-6 left-6 font-jp text-[28px] tracking-[0.18em] text-ink-hi opacity-90 [writing-mode:vertical-rl]">
            {dish.nameJa}
          </span>
        </div>
        <div className="grid min-w-0 content-center gap-6 p-6 lg:p-12">
          {dish.signature ? <SignatureBadge /> : null}
          <div>
            <h1 className="font-display text-[32px] leading-tight font-semibold text-gold-200 uppercase lg:text-[46px]">
              {dish.nameVi}
            </h1>
            <div className="mt-3.5 flex flex-wrap items-baseline gap-5">
              {dish.nameJa ? (
                <p className="font-jp text-[length:var(--fs-t2)] tracking-[0.08em] text-accent-ink lg:text-[length:var(--fs-t1)]">
                  {dish.nameJa}
                </p>
              ) : null}
              <p className="font-mono text-[length:var(--fs-t2)] text-accent-ink lg:text-[length:var(--fs-t1)]">
                {formatVnd(dish.price)}
              </p>
            </div>
          </div>
          <GoldRule />
          <p className="max-w-[560px] text-[length:var(--fs-b1)] leading-[1.85] text-ink-body">
            {dish.longDesc ?? dish.shortDesc}
          </p>
        </div>
      </div>
    </section>
  )
}

function SectionMark({ children }: { children: string }) {
  return (
    <div className="flex items-center gap-3">
      <span className="font-jp text-[length:var(--fs-b1)] text-accent">✿</span>
      <span className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.14em] text-gold-200 uppercase">
        {children}
      </span>
    </div>
  )
}
