import type { Metadata } from 'next'
import Link from 'next/link'
import { ContactForm } from '../../../components/ContactForm'
import { PhotoFrame } from '../../../components/visuals'
import { BRANCH_EXTRAS, RECRUIT, SITE } from '../../../content/site'
import { getBranches } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'Liên hệ & tuyển dụng',
  description:
    'Số điện thoại và địa chỉ ba chi nhánh Tokyo Sora, biểu mẫu liên hệ và các vị trí đang tuyển.',
  alternates: { canonical: '/lien-he' },
}

/** W9 — Liên hệ & tuyển dụng */
export default async function ContactPage() {
  const branches = await getBranches()

  return (
    <>
      <section className="mx-auto max-w-[1280px] px-5 pt-16 lg:px-10 lg:pt-24">
        <span className="font-jp text-[length:var(--fs-b1)] tracking-[0.3em] text-accent">
          お問い合わせ
        </span>
        <h1 className="mt-5 font-display text-[38px] font-light text-ink-hi lg:text-[length:var(--fs-d1)]">
          Liên hệ
        </h1>
        <p className="mt-5 max-w-[520px] text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
          Đặt bàn thì{' '}
          <Link href="/dat-ban" className="text-accent-ink underline underline-offset-4">
            dùng trang đặt bàn
          </Link>{' '}
          sẽ nhanh hơn. Ô này dành cho việc khác.
        </p>
      </section>

      <section className="mx-auto max-w-[1280px] px-5 pt-10 lg:px-10 lg:pt-20">
        <div className="grid items-start gap-12 lg:grid-cols-[1fr_480px] lg:gap-20">
          <ContactForm />

          <div>
            <PhotoFrame glyph="地図" className="h-[220px] lg:h-[300px]" />
            <div className="mt-8 grid gap-6">
              {branches.map((branch) => (
                <div key={branch.id} className="border-b border-surface-4 pb-6">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[17px] font-semibold text-ink-hi">{branch.name}</p>
                    <span className="font-jp text-[length:var(--fs-t2)] leading-none text-gold-900">
                      {BRANCH_EXTRAS[branch.id]?.kanji}
                    </span>
                  </div>
                  <p className="mt-2.5 text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
                    {branch.address}
                  </p>
                  {branch.openHours ? (
                    <p className="mt-2 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {branch.openHours}
                    </p>
                  ) : null}
                  {branch.phone ? (
                    <a
                      href={`tel:${branch.phone.replace(/\s/g, '')}`}
                      className="mt-1.5 block font-mono text-[length:var(--fs-b2)] text-accent-ink"
                    >
                      {branch.phone}
                    </a>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section id="tuyen-dung" className="mx-auto max-w-[1280px] scroll-mt-28 px-5 py-16 lg:px-10 lg:py-32">
        <div className="border-t border-accent/16 pt-12 lg:pt-24">
          <div className="grid items-start gap-10 lg:grid-cols-[420px_1fr] lg:gap-20">
            <div>
              <span className="font-jp text-[length:var(--fs-b1)] tracking-[0.3em] text-accent">
                求人
              </span>
              <h2 className="mt-4 font-display text-[30px] leading-tight font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
                Tuyển dụng
              </h2>
              <p className="mt-6 text-[length:var(--fs-b1)] leading-[1.8] text-ink-body">
                {RECRUIT.lead}
              </p>
              <p className="mt-6 text-[length:var(--fs-b2)] leading-relaxed text-ink-mute">
                Gửi hồ sơ về{' '}
                <a href={`mailto:${SITE.recruitEmail}`} className="text-accent-ink">
                  {SITE.recruitEmail}
                </a>{' '}
                hoặc bấm vào vị trí bên cạnh.
              </p>
            </div>

            <ul>
              {RECRUIT.jobs.map((job) => (
                <li
                  key={job.title}
                  className="grid items-center gap-3 border-b border-line-1 py-5 lg:grid-cols-[1fr_200px_140px_auto] lg:gap-6 lg:py-6"
                >
                  <p className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">{job.title}</p>
                  <p className="text-[length:var(--fs-b2)] text-ink-body">{job.branch}</p>
                  <p className="text-[length:var(--fs-b2)] text-ink-mute">{job.type}</p>
                  <div className="flex items-center gap-5 lg:justify-self-end">
                    <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {job.slots}
                    </span>
                    <a
                      href={`mailto:${SITE.recruitEmail}?subject=${encodeURIComponent(
                        `Ứng tuyển ${job.title} — ${job.branch}`,
                      )}`}
                      className="inline-flex h-11 items-center rounded-sm border border-line-3 px-5 text-[length:var(--fs-b2)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi"
                    >
                      Ứng tuyển
                    </a>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>
    </>
  )
}
