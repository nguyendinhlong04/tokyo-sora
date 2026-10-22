import type { DishStory } from '@sora/contracts'
import { Money } from '@sora/ui'
import { OptimizedImage } from '@sora/ui/image'
import { useEffect, type ReactNode } from 'react'
import type { Dish } from '../api'
import { IconClose, IconPlus } from '../icons'
import type { SetExtra } from '../menu'
import type { Stories } from '../stories'
import { DishLine } from './DishLine'

/** Chữ Nhật đầu dòng hương vị — cùng bộ chữ trang món trên web dùng */
const FLAVOUR_KANJI = ['旨', '甘', '香', '合']

/**
 * "Bí quyết thưởng thức" — trang món của web (W3) dựng lại cho iPad nằm ngang.
 *
 * Cùng một nội dung với tokyo-sora.vn/thuc-don/<món>, cùng nguồn (Office M1):
 * món nướng kể cách nướng, cách chấm, độ cắt, gia vị; set kể nhịp bữa và từng
 * chặng. Bố cục là hai cột như poster của web — cột trái đứng yên (ảnh, lửa,
 * lưu ý), cột phải cuộn — vì màn ngang không có chỗ cho poster dài một cột.
 *
 * Giá lấy từ bundle của chi nhánh chứ không từ trang web: web in giá gốc của
 * danh mục, còn bàn phải in đúng giá sẽ lên đơn.
 */
