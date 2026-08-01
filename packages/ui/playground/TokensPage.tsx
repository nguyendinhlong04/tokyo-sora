/**
 * Trang đối chiếu token — mốc nghiệm thu GĐ0: từng ô phải khớp bảng README.md §5.
 * Swatch đọc trực tiếp biến CSS (var(--sora-*)) nên trang này luôn phản ánh tokens.css thật.
 */

interface Swatch {
  token: string
  cssVar: string
  note?: string
}

const GROUPS: { title: string; swatches: Swatch[] }[] = [
  {
    title: 'Nền và bề mặt',
    swatches: [
      { token: 'bg-base', cssVar: '--sora-bg-base', note: '#07080A' },
      { token: 'surface-1', cssVar: '--sora-surface-1', note: '#0A0C10' },
      { token: 'surface-2', cssVar: '--sora-surface-2', note: '#0D0F13' },
      { token: 'surface-3', cssVar: '--sora-surface-3', note: '#10131A' },
      { token: 'surface-4', cssVar: '--sora-surface-4', note: '#151920' },
      { token: 'line-1', cssVar: '--sora-line-1', note: '#1E232C' },
      { token: 'line-2', cssVar: '--sora-line-2', note: '#242A34' },
      { token: 'line-3', cssVar: '--sora-line-3', note: '#2B313C' },
      { token: 'line-4', cssVar: '--sora-line-4', note: '#3D4552' },
    ],
  },
  {
    title: 'Chữ',
    swatches: [
      { token: 'ink-hi', cssVar: '--sora-ink-hi', note: '#F5F2EA' },
      { token: 'ink-cream', cssVar: '--sora-ink-cream', note: '#EFEBE1' },
      { token: 'ink-body', cssVar: '--sora-ink-body', note: '#C2BCAE' },
      { token: 'ink-mute', cssVar: '--sora-ink-mute', note: '#8B8577' },
    ],
  },
  {
    title: 'Vàng đồng (thương hiệu)',
    swatches: [
      { token: 'gold-200', cssVar: '--sora-gold-200', note: '#EFE0BC' },
      { token: 'gold-300', cssVar: '--sora-gold-300', note: '#DCC58A' },
      { token: 'gold-500', cssVar: '--sora-gold-500', note: '#C9A85C' },
      { token: 'gold-600', cssVar: '--sora-gold-600', note: '#B08A33' },
      { token: 'gold-700', cssVar: '--sora-gold-700', note: '#8A6B22' },
      { token: 'gold-900', cssVar: '--sora-gold-900', note: '#5E4917' },
      { token: 'kraft', cssVar: '--sora-kraft', note: '#D9CDB8' },
      { token: 'kraft-ink', cssVar: '--sora-kraft-ink', note: '#241E17' },
      { token: 'kraft-ink-2', cssVar: '--sora-kraft-ink-2', note: '#4A3B22' },
    ],
  },
  {
    title: 'Trạng thái',
    swatches: [
      { token: 'ok', cssVar: '--sora-ok', note: '#4A8F63' },
      { token: 'warn', cssVar: '--sora-warn', note: '#D08A1C' },
      { token: 'danger', cssVar: '--sora-danger', note: '#B5382C (file)' },
      { token: 'danger-line', cssVar: '--sora-danger-line', note: '#8C2F2F' },
      { token: 'danger-line-2', cssVar: '--sora-danger-line-2', note: '#6E2A2A' },
      { token: 'info', cssVar: '--sora-info', note: '#4E7FA8' },
    ],
  },
  {
    title: 'Washi (nền sáng Office)',
    swatches: [
      { token: 'washi-50', cssVar: '--sora-washi-50', note: '#FBF9F4' },
      { token: 'washi-100', cssVar: '--sora-washi-100', note: '#FFFFFF' },
      { token: 'washi-200', cssVar: '--sora-washi-200', note: '#EFEBE1' },
      { token: 'gold-light', cssVar: '--sora-gold-light', note: '#8A6C24' },
    ],
  },
  {
    title: 'Thang than hồng (tiến độ)',
    swatches: [
      { token: 'ember-0 · 0–40% tro', cssVar: '--sora-ember-0', note: '#5A6270' },
      { token: 'ember-1 · 40–70% đồng', cssVar: '--sora-ember-1', note: '#C9A85C' },
      { token: 'ember-2 · 70–100% than', cssVar: '--sora-ember-2', note: '#D9721F' },
      { token: 'ember-3 · >100% lửa', cssVar: '--sora-ember-3', note: '#B5382C' },
    ],
  },
]

const TYPE_SCALE = [
  { label: 'D1 60', v: '--fs-d1' },
  { label: 'D2 44', v: '--fs-d2' },
  { label: 'D3 30', v: '--fs-d3' },
  { label: 'T1 22', v: '--fs-t1' },
  { label: 'T2 18', v: '--fs-t2' },
  { label: 'B1 16', v: '--fs-b1' },
  { label: 'B2 14', v: '--fs-b2' },
  { label: 'C1 13', v: '--fs-c1' },
  { label: 'C2 11', v: '--fs-c2' },
]

