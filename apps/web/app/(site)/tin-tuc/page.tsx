import type { Metadata } from 'next'
import { PhotoFrame } from '../../../components/visuals'
import { formatPostDate, getPosts } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'Tin tức',
  description:
    'Chuyện bếp, nguyên liệu và chi nhánh của Tokyo Sora. Chúng tôi viết khi có việc đáng nói.',
  alternates: { canonical: '/tin-tuc' },
}

/**
 * W8 — Tin tức.
 *
 * Bài viết soạn ở A8 (CMS website) và về đây qua `/api/site/posts` — chỉ bài đã
 * bật và đã tới ngày đăng. API im lặng thì `getPosts` trả mảng rỗng: trang vẫn
 * dựng phần chữ thay vì trắng bóc, đúng cam kết ở `lib/site.ts`.
 */
export default async function NewsPage() {
  const posts = await getPosts()
  const [lead, ...rest] = posts

  return (
    <>
      <section className="mx-auto max-w-[1280px] px-5 pt-16 lg:px-10 lg:pt-24">
        <span className="font-jp text-[length:var(--fs-b1)] tracking-[0.3em] text-accent">
          お知らせ
        </span>
        <h1 className="mt-5 font-display text-[38px] font-light text-ink-hi lg:text-[length:var(--fs-d1)]">
          Tin tức
        </h1>
        <p className="mt-5 max-w-[520px] text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
          Chúng tôi viết khi có việc đáng nói, không viết theo lịch.
        </p>
      </section>

      {lead ? (
        <section className="mx-auto max-w-[1280px] px-5 pt-10 lg:px-10 lg:pt-16">
          <article className="grid items-center gap-8 border-b border-accent/16 pb-12 lg:grid-cols-2 lg:gap-16 lg:pb-24">
            <PhotoFrame glyph="炭" className="aspect-[3/2]" />
            <div>
              <div className="flex items-center gap-4">
                <span className="inline-flex h-6.5 items-center rounded-pill border border-accent px-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-accent-ink uppercase">
                  {lead.category}
                </span>
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {formatPostDate(lead.publishedOn)}
                </span>
              </div>
              <h2 className="mt-6 font-display text-[30px] leading-tight font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
                {lead.title}
              </h2>
              {lead.excerpt ? (
                <p className="mt-6 max-w-[460px] text-[length:var(--fs-b1)] leading-[1.8] text-ink-body">
                  {lead.excerpt}
                </p>
              ) : null}
            </div>
          </article>
        </section>
      ) : null}

      <section className="mx-auto max-w-[1280px] px-5 pt-12 pb-20 lg:px-10 lg:pt-20 lg:pb-32">
        <div className="grid gap-10 lg:grid-cols-3 lg:gap-x-8 lg:gap-y-14">
          {rest.map((post) => (
            <article key={post.id}>
              <PhotoFrame glyph="報" className="aspect-[3/2]" />
              <div className="mt-5 flex items-center gap-3.5">
                <span className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  {post.category}
                </span>
                <span className="h-2.5 w-px bg-line-3" />
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {formatPostDate(post.publishedOn)}
                </span>
              </div>
              <h3 className="mt-3.5 font-display text-[24px] leading-tight font-light text-ink-hi lg:text-[length:var(--fs-d3)]">
                {post.title}
              </h3>
            </article>
          ))}
        </div>
      </section>
    </>
  )
}