export function StoryDialog({
  dish,
  story,
  stories,
  soldOut,
  more,
  onOrder,
  onOpenDish,
  onQuickAdd,
  onClose,
}: {
  dish: Dish
  story: DishStory
  stories: Stories
  soldOut: boolean
  /** Món dùng kèm (món lẻ) hoặc gọi thêm cho vừa miệng (set) — đã lọc món gọi được */
  more: SetExtra[]
  onOrder: (from: HTMLElement) => void
  onOpenDish: (dish: Dish) => void
  onQuickAdd: (dish: Dish, from: HTMLElement) => void
  onClose: () => void
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const isSet = dish.kind === 'set'
  const seal = isSet ? '御膳' : '美味'
  const jaFull = story.nameJaFull ?? dish.nameJa
  const intro = story.intro ?? stories.siteDish(dish.id)?.longDesc ?? dish.shortDesc
  const courses = isSet ? (stories.setOf(dish.id)?.courses ?? []) : []
  const facts = [
    { v: story.portionLabel, l: 'Trong set', jp: false },
    { v: story.serves, l: 'Dành cho', jp: false },
    { v: story.duration, l: 'Thời lượng', jp: false },
    { v: dish.nameJa, l: 'Tên gọi', jp: true },
  ].filter((f) => Boolean(f.v))
  const hasFoot = Boolean(story.craft || story.bannerJa || story.bannerVi || story.closing)

  return (
    <div className="fixed inset-0 z-[105]">
      <button
        type="button"
        aria-label="Đóng bí quyết thưởng thức"
        onClick={onClose}
        className="absolute inset-0 bg-canvas/82 animate-[sora-fade_var(--dur-panel)_var(--ease-sora)]"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Bí quyết thưởng thức — ${dish.nameVi}`}
        className="absolute inset-5 grid grid-cols-[330px_minmax(0,1fr)] overflow-hidden rounded-lg border border-accent/22 bg-surface-1 animate-[sora-rise_var(--dur-sheet)_var(--ease-sora)]"
      >
        {/* Cột trái: ảnh, cách nướng hoặc nhịp bữa, lưu ý */}
        <div className="overflow-y-auto overscroll-contain border-r border-accent/16 bg-surface-2 pb-4.5 [scrollbar-width:none]">
          <div className="px-5.5 pt-5 pb-4">
            <p className="font-display text-[length:var(--fs-t1)] leading-tight font-semibold tracking-[0.06em] text-ink-hi">
              TOKYO SORA
            </p>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.16em] text-ink-mute">
                {isSet ? 'SET · 御膳' : 'YAKINIKU · RAMEN · IZAKAYA'}
              </span>
              <Seal>{seal}</Seal>
            </div>
          </div>

          <div
            aria-hidden
            className="relative grid h-[270px] place-items-center border-y border-accent/16 bg-[radial-gradient(120%_100%_at_50%_30%,var(--sora-line-1)_0%,var(--sora-surface-4)_70%)]"
          >
            {dish.imageUrl ? (
              // Ô 329×268, ảnh 263×214 — tấm 640 cho màn mật độ 2×, qua bộ tối ưu (§8.1)
              <OptimizedImage
                src={dish.imageUrl}
                widths={[384, 640]}
                sizes="263px"
                alt=""
                eager
                width={400}
                height={300}
                className="h-[80%] w-[80%] object-contain drop-shadow-lg"
              />
            ) : (
              <span className="grid aspect-[1.4/1] w-[70%] place-items-center rounded-pill border border-accent/12 bg-[radial-gradient(closest-side,color-mix(in_srgb,var(--sora-line-4)_60%,transparent),color-mix(in_srgb,var(--sora-line-1)_25%,transparent))]">
                <span className="font-jp text-[72px] leading-none text-gold-700">
                  {dish.kana ?? '空'}
                </span>
              </span>
            )}
            <span className="absolute top-4.5 left-5 flex gap-2.5">
              {!isSet && story.originKanji ? (
                <span className="font-jp text-[length:var(--fs-b1)] tracking-[0.12em] text-gold-300 [writing-mode:vertical-rl]">
                  {story.originKanji}
                </span>
              ) : null}
              {dish.nameJa ? (
                <span className="font-jp text-[26px] tracking-[0.08em] text-ink-hi [writing-mode:vertical-rl]">
                  {dish.nameJa}
                </span>
              ) : null}
            </span>
          </div>

          {!isSet && (story.fire || story.dip) ? (
            <Panel title={['Ngon theo cách', 'đơn giản nhất']} className="mt-4">
              {story.fire ? <GlyphRow glyph="炭">{story.fire}</GlyphRow> : null}
              {story.dip ? <GlyphRow glyph="垂">{story.dip}</GlyphRow> : null}
            </Panel>
          ) : null}

          {isSet && facts.length > 0 ? (
            <div className="mx-4.5 mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-accent/18 bg-accent/18">
              {facts.map((f, i) => (
                <div
                  key={f.l}
                  className={[
                    'bg-surface-3 px-3.5 py-3',
                    // Số ô lẻ thì ô cuối trải cả hàng, không để lộ một ô trống
                    facts.length % 2 === 1 && i === facts.length - 1 ? 'col-span-2' : '',
                  ].join(' ')}
                >
                  <p
                    className={
                      f.jp
                        ? 'font-jp text-[length:var(--fs-t2)] leading-tight text-ink-hi'
                        : 'font-display text-[length:var(--fs-t1)] leading-tight font-semibold text-ink-hi'
                    }
                  >
                    {f.v}
                  </p>
                  <p className="mt-1 text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                    {f.l}
                  </p>
                </div>
              ))}
            </div>
          ) : null}

          {isSet && (story.flow ?? []).length > 0 ? (
            <Panel title={['Bữa ăn diễn ra', 'theo thứ tự này']}>
              {(story.flow ?? []).map((step, i) => (
                <div key={step} className="flex gap-3 border-t border-line-1 px-3.5 py-2.5">
                  <span className="grid h-6.5 w-6.5 flex-none place-items-center rounded-sm border border-accent/18 bg-surface-4 font-mono text-[length:var(--fs-b2)] text-gold-300">
                    {i + 1}
                  </span>
                  <span className="text-[length:var(--fs-b2)] leading-normal text-ink-cream">
                    {step}
                  </span>
                </div>
              ))}
            </Panel>
          ) : null}

          {story.note ? (
            <div className="mx-4.5 mt-3 flex gap-3 rounded-md border border-danger/50 bg-danger/6 px-3.5 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-[length:var(--fs-c1)] font-bold tracking-[0.14em] text-ink-hi uppercase">
                  Lưu ý
                </p>
                <p className="mt-1 text-[length:var(--fs-b2)] leading-[1.55] text-ink-body">
                  {story.note}
                </p>
              </div>
              <Seal>{seal}</Seal>
            </div>
          ) : null}
        </div>

        {/* Cột phải: tên, giá, lời dẫn, rồi phần kể riêng của món hay của set */}
        <div className="overflow-y-auto overscroll-contain px-7 pt-6 pb-7 [scrollbar-width:none]">
          <div className="flex items-center gap-4 pr-11">
            {story.chapterNo ? (
              <span aria-hidden className="grid h-13.5 w-13.5 flex-none place-items-center">
                <span className="grid h-9.5 w-9.5 rotate-45 place-items-center bg-accent-strong">
                  <span className="-rotate-45 font-display text-[length:var(--fs-t2)] font-semibold text-on-accent">
                    {story.chapterNo}
                  </span>
                </span>
              </span>
            ) : null}
            <div className="min-w-0">
              <h2 className="font-display text-[length:var(--fs-d3)] leading-[1.05] font-semibold tracking-[0.04em] text-gold-200 uppercase">
                {dish.nameVi}
              </h2>
              {jaFull ? (
                <p
                  lang="ja"
                  className="mt-1.5 font-jp text-[length:var(--fs-b1)] tracking-[0.08em] text-gold-300"
                >
                  {jaFull}
                </p>
              ) : null}
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            {story.portionLabel ? (
              <span className="flex h-8 items-center rounded-sm border border-ink-body px-3 font-display text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                {story.portionLabel}
              </span>
            ) : null}
            <Money amount={dish.price} className="text-[length:var(--fs-t2)] text-gold-300" />
            {isSet && (story.serves || story.duration) ? (
              <span className="text-[length:var(--fs-c1)] text-ink-mute">
                {[story.serves ? `Dành cho ${story.serves}` : null, story.duration]
                  .filter(Boolean)
                  .join(' · ')}
              </span>
            ) : null}
            <div className="flex-1" />
            <button
              type="button"
              disabled={soldOut}
              onClick={(e) => onOrder(e.currentTarget)}
              className={[
                'flex h-11 items-center gap-2 rounded-sm border px-4 text-[length:var(--fs-b2)] font-semibold',
                soldOut
                  ? 'border-line-1 bg-line-1 text-ink-mute'
                  : 'border-accent/45 text-gold-200',
              ].join(' ')}
            >
              <IconPlus size={16} stroke={1.8} />
              {soldOut ? 'Đã hết' : 'Gọi món này'}
            </button>
          </div>

          {intro ? (
            <p className="mt-4 max-w-[620px] text-[length:var(--fs-b2)] leading-[1.75] text-ink-body">
              {intro}
            </p>
          ) : null}
          {dish.allergens && dish.allergens.length > 0 ? (
            <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
              Dị ứng: <span className="text-ink-body">{dish.allergens.join(', ')}</span>
            </p>
          ) : null}
          <div className="my-5 h-px bg-accent/16" />

          {!isSet && (story.flavours ?? []).length > 0 ? (
            <>
              <SectionMark>Hương vị</SectionMark>
              <div className="grid grid-cols-[minmax(0,1fr)_220px] items-start gap-4">
                <div className="grid gap-2">
                  {(story.flavours ?? []).map((flavour, i) => (
                    <div key={flavour} className="flex items-center gap-3">
                      <span
                        aria-hidden
                        className="grid h-7.5 w-7.5 flex-none place-items-center rounded-sm border border-accent/18 bg-surface-4 font-jp text-[15px] text-gold-300"
                      >
                        {FLAVOUR_KANJI[i] ?? '味'}
                      </span>
                      <span className="text-[length:var(--fs-b2)] text-ink-body">{flavour}</span>
                    </div>
                  ))}
                </div>
                {story.origin ? (
                  <div className="rounded-md border border-accent/16 bg-surface-3 p-3.5">
                    {story.originKanji ? (
                      <p
                        aria-hidden
                        className="font-jp text-[length:var(--fs-t1)] leading-tight text-gold-300"
                      >
                        {story.originKanji}
                      </p>
                    ) : null}
                    <p className="mt-2 text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                      Vị trí
                    </p>
                    <p className="mt-0.5 text-[length:var(--fs-b2)] leading-normal text-ink-body">
                      {story.origin}
                    </p>
                  </div>
                ) : null}
              </div>
            </>
          ) : null}

          {!isSet && (story.cuts ?? []).length > 0 ? (
            <>
              <SectionMark className="mt-6">{story.cutsLabel ?? 'Lựa chọn độ cắt'}</SectionMark>
              <div className="grid grid-cols-3 gap-3">
                {(story.cuts ?? []).map((cut) => (
                  <div
                    key={cut.name}
                    className="flex flex-col overflow-hidden rounded-md border border-accent/16 bg-surface-3"
                  >
                    <div className="px-3 pt-3 pb-2.5 text-center">
                      <p className="font-display text-[length:var(--fs-t2)] font-semibold tracking-[0.08em] text-gold-200 uppercase">
                        {cut.name}
                      </p>
                      <p className="mt-0.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {cut.size}
                      </p>
                    </div>
                    <div
                      aria-hidden
                      className="grid aspect-video place-items-center bg-[radial-gradient(120%_100%_at_50%_20%,var(--sora-line-1)_0%,var(--sora-surface-4)_74%)]"
                    >
                      <span className="font-jp text-[26px] text-gold-900">{dish.kana ?? '空'}</span>
                    </div>
                    <p className="flex-1 px-3 py-2.5 text-[length:var(--fs-c1)] leading-normal text-ink-body">
                      {cut.desc}
                    </p>
                    <div className="flex items-center justify-between gap-2 px-3 pb-3">
                      <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.08em] text-ink-mute uppercase">
                        Độ mềm
                      </span>
                      <span
                        role="img"
                        aria-label={`Độ mềm ${cut.soft} trên 4`}
                        className="flex gap-[3px]"
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <span
                            key={n}
                            className={[
                              'h-1 w-4 rounded-[1px]',
                              n <= cut.soft ? 'bg-accent' : 'bg-line-3',
                            ].join(' ')}
                          />
                        ))}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {!isSet && (story.condiments ?? []).length > 0 ? (
            <div className="mt-5.5 rounded-md bg-kraft px-4.5 pt-4 pb-4.5">
              <p className="flex items-center gap-2 font-display text-[length:var(--fs-t2)] font-semibold tracking-[0.14em] text-kraft-ink uppercase">
                <span aria-hidden>✿</span>
                Gợi ý thưởng thức
              </p>
              <div className="mt-3.5 grid grid-cols-4 gap-3">
                {(story.condiments ?? []).map((c) => (
                  <div key={c.name} className="text-center">
                    <span
                      aria-hidden
                      className="mx-auto grid h-14 w-14 place-items-center rounded-pill bg-kraft-ink/10 font-jp text-[length:var(--fs-t1)] text-kraft-ink"
                    >
                      {c.kanji}
                    </span>
                    <p className="mt-2.5 text-[length:var(--fs-c1)] font-bold tracking-[0.06em] text-kraft-ink uppercase">
                      {c.name}
                    </p>
                    <p className="mt-1 text-[length:var(--fs-c1)] leading-snug text-kraft-ink-2">
                      {c.desc}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          {isSet && courses.length > 0 ? (
            <>
              <SectionMark>Trong set có gì</SectionMark>
              <p className="-mt-1.5 mb-3.5 text-[length:var(--fs-c1)] text-ink-mute">
                Nhân viên mang ra từng chặng theo nhịp bếp.
              </p>
              <div className="grid gap-3.5">
                {courses.map((course) => (
                  <div key={course.label}>
                    <div className="mb-1.5 flex items-center gap-2.5">
                      {course.kanji ? (
                        <span
                          aria-hidden
                          className="grid h-7.5 w-7.5 flex-none place-items-center rounded-sm border border-accent/18 bg-surface-4 font-jp text-[15px] text-gold-300"
                        >
                          {course.kanji}
                        </span>
                      ) : null}
                      <span className="font-display text-[length:var(--fs-b1)] font-semibold tracking-[0.1em] text-gold-200 uppercase">
                        {course.label}
                      </span>
                      <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {course.items.length} món
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2 pl-10">
                      {course.items.map((item) => {
                        const d = stories.siteDish(item.dishId)
                        return (
                          <div
                            key={item.dishId}
                            className="flex items-center gap-2.5 rounded-md border border-line-1 bg-surface-3 px-2.5 py-2"
                          >
                            <span
                              aria-hidden
                              className="grid h-9 w-9 flex-none place-items-center rounded-sm bg-[radial-gradient(120%_100%_at_50%_20%,var(--sora-line-1)_0%,var(--sora-surface-4)_74%)] font-jp text-[17px] text-gold-700"
                            >
                              {d?.kana ?? '空'}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                                {d?.nameVi ?? item.dishId}
                              </span>
                              {d?.nameJa ? (
                                <span
                                  lang="ja"
                                  className="block font-jp text-[length:var(--fs-c1)] text-ink-mute"
                                >
                                  {d.nameJa}
                                </span>
                              ) : null}
                            </span>
                            <span className="flex-none font-mono text-[length:var(--fs-c1)] text-ink-mute">
                              {item.portionLabel ?? `${item.qty} phần`}
                            </span>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {hasFoot ? (
            <>
              <div className="mt-6 grid grid-cols-2 gap-4.5 border-t border-accent/16 pt-4.5">
                <div>
                  <p className="font-display text-[length:var(--fs-t2)] font-semibold tracking-[0.06em] text-gold-200 uppercase">
                    ❁ {dish.nameVi} {isSet ? '— bữa dọn sẵn' : '— nguyên liệu quý'}
                  </p>
                  {story.craft ? (
                    <p className="mt-1.5 text-[length:var(--fs-c1)] leading-normal text-ink-mute">
                      {story.craft}
                    </p>
                  ) : null}
                </div>
                <div>
                  {story.bannerJa ? (
                    <p
                      lang="ja"
                      className="font-jp text-[length:var(--fs-t1)] leading-tight text-gold-200"
                    >
                      {story.bannerJa}
                    </p>
                  ) : null}
                  {story.bannerVi ? (
                    <p className="mt-1 text-[length:var(--fs-c1)] font-semibold tracking-[0.12em] text-ink-mute">
                      {story.bannerVi}
                    </p>
                  ) : null}
                </div>
              </div>
              {story.closing ? (
                <p className="mt-4 font-display text-[length:var(--fs-t1)] leading-snug font-light text-ink-body">
                  {story.closing}
                </p>
              ) : null}
            </>
          ) : null}

          {more.length > 0 ? (
            <>
              <SectionMark className="mt-6">
                {isSet ? 'Gọi thêm cho vừa miệng' : 'Dùng kèm'}
              </SectionMark>
              <div className="grid grid-cols-2 gap-2">
                {more.map((m) => (
                  <DishLine
                    key={m.dish.id}
                    dish={m.dish}
                    meta={m.dish.nameJa ?? ''}
                    soldOut={false}
                    needsChoice={m.needsChoice}
                    onOpen={() => onOpenDish(m.dish)}
                    onAdd={(from) => onQuickAdd(m.dish, from)}
                  />
                ))}
              </div>
            </>
          ) : null}
        </div>

        <button
          type="button"
          aria-label="Đóng"
          onClick={onClose}
          className="absolute top-2.5 right-2.5 grid h-11 w-11 place-items-center rounded-sm text-ink-body"
        >
          <IconClose size={20} />
        </button>
      </div>
    </div>
  )
}

/** Dấu triện đỏ nhỏ — chỉ trang trí, chữ trong đó có sẵn trong bộ font tự host */
function Seal({ children }: { children: string }) {
  return (
    <span
      aria-hidden
      className="grid h-[30px] w-[30px] flex-none place-items-center border border-danger font-jp text-[length:var(--fs-c2)] leading-[1.05] text-danger"
    >
      {children}
    </span>
  )
}

function Panel({
  title,
  className = 'mt-3',
  children,
}: {
  title: [string, string]
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={[
        'mx-4.5 overflow-hidden rounded-md border border-accent/18 bg-surface-3',
        className,
      ].join(' ')}
    >
      <p className="px-4 pt-3.5 pb-2.5 text-center font-display text-[length:var(--fs-t2)] leading-tight font-semibold text-gold-200">
        {title[0]}
        <br />
        {title[1]}
      </p>
      {children}
    </div>
  )
}

function GlyphRow({ glyph, children }: { glyph: string; children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 border-t border-line-1 px-3.5 py-2.5">
      <span
        aria-hidden
        className="grid h-10 w-10 flex-none place-items-center rounded-sm border border-accent/18 bg-surface-4 font-jp text-[length:var(--fs-t1)] text-gold-300"
      >
        {glyph}
      </span>
      <span className="text-[length:var(--fs-b2)] leading-normal text-ink-cream">{children}</span>
    </div>
  )
}

function SectionMark({ children, className = '' }: { children: string; className?: string }) {
  return (
    <p
      className={[
        'mb-3 flex items-center gap-2 font-display text-[length:var(--fs-t2)] font-semibold tracking-[0.14em] text-gold-200 uppercase',
        className,
      ].join(' ')}
    >
      <span aria-hidden className="text-accent">
        ✿
      </span>
      {children}
    </p>
  )
}