function SwatchCell({ s }: { s: Swatch }) {
  return (
    <div className="flex items-center gap-3 rounded-md border border-line-1 bg-surface-1 p-2">
      <div
        className="h-10 w-10 shrink-0 rounded-sm border border-line-3"
        style={{ background: `var(${s.cssVar})` }}
      />
      <div className="min-w-0">
        <div className="truncate text-[length:var(--fs-b2)] text-ink-hi">{s.token}</div>
        <div className="font-mono text-[length:var(--fs-c2)] text-ink-mute">{s.note}</div>
      </div>
    </div>
  )
}

function ThemeCard({ theme }: { theme: 'dark' | 'light' }) {
  return (
    <div
      data-theme={theme === 'light' ? 'light' : undefined}
      className="rounded-lg border border-line-1 bg-canvas p-4"
    >
      <div className="mb-3 text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-mute uppercase">
        Semantic — chủ đề {theme === 'light' ? 'sáng (Office)' : 'tối'}
      </div>
      <div className="flex flex-col gap-2">
        <div className="rounded-md bg-surface-1 p-3 text-ink-hi">surface-1 · ink-hi</div>
        <div className="rounded-md bg-surface-3 p-3 text-ink-body">surface-3 · ink-body</div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="h-[var(--hit-target)] rounded-sm bg-accent-strong px-4 font-semibold text-on-accent"
          >
            Nút chính
          </button>
          <button
            type="button"
            className="h-[var(--hit-target)] rounded-sm border border-line-3 px-4 text-ink-body"
          >
            Nút phụ
          </button>
          <span className="text-accent-ink">Link nhấn</span>
        </div>
      </div>
    </div>
  )
}

export function TokensPage() {
  return (
    <main className="min-h-dvh bg-canvas p-8 font-sans text-ink-body">
      <header className="mb-8">
        <p className="font-jp text-accent-ink">東京空</p>
        <h1 className="font-display text-[length:var(--fs-d3)] font-semibold text-ink-hi">
          Sora UI-lab — Bảng token
        </h1>
        <p className="text-[length:var(--fs-b2)] text-ink-mute">
          Đối chiếu 1:1 với README.md §5 · giá tiền mono:{' '}
          <span className="font-mono text-accent-ink">285.000₫</span>
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {GROUPS.map((g) => (
          <section key={g.title}>
            <h2 className="mb-2 text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-mute uppercase">
              {g.title}
            </h2>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-3">
              {g.swatches.map((s) => (
                <SwatchCell key={s.cssVar} s={s} />
              ))}
            </div>
          </section>
        ))}
      </div>

      <section className="mt-10 grid gap-4 lg:grid-cols-2">
        <ThemeCard theme="dark" />
        <ThemeCard theme="light" />
      </section>

      <section className="mt-10">
        <h2 className="mb-2 text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-mute uppercase">
          Thang chữ §9
        </h2>
        <div className="flex flex-col gap-1">
          {TYPE_SCALE.map((t) => (
            <div key={t.v} className="flex items-baseline gap-4">
              <span className="w-16 shrink-0 font-mono text-[length:var(--fs-c2)] text-ink-mute">
                {t.label}
              </span>
              <span className="text-ink-hi" style={{ fontSize: `var(${t.v})` }}>
                Bầu trời Tokyo, trên bếp than
              </span>
            </div>
          ))}
        </div>
      </section>

      <section className="mt-10">
        <h2 className="mb-2 text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-mute uppercase">
          Gate §9 — dấu tiếng Việt Cormorant (lỗi thì đổi Lora/Noto Serif)
        </h2>
        <p className="font-display text-[length:var(--fs-d2)] font-semibold text-ink-hi">
          ắ ằ ẵ ộ ữ ỡ ị Ỹ — Bầu trời Tokyo
        </p>
        <p className="font-display text-[length:var(--fs-d3)] font-light text-ink-body">
          Cormorant 300: ắ ằ ẵ ộ ữ ỡ ị Ỹ đ Đ
        </p>
        <p className="font-jp text-[length:var(--fs-d3)] text-accent-ink">
          東京空 · 炭火焼 · 膳 焼 鮮 揚 鍋 汁 甘 麦 酒 茶 牛 豚 海 野 生 御 美 味 · ソラ
        </p>
        <p className="font-mono text-[length:var(--fs-t2)] text-ink-body">285.000₫ · ON-0417</p>
      </section>

      <section className="mt-10">
        <h2 className="mb-2 text-[length:var(--fs-c1)] tracking-[0.14em] text-ink-mute uppercase">
          Thang than hồng — thanh tiến độ
        </h2>
        <div className="flex max-w-md flex-col gap-2">
          {[
            { w: '30%', c: '--sora-ember-0' },
            { w: '55%', c: '--sora-ember-1' },
            { w: '85%', c: '--sora-ember-2' },
            { w: '100%', c: '--sora-ember-3' },
          ].map((b) => (
            <div key={b.c} className="h-2 rounded-pill bg-line-2">
              <div
                className="h-full rounded-pill"
                style={{ width: b.w, background: `var(${b.c})` }}
              />
            </div>
          ))}
        </div>
      </section>
    </main>
  )
}
