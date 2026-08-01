import { formatVnd } from '@sora/contracts'

export function App() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-canvas font-sans text-ink-body">
      <p className="font-jp text-accent-ink">東京空</p>
      <h1 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Sora Table</h1>
      <p className="text-[length:var(--fs-b2)]">
        Skeleton GĐ0 — token OK: <span className="font-mono text-accent-ink">{formatVnd(285_000)}</span>
      </p>
    </main>
  )
}
