import type { ReactNode } from 'react'

/** Đầu trang chung của Office: tên màn, một câu nói rõ nó điều khiển cái gì */
export function PageHeader({
  title,
  subtitle,
  action,
}: {
  title: string
  subtitle?: string
  action?: ReactNode
}) {
  return (
    <header className="flex flex-none items-start gap-6 px-8 pt-6 pb-5">
      <div className="min-w-0">
        <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">{title}</h1>
        {subtitle ? (
          <p className="mt-1.5 max-w-[720px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            {subtitle}
          </p>
        ) : null}
      </div>
      {action ? <div className="ml-auto flex flex-none gap-2">{action}</div> : null}
    </header>
  )
}
