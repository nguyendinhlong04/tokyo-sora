import type { Metadata } from 'next'
import Link from 'next/link'
import { Eyebrow, PhotoFrame } from '../../../components/visuals'
import { STORY } from '../../../content/site'

export const metadata: Metadata = {
  title: 'Câu chuyện',
  description:
    'Từ một quán mười hai ghế ở Nakameguro tới Việt Nam. Than đốt trước bốn mươi phút, thịt cắt trong ngày.',
  alternates: { canonical: '/ve-chung-toi' },
}

/** W4 — Câu chuyện. Trang chữ: đọc được là chính, ảnh chỉ để thở. */
export default function StoryPage() {
  return (
    <>
      <section className="mx-auto max-w-[1280px] px-5 pt-16 lg:px-10 lg:pt-24">
        <span className="font-jp text-[length:var(--fs-b1)] tracking-[0.3em] text-accent">
          {STORY.kanji}
        </span>
        <h1 className="mt-5 max-w-[760px] font-display text-[38px] leading-[1.1] font-light text-ink-hi lg:text-[length:var(--fs-d1)]">
          {STORY.title}
        </h1>
        <p className="mt-7 max-w-[640px] text-[length:var(--fs-t2)] leading-[1.75] text-ink-body">
          {STORY.lead}
        </p>
      </section>

      <section className="mx-auto max-w-[1280px] px-5 pt-12 lg:px-10 lg:pt-20">
        <PhotoFrame glyph="店" className="aspect-video w-full" />
        <p className="mt-4 text-[length:var(--fs-c1)] text-ink-mute">{STORY.caption}</p>
      </section>

      <section className="mx-auto max-w-[640px] px-5 pt-14 lg:pt-24">
        {STORY.body.map((paragraph, i) => (
          <p
            key={paragraph.slice(0, 24)}
            className={`text-[17px] leading-[1.85] text-ink-body ${i > 0 ? 'mt-7' : ''}`}
          >
            {paragraph}
          </p>
        ))}
      </section>

      <section className="mx-auto max-w-[1280px] px-5 py-16 lg:px-10 lg:py-24">
        <figure className="border-y border-accent/16 py-14 text-center lg:py-20">
          <p className="font-jp text-[length:var(--fs-b1)] tracking-[0.2em] text-ink-mute">— 炭 —</p>
          <blockquote className="mx-auto mt-8 max-w-[720px] font-display text-[length:var(--fs-t1)] leading-[1.5] font-light text-ink-hi italic lg:text-[length:var(--fs-d3)]">
            {STORY.quote}
          </blockquote>
          <figcaption className="mt-7 text-[length:var(--fs-b2)] text-ink-mute">
            {STORY.quoteBy}
          </figcaption>
        </figure>
      </section>

      <section className="mx-auto max-w-[1280px] px-5 pb-16 lg:px-10 lg:pb-24">
        <div className="grid items-center gap-10 lg:grid-cols-2 lg:gap-20">
          <PhotoFrame glyph="炭" className="aspect-[4/3]" />
          <div>
            <h2 className="font-display text-[30px] leading-tight font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
              {STORY.charcoal.title}
            </h2>
            {STORY.charcoal.body.map((paragraph, i) => (
              <p
                key={paragraph.slice(0, 24)}
                className={`text-[length:var(--fs-b1)] leading-[1.8] text-ink-body ${
                  i === 0 ? 'mt-6' : 'mt-5'
                }`}
              >
                {paragraph}
              </p>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-[1280px] px-5 pb-20 lg:px-10 lg:pb-32">
        <div className="grid items-start gap-10 border-t border-accent/16 pt-12 lg:grid-cols-[420px_1fr] lg:gap-20 lg:pt-24">
          <PhotoFrame glyph="翔" className="aspect-[4/5]" />
          <div>
            <Eyebrow>Bếp trưởng</Eyebrow>
            <h2 className="mt-4 font-display text-[30px] font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
              {STORY.chef.name}
            </h2>
            <p className="mt-2.5 font-jp text-[length:var(--fs-b1)] tracking-[0.12em] text-accent-ink">
              {STORY.chef.nameJa}
            </p>
            <p className="mt-7 max-w-[520px] text-[length:var(--fs-b1)] leading-[1.8] text-ink-body">
              {STORY.chef.bio}
            </p>
            <dl className="mt-9 grid max-w-[520px] grid-cols-[auto_1fr] gap-x-8 gap-y-3.5 text-[length:var(--fs-b1)]">
              {STORY.chef.facts.map((fact) => (
                <div key={fact.label} className="contents">
                  <dt className="text-ink-mute">{fact.label}</dt>
                  <dd className={`m-0 text-ink-hi ${fact.mono ? 'font-mono' : ''}`}>{fact.value}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-11 flex flex-col gap-3.5 lg:flex-row">
              <Link
                href="/dat-ban"
                className="inline-flex h-14 items-center justify-center rounded-sm border border-accent px-7 text-[length:var(--fs-b1)] font-medium text-accent-ink transition-colors hover:border-gold-300 hover:text-gold-200"
              >
                Đặt bàn
              </Link>
              <Link
                href="/lien-he#tuyen-dung"
                className="inline-flex h-14 items-center justify-center rounded-sm border border-line-3 px-7 text-[length:var(--fs-b1)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi"
              >
                Làm việc cùng chúng tôi
              </Link>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
