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
import {
  dishGlyph,
  findDish,
  getMenu,
  pairingsFor,
  type SiteDish,
  type SiteDishStory,
} from '../../../../lib/site'

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
 * Ba dạng trang trong một: món có "chuyện nguyên liệu", set nhiều chặng, và món
 * thường. TOÀN BỘ chữ nghĩa và ảnh trên trang đến từ trung tâm sản phẩm — tên,
 * giá, dị ứng từ bản ghi món; phần kể chuyện từ bản ghi giới thiệu đi kèm, cả
 * hai nhập ở Office M1 · Món và set.
 *
 * Trang LÙI DẦN chứ không gãy: món chưa được kể thì dựng bản gọn, món kể một
 * nửa thì bỏ những khối chưa có chữ. Nhờ vậy thêm món mới vào danh mục không bao
 * giờ làm trang web hỏng — chỉ là trang gọn hơn cho tới khi bếp viết xong.
 */
export default async function DishPage({ params }: PageProps) {
  const { slug } = await params
  const menu = await getMenu()
  const dish = findDish(menu, slug)
  if (!dish) notFound()

  const story = dish.story
  const setCourses = menu.sets.find((s) => s.setDishId === dish.id)?.courses ?? []
  const pairings = dish.kind === 'set' ? [] : pairingsFor(menu, dish)

  return (
    <>
      <div className="mx-auto max-w-[1280px] px-5 pt-8 lg:px-10 lg:pt-12">
        <Link href="/thuc-don" className="text-[length:var(--fs-b2)] text-ink-mute">
          ← Thực đơn
        </Link>
      </div>

      {story && dish.kind === 'set' ? (
        <SetPoster dish={dish} story={story} courses={setCourses} menu={menu} />
      ) : story ? (
        <StoryPoster dish={dish} story={story} />
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
            className="inline-flex h-14 flex-1 items-center justify-center rounded-md bg-accent-strong px-7 text-[length:var(--fs-b1)] font-semibold text-on-accent transition-colors hover:bg-accent lg:flex-none"
          >
            Đặt bàn
          </Link>
          {dish.onlineVisible ? (
            <Link
              href="/dat-mon"
              className="inline-flex h-14 flex-1 items-center justify-center rounded-md border border-line-3 px-7 text-[length:var(--fs-b1)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi lg:flex-none"
            >
              Đặt mang về
            </Link>
          ) : null}
        </div>
      </div>

      {/* ----------------------------------------------------------- Dùng kèm */}
      {pairings.length > 0 ? (
        <section className="mx-auto max-w-[1280px] px-5 py-16 lg:px-10 lg:py-32">
          {/* 18 — cùng tầng khối với chân poster và khối "bữa ăn diễn ra" */}
          <div className="border-t border-accent/18 pt-10 lg:pt-16">
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
                  /* Ô giữ viền, hạ về tầng khối (14): `surface-2` trên nền trang
                     chỉ đo 1,04:1, bỏ viền là ba ô này biến mất khỏi trang */
                  className="flex items-center gap-5 rounded-lg border border-accent/14 bg-surface-2 p-5 transition-colors hover:border-accent hover:bg-surface-4"
                >
                  {/* Ảnh thì bỏ viền được: nó nằm sâu 20 trong một ô đã có viền */}
                  <DishGlyph
                    glyph={dishGlyph(pair)}
                    src={pair.imageUrl}
                    alt={pair.nameVi}
                    size="sm"
                    className="size-22 flex-none rounded-md"
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
            description: story?.intro ?? dish.longDesc ?? dish.shortDesc ?? undefined,
            image: dish.imageUrl ?? undefined,
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

function StoryPoster({ dish, story }: { dish: SiteDish; story: SiteDishStory }) {
  const flavours = story.flavours ?? []
  const cuts = story.cuts ?? []
  const condiments = story.condiments ?? []
  /** Tên Nhật đầy đủ nếu bếp có khai, không thì tên Nhật ngắn của món */
  const nameJa = story.nameJaFull ?? dish.nameJa

  return (
    <section className="mx-auto max-w-[1280px] px-5 pt-6 lg:px-10 lg:pt-7">
      {/* `overflow-hidden` bắt buộc đi kèm: ảnh món nằm `absolute inset-0` trong
          cột trái, chạm cả ba mép — không cắt thì góc vuông của ảnh thò ra
          ngoài đường viền đã bo. Ô ghép trong lưới poster (bảng thông số, dải
          chân) cũng nhờ đó mà được xén tròn theo khung. */}
      <div className="grid overflow-hidden rounded-lg border border-accent/30 bg-canvas lg:grid-cols-[456px_1fr]">
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
            <DishGlyph
              glyph={dishGlyph(dish)}
              src={dish.imageUrl}
              alt={dish.nameVi}
              size="lg"
              className="absolute inset-0"
            />
            <div className="pointer-events-none absolute top-5 left-6 flex items-start gap-3.5">
              {story.originKanji ? (
                <span className="font-jp text-[length:var(--fs-t1)] tracking-[0.16em] text-accent-ink [writing-mode:vertical-rl]">
                  {story.originKanji}
                </span>
              ) : null}
              {dish.nameJa ? (
                <span className="font-jp text-[30px] tracking-[0.16em] text-ink-hi [writing-mode:vertical-rl]">
                  {dish.nameJa}
                </span>
              ) : null}
            </div>
          </div>

          <div className="grid gap-5 p-6 lg:px-8 lg:pb-8">
            {story.fire || story.dip ? (
              <div className="rounded-md border border-accent/18 bg-[linear-gradient(180deg,#1A1408_0%,var(--sora-surface-2)_100%)]">
                <p className="px-6 pt-5 pb-4 text-center font-display text-[length:var(--fs-t1)] leading-tight font-semibold tracking-[0.02em] text-gold-200">
                  NGON THEO CÁCH
                  <br />
                  ĐƠN GIẢN NHẤT
                </p>
                {story.fire ? (
                  <div className="flex items-center gap-4.5 border-t border-accent/14 px-6 py-4.5">
                    {/* Ảnh trong khối đã có viền và kẻ ngăn: nền radial của nó
                        đã sáng hơn nền khối, viền không phân tách thêm gì */}
                    {/* `rounded={false}` để bo của riêng ô này có hiệu lực: mức
                        mặc định của `PhotoFrame` là 12, mà đây là ảnh 66 nằm
                        lồng trong khối đã bo 8 — bậc trong phải nhỏ hơn bậc
                        ngoài, không thì hai đường cong chồng nhau. */}
                    <PhotoFrame
                      glyph="炭"
                      src={story.fireImageUrl}
                      bordered={false}
                      rounded={false}
                      className="size-16.5 flex-none rounded-sm"
                    />
                    <p className="min-w-0 text-[length:var(--fs-b1)] leading-relaxed text-ink-cream">
                      {story.fire}
                    </p>
                  </div>
                ) : null}
                {story.dip ? (
                  <div className="flex items-center gap-4.5 border-t border-accent/14 px-6 py-4.5">
                    {/* Cùng cỡ, cùng khối, ngay dưới ô than — nên cùng một bậc bo.
                        Trước đây ô này khai `rounded-full` nhưng mức mặc định của
                        `PhotoFrame` đè mất nên nó chưa bao giờ tròn. */}
                    <PhotoFrame
                      glyph="垂"
                      src={story.dipImageUrl}
                      bordered={false}
                      rounded={false}
                      className="size-16.5 flex-none rounded-sm"
                    />
                    <p className="min-w-0 text-[length:var(--fs-b1)] leading-relaxed text-ink-cream">
                      {story.dip}
                    </p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {story.note ? <NoteBox note={story.note} kanji="美味" /> : null}
          </div>
        </div>

        {/* Cột phải: tên, giá, hương vị, độ cắt, gia vị */}
        <div className="grid min-w-0 content-start gap-7 p-6 lg:px-11 lg:py-9">
          <div className="flex min-w-0 items-start gap-5 lg:gap-7">
            {story.chapterNo ? (
              <div className="mt-1.5 hidden lg:mx-2.5 lg:block">
                <Diamond size={78}>{story.chapterNo}</Diamond>
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[34px] leading-tight font-semibold tracking-[0.02em] text-gold-200 uppercase lg:text-[52px] lg:leading-[1.06]">
                {dish.nameVi}
              </h1>
              <div className="mt-3.5 flex flex-wrap items-center gap-4 lg:gap-5">
                {nameJa ? (
                  <p className="font-jp text-[length:var(--fs-t1)] tracking-[0.08em] text-accent-ink">
                    {nameJa}
                  </p>
                ) : null}
                {story.portionLabel ? (
                  <span className="inline-flex h-9.5 items-center border border-ink-hi px-4 font-display text-[length:var(--fs-t1)] font-semibold text-ink-hi">
                    {story.portionLabel}
                  </span>
                ) : null}
                <span className="font-mono text-[length:var(--fs-t2)] text-accent-ink lg:ml-auto lg:text-[length:var(--fs-t1)]">
                  {formatVnd(dish.price)}
                </span>
              </div>
            </div>
          </div>

          <p className="max-w-[660px] text-[length:var(--fs-b1)] leading-[1.85] text-ink-body">
            {story.intro ?? dish.longDesc ?? dish.shortDesc}
          </p>

          <GoldRule />

          {flavours.length > 0 ? (
            <div className="min-w-0">
              <SectionMark>Hương vị</SectionMark>
              <div className="mt-5 grid items-center gap-8 lg:grid-cols-[1fr_260px]">
                <div className="grid min-w-0 gap-4">
                  {flavours.map((flavour, i) => (
                    <div key={flavour} className="flex min-w-0 items-center gap-4">
                      {/* Khối nền thay vòng viền 55% — đường đậm nhất cả trang
                          đang thuộc về ô nhỏ nhất cả trang. Cùng lối với ô kanji
                          chặng và số chặng ở poster set. */}
                      <span className="grid size-8 flex-none place-items-center rounded-full bg-accent/16 font-jp text-[length:var(--fs-b2)] text-accent">
                        {['旨', '甘', '香', '合'][i] ?? '味'}
                      </span>
                      <span className="text-[length:var(--fs-b1)] leading-snug text-ink-cream">
                        {flavour}
                      </span>
                    </div>
                  ))}
                </div>
                {story.origin ? (
                  <div className="min-w-0">
                    <PhotoFrame
                      glyph={story.originKanji || '部'}
                      src={story.originImageUrl}
                      rounded={false}
                      className="h-[150px] rounded-md"
                    />
                    <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                      Vị trí:
                      <br />
                      {story.origin}
                    </p>
                  </div>
                ) : null}
              </div>
            </div>
          ) : null}

          {cuts.length > 0 ? (
            <div className="min-w-0">
              <SectionMark>{story.cutsLabel ?? 'Lựa chọn độ cắt'}</SectionMark>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {cuts.map((cut) => (
                  <div
                    key={cut.name}
                    /* Giữ viền nhưng hạ về tầng khối (14): ba ô này là thẻ dọc
                       cao 343 đứng cạnh nhau, mà `surface-1` trên `canvas` chỉ
                       đo 1,02:1 — bỏ viền là ba ô nhoè vào nhau thành một mảng. */
                    className="flex min-w-0 flex-col rounded-md border border-accent/14 bg-surface-1"
                  >
                    <div className="border-b border-accent/14 px-4 pt-4 pb-3.5 text-center">
                      <p className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.08em] text-gold-200 uppercase">
                        {cut.name}
                      </p>
                      <p className="mt-1.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {cut.size}
                      </p>
                    </div>
                    <DishGlyph
                      glyph={dishGlyph(dish)}
                      src={cut.imageUrl ?? dish.imageUrl}
                      alt={`${dish.nameVi} — ${cut.name}`}
                      size="sm"
                      className="h-[130px]"
                    />
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
          ) : null}

          {condiments.length > 0 ? (
            <div className="min-w-0 rounded-md bg-kraft p-6">
              <div className="flex items-center gap-3">
                <span className="font-jp text-[length:var(--fs-b1)] text-kraft-ink-2">✿</span>
                <span className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.14em] text-kraft-ink uppercase">
                  Gợi ý thưởng thức
                </span>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-4.5 lg:grid-cols-4">
                {condiments.map((cond) => (
                  <div key={cond.name} className="min-w-0">
                    {/* Nền đậm thay vòng viền: nền kraft sáng, ô tối — sắc độ đã
                        tách sẵn, vẽ thêm đường viền là kể lại một ranh giới mắt
                        đã nhìn thấy. Nâng 5→10 để ô không nhạt đi khi mất viền. */}
                    <div className="mx-auto grid size-22 place-items-center rounded-full bg-kraft-ink/10 font-jp text-[30px] text-kraft-ink-2">
                      {cond.kanji}
                    </div>
                    <p className="mt-3.5 text-center text-[length:var(--fs-c1)] font-bold tracking-[0.06em] text-kraft-ink uppercase">
                      {cond.name}
                    </p>
                    <p className="mt-2 text-[12.5px] leading-relaxed text-kraft-ink-2">
                      {cond.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <PosterFooter
          dish={dish}
          story={story}
          headline={`${dish.nameVi} — nguyên liệu quý`}
          badgeKanji="絶品"
          fallbackGlyph="火"
        />
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
  story: SiteDishStory
  courses: { label: string; kanji: string | null; items: { dishId: string; qty: number; portionLabel: string | null }[] }[]
  menu: Awaited<ReturnType<typeof getMenu>>
}) {
  const flow = story.flow ?? []
  const extras = (story.extraDishIds ?? [])
    .map((id) => findDish(menu, id))
    .filter((d): d is SiteDish => d !== undefined)
  const nameJa = story.nameJaFull ?? dish.nameJa

  /**
   * Ô nào chưa khai thì không chiếm chỗ trong lưới — lưới hai cột tự dồn lại.
   *
   * Vì số ô không còn cố định là bốn, đường kẻ phải suy từ vị trí thật: kẻ phải
   * chỉ khi BÊN PHẢI còn ô, kẻ dưới chỉ khi HÀNG DƯỚI còn ô. Cứng hoá "hai ô đầu
   * có kẻ dưới" là đúng với bốn ô và sai với ba.
   */
  const facts = [
    { v: story.portionLabel, l: 'Trong set' },
    { v: story.serves, l: 'Dành cho' },
    { v: story.duration, l: 'Thời lượng' },
    { v: dish.nameJa, l: 'Tên gọi', jp: true },
  ].filter((cell) => Boolean(cell.v))
  const lastRow = Math.floor((facts.length - 1) / 2)

  return (
    <section className="mx-auto max-w-[1280px] px-5 pt-6 lg:px-10 lg:pt-7">
      {/* `overflow-hidden` bắt buộc đi kèm: ảnh món nằm `absolute inset-0` trong
          cột trái, chạm cả ba mép — không cắt thì góc vuông của ảnh thò ra
          ngoài đường viền đã bo. Ô ghép trong lưới poster (bảng thông số, dải
          chân) cũng nhờ đó mà được xén tròn theo khung. */}
      <div className="grid overflow-hidden rounded-lg border border-accent/30 bg-canvas lg:grid-cols-[456px_1fr]">
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
            <DishGlyph
              glyph={dishGlyph(dish)}
              src={dish.imageUrl}
              alt={dish.nameVi}
              size="lg"
              className="absolute inset-0"
            />
            {dish.nameJa ? (
              <span className="pointer-events-none absolute top-6 left-6 font-jp text-[30px] tracking-[0.18em] text-ink-hi [writing-mode:vertical-rl]">
                {dish.nameJa}
              </span>
            ) : null}
          </div>

          <div className="grid flex-none gap-5 p-6 lg:px-8 lg:pb-8">
            {facts.length > 0 ? (
              /* Chỉ còn KẺ TRONG, bỏ viền ngoài: kẻ trong phân tách bốn ô nên có
                 nghĩa, còn viền ngoài chỉ là lưới vẽ trong một cột poster vốn đã
                 có viền của nó. */
              <div className="grid grid-cols-2">
                {facts.map((cell, i) => (
                  <div
                    key={cell.l}
                    className={`px-4 py-4 ${
                      i % 2 === 0 && i + 1 < facts.length ? 'border-r border-accent/14' : ''
                    } ${Math.floor(i / 2) < lastRow ? 'border-b border-accent/14' : ''}`}
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
            ) : null}

            {flow.length > 0 ? (
              <div className="rounded-md border border-accent/18 bg-[linear-gradient(180deg,#1A1408_0%,var(--sora-surface-2)_100%)]">
                <p className="px-6 pt-5 pb-4 text-center font-display text-[length:var(--fs-t1)] leading-tight font-semibold text-gold-200">
                  BỮA ĂN DIỄN RA
                  <br />
                  THEO THỨ TỰ NÀY
                </p>
                <ol className="grid gap-3.5 border-t border-accent/14 px-6 py-4.5">
                  {flow.map((step, i) => (
                    <li key={step} className="flex min-w-0 items-start gap-3.5">
                      {/* Số chặng: khối nền thay vòng viền 50% — xem chú ở ô
                          kanji chặng về phân cấp ngược */}
                      <span className="mt-0.5 grid size-6.5 flex-none place-items-center rounded-full bg-accent/16 font-mono text-[length:var(--fs-c2)] text-accent">
                        {i + 1}
                      </span>
                      <p className="min-w-0 text-[length:var(--fs-b2)] leading-relaxed text-ink-cream">
                        {step}
                      </p>
                    </li>
                  ))}
                </ol>
              </div>
            ) : null}

            {story.note ? <NoteBox note={story.note} kanji="御膳" /> : null}
          </div>
        </div>

        <div className="grid min-w-0 content-start gap-7 p-6 lg:px-11 lg:py-9">
          <div className="flex min-w-0 items-start gap-5 lg:gap-7">
            {story.chapterNo ? (
              <div className="mt-1.5 hidden lg:mx-2.5 lg:block">
                <Diamond size={78}>{story.chapterNo}</Diamond>
              </div>
            ) : null}
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-[34px] leading-tight font-semibold tracking-[0.02em] text-gold-200 uppercase lg:text-[52px] lg:leading-[1.06]">
                {dish.nameVi}
              </h1>
              <div className="mt-3.5 flex flex-wrap items-center gap-4">
                {nameJa ? (
                  <p className="font-jp text-[length:var(--fs-t1)] tracking-[0.08em] text-accent-ink">
                    {nameJa}
                  </p>
                ) : null}
                {story.portionLabel ? (
                  <span className="inline-flex h-9 items-center border border-ink-hi px-3.5 font-display text-[19px] font-semibold text-ink-hi">
                    {story.portionLabel}
                  </span>
                ) : null}
                <span className="font-mono text-[length:var(--fs-t1)] text-accent-ink lg:ml-auto">
                  {formatVnd(dish.price)}
                </span>
              </div>
              <div className="mt-3.5 flex flex-wrap gap-6">
                {story.serves ? (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    Dành cho <span className="text-ink-cream">{story.serves}</span>
                  </span>
                ) : null}
                {story.duration ? (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    Thời lượng <span className="text-ink-cream">{story.duration}</span>
                  </span>
                ) : null}
              </div>
            </div>
          </div>

          <p className="max-w-[680px] text-[length:var(--fs-b1)] leading-[1.85] text-ink-body">
            {story.intro ?? dish.longDesc ?? dish.shortDesc}
          </p>

          <GoldRule />

          {courses.length > 0 ? (
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
                      {/* Khối nền thay hộp viền 45%: ô kanji 30×30 là chi tiết
                          nhỏ nhất màn hình mà đang có đường đậm hơn cả viền
                          poster bao quanh cả trang (30%) — phân cấp ngược */}
                      <span className="grid size-7.5 flex-none place-items-center bg-accent/14 font-jp text-[length:var(--fs-b2)] text-accent-ink">
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
                            /* MỘT vạch thay bốn cạnh. Mười lăm dòng món là sáu
                               mươi cạnh — gần một phần tư số đường của cả trang,
                               mà mỗi hộp lại nằm lồng trong cột poster đã có
                               viền của nó.
                               Vạch chứ không phải bỏ trắng: `surface-1` trên nền
                               `canvas` của poster chỉ đo 1,02:1, bỏ hết viền thì
                               dòng món biến mất sạch. Vạch trái 45% vừa đủ rõ,
                               vừa cho danh sách một nhịp dọc như thực đơn in. */
                            className="flex min-w-0 items-center gap-4 rounded-md border-l border-accent/45 bg-surface-1 px-3.5 py-3 transition-colors hover:border-accent hover:bg-surface-3"
                          >
                            {/* Ảnh KHÔNG viền: nó nằm sâu 14 trong một khối đã
                                tách khỏi nền, viền của nó không phân tách gì */}
                            <DishGlyph
                              glyph={dishGlyph(itemDish)}
                              src={itemDish.imageUrl}
                              alt={itemDish.nameVi}
                              size="sm"
                              className="size-15.5 flex-none rounded-sm"
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
          ) : null}

          {extras.length > 0 ? (
            <div className="min-w-0 rounded-md bg-kraft p-6">
              <div className="flex items-center gap-3">
                <span className="font-jp text-[length:var(--fs-b1)] text-kraft-ink-2">✿</span>
                <span className="font-display text-[length:var(--fs-t1)] font-semibold tracking-[0.14em] text-kraft-ink uppercase">
                  Gọi thêm cho vừa miệng
                </span>
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-3">
                {extras.map((extra) => (
                  <Link key={extra.id} href={`/thuc-don/${extra.id}`} className="flex min-w-0 items-center gap-3.5">
                    {extra.imageUrl ? (
                      <DishGlyph
                        glyph={dishGlyph(extra)}
                        src={extra.imageUrl}
                        alt={extra.nameVi}
                        size="sm"
                        className="size-15.5 flex-none rounded-sm"
                      />
                    ) : (
                      /* Nền kraft sáng, ô chữ tối — đã tách nhau bằng sắc độ,
                         thêm viền chỉ là vẽ lại ranh giới đã nhìn thấy */
                      <div className="grid size-15.5 flex-none place-items-center rounded-sm bg-kraft-ink/8 font-jp text-[26px] text-kraft-ink-2">
                        {dishGlyph(extra)}
                      </div>
                    )}
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

        <PosterFooter
          dish={dish}
          story={story}
          headline={`${dish.nameVi} — bữa dọn sẵn`}
          badgeKanji="満足"
          fallbackGlyph="宴"
        />
      </div>
    </section>
  )
}

// ------------------------------------------------------------------ Món thường

function PlainPoster({ dish }: { dish: SiteDish }) {
  return (
    <section className="mx-auto max-w-[1280px] px-5 pt-6 lg:px-10 lg:pt-7">
      {/* 30 như hai poster kia: đây là cùng một khung, không có cớ gì món thường
          vẽ nhạt hơn món có bài viết */}
      <div className="grid overflow-hidden rounded-lg border border-accent/30 bg-canvas lg:grid-cols-[560px_1fr]">
        <div className="relative min-h-[260px] border-accent/16 lg:min-h-[420px] lg:border-r">
          <DishGlyph
            glyph={dishGlyph(dish)}
            src={dish.imageUrl}
            alt={dish.nameVi}
            size="lg"
            className="absolute inset-0"
          />
          {dish.nameJa ? (
            <span className="pointer-events-none absolute top-6 left-6 font-jp text-[28px] tracking-[0.18em] text-ink-hi opacity-90 [writing-mode:vertical-rl]">
              {dish.nameJa}
            </span>
          ) : null}
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

// -------------------------------------------------------------- khối dùng lại

/** Khối viền đỏ "Lưu ý" — cùng một khối ở cả poster món và poster set */
function NoteBox({ note, kanji }: { note: string; kanji: string }) {
  return (
    <div className="flex gap-4 rounded-md border border-danger-line-2 px-5 py-4.5">
      <div className="min-w-0 flex-1">
        <p className="text-[length:var(--fs-c1)] font-semibold tracking-[0.2em] text-danger uppercase">
          Lưu ý
        </p>
        <p className="mt-2.5 text-[length:var(--fs-b2)] leading-[1.75] text-ink-body">{note}</p>
      </div>
      <span className="grid w-8 flex-none place-items-center border border-danger-line font-jp text-[length:var(--fs-c1)] tracking-[0.16em] text-danger [writing-mode:vertical-rl]">
        {kanji}
      </span>
    </div>
  )
}

/**
 * Dải chân poster: nguồn nguyên liệu, khẩu hiệu, ảnh, câu kết.
 *
 * Bốn ô đều rỗng được. Chỉ khi rỗng CẢ BỐN thì bỏ hẳn dải — còn lại vẫn vẽ để
 * viền dưới của poster không hụt mất một cạnh.
 */
function PosterFooter({
  dish,
  story,
  headline,
  badgeKanji,
  fallbackGlyph,
}: {
  dish: SiteDish
  story: SiteDishStory
  headline: string
  badgeKanji: string
  fallbackGlyph: string
}) {
  const hasBanner = Boolean(story.bannerJa || story.bannerVi)
  if (!story.craft && !hasBanner && !story.closing && !story.footerImageUrl) return null

  return (
    <div className="grid border-t border-accent/18 lg:col-span-2 lg:grid-cols-[1fr_290px_320px_1fr]">
      <div className="flex min-w-0 items-start gap-3.5 p-6 lg:px-8">
        <span className="mt-0.5 flex-none font-jp text-[length:var(--fs-b1)] text-danger">❁</span>
        <div className="min-w-0">
          <p className="font-display text-[21px] font-semibold tracking-[0.08em] text-gold-200 uppercase">
            {headline}
          </p>
          {story.craft ? (
            <p className="mt-2.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              {story.craft}
            </p>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 items-center gap-3.5 border-t border-accent/14 p-6 lg:border-t-0 lg:border-l lg:px-6">
        <div className="min-w-0">
          {story.bannerJa ? (
            <p className="font-jp text-[26px] text-accent-ink">{story.bannerJa}</p>
          ) : null}
          {story.bannerVi ? (
            <p className="mt-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.14em] text-ink-mute">
              {story.bannerVi}
            </p>
          ) : null}
        </div>
        <span className="grid w-7.5 flex-none place-items-center border border-danger-line py-1.5 font-jp text-[length:var(--fs-c2)] tracking-[0.14em] text-danger [writing-mode:vertical-rl]">
          {badgeKanji}
        </span>
      </div>
      <PhotoFrame
        glyph={fallbackGlyph}
        src={story.footerImageUrl ?? dish.imageUrl}
        alt={dish.nameVi}
        rounded={false}
        className="min-h-[130px] border-0 border-t border-accent/14 lg:border-t-0 lg:border-l"
      />
      <div className="flex min-w-0 items-center border-t border-accent/14 p-6 lg:border-t-0 lg:px-8">
        {story.closing ? (
          <p className="font-display text-[19px] leading-snug text-gold-200 italic">
            {story.closing}
          </p>
        ) : null}
      </div>
    </div>
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
