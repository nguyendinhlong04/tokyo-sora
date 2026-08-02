import { formatVnd } from '@sora/contracts'
import { ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useSearchParams } from 'react-router'
import { api, type RecipeSubjectKind, type RecipeVersionCompare } from '../api'
import { PageHeader } from '../components/PageHeader'
import { formatTime } from '../components/report'

/**
 * M9 — Lịch sử phiên bản công thức: ai sửa, giá vốn đổi bao nhiêu, so hai bản.
 *
 * Bên trái là dòng thời gian chung của MỌI công thức, vì người mở màn này thường
 * không đi tìm một món cụ thể — họ đi tìm "tuần rồi ai đụng vào cái gì mà food
 * cost nhảy". Chọn một dòng thì bên phải mở đúng công thức đó và so hai bản.
 *
 * Bản chụp giữ luôn tên và đơn giá nguyên liệu lúc đó, nên bảng so sánh nói được
 * cả những thay đổi mà hôm nay không còn dấu vết: nguyên liệu đã đổi tên, đã bị
 * bỏ khỏi công thức, hay giá đã đi rất xa.
 */

const KIND_LABEL: Record<RecipeSubjectKind, string> = {
  dish: 'Món',
  prep: 'Mẻ',
}

export function RecipeHistory() {
  const [params, setParams] = useSearchParams()
  const kindParam = params.get('kind')
  const selected: { kind: RecipeSubjectKind; id: string } | null =
    kindParam === 'dish' || kindParam === 'prep'
      ? { kind: kindParam, id: params.get('id') ?? '' }
      : null

  const changes = useQuery({ queryKey: ['recipe-changes'], queryFn: api.recipeChanges })
  const rows = changes.data ?? []

  return (
    <>
      <PageHeader
        title="Lịch sử công thức"
        subtitle="Mỗi lần bấm Lưu mà công thức thật sự đổi là một phiên bản. Bấm một dòng để mở công thức đó và so hai bản bất kỳ."
      />

      <div className="grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-6 overflow-hidden px-8 pb-8">
        <div className="min-h-0 overflow-y-auto">
          <div className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
            <div className="grid grid-cols-[70px_1fr_120px_130px] gap-3 border-b border-line-1 bg-canvas px-4 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              <span>Loại</span>
              <span>Công thức</span>
              <span className="text-right">Giá vốn</span>
              <span className="text-right">Người sửa</span>
            </div>

            {changes.isPending ? (
              <p className="px-4 py-4 text-ink-mute">Đang tải…</p>
            ) : rows.length === 0 ? (
              <p className="px-4 py-4 text-[length:var(--fs-b2)] text-ink-mute">
                Chưa có phiên bản nào. Lịch sử bắt đầu từ lần lưu công thức tiếp theo — những công
                thức khai trước khi màn này có mặt chưa có bản chụp nào để so.
              </p>
            ) : (
              rows.map((row) => {
                const delta =
                  row.previousCostVnd === null ? null : row.costVnd - row.previousCostVnd
                const active =
                  selected?.kind === row.subjectKind && selected.id === row.subjectId
                return (
                  <button
                    key={row.id}
                    type="button"
                    onClick={() =>
                      setParams({ kind: row.subjectKind, id: row.subjectId }, { replace: true })
                    }
                    className={`grid w-full grid-cols-[70px_1fr_120px_130px] items-center gap-3 border-b border-line-1 px-4 py-2.5 text-left last:border-b-0 hover:bg-surface-3 ${
                      active ? 'bg-surface-3' : ''
                    }`}
                  >
                    <span className="text-[length:var(--fs-c2)] text-ink-mute">
                      {KIND_LABEL[row.subjectKind]}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                        {row.subjectName}
                      </span>
                      <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
                        bản {row.version} · {row.lineCount} dòng · {formatTime(row.createdAt)}
                      </span>
                    </span>
                    <span className="text-right">
                      <span className="block font-mono text-[length:var(--fs-b2)] text-ink-body">
                        {formatVnd(row.costVnd)}
                      </span>
                      {delta !== null && delta !== 0 ? (
                        <span
                          className={`block font-mono text-[length:var(--fs-c2)] ${delta > 0 ? 'text-warn' : 'text-ok'}`}
                        >
                          {delta > 0 ? '+' : '−'}
                          {formatVnd(Math.abs(delta))}
                        </span>
                      ) : null}
                    </span>
                    <span className="truncate text-right text-[length:var(--fs-c1)] text-ink-mute">
                      {row.actorName ?? 'hệ thống'}
                    </span>
                  </button>
                )
              })
            )}
          </div>

          <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Giá vốn ở đây là giá MỘT PHẦN với món và MỘT MẺ với bán thành phẩm. Giá nguyên liệu
            đổi không sinh phiên bản mới — nhập hàng không phải là sửa công thức, và nếu tính vào
            thì mỗi lần nhập bò sẽ đẻ ra hàng chục dòng che hết những lần sửa thật.
          </p>
        </div>

        <div className="min-h-0 overflow-y-auto">
          {selected && selected.id ? (
            <VersionPanel kind={selected.kind} subjectId={selected.id} />
          ) : (
            <p className="rounded-md border border-dashed border-line-2 px-5 py-8 text-center text-[length:var(--fs-c1)] text-ink-mute">
              Chọn một dòng bên trái để xem các phiên bản và so hai bản.
            </p>
          )}
        </div>
      </div>
    </>
  )
}

function VersionPanel({ kind, subjectId }: { kind: RecipeSubjectKind; subjectId: string }) {
  const list = useQuery({
    queryKey: ['recipe-versions', kind, subjectId],
    queryFn: () => api.recipeVersions(kind, subjectId),
  })
  const [pair, setPair] = useState<{ from: number; to: number } | null>(null)

  if (list.isError) return <ErrorState message={(list.error as Error).message} />
  if (!list.data) return <p className="text-ink-mute">Đang tải…</p>

  const versions = list.data.versions
  /** Mặc định so bản mới nhất với bản liền trước — câu hỏi hay gặp nhất */
  const chosen =
    pair ??
    (versions.length >= 2
      ? { from: versions[1]!.version, to: versions[0]!.version }
      : null)

  return (
    <section className="rounded-md border border-line-1 bg-surface-1">
      <header className="border-b border-line-1 px-5 py-3">
        <p className="text-[length:var(--fs-b1)] text-ink-hi">{list.data.subjectName}</p>
        <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">
          {versions.length} phiên bản · {KIND_LABEL[kind]}
        </p>
      </header>

      {versions.length < 2 ? (
        <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
          Mới có một phiên bản — chưa có gì để so.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-3 border-b border-line-1 px-5 py-3">
          <VersionPicker
            label="Bản cũ"
            value={chosen!.from}
            options={versions}
            onChange={(v) => setPair({ from: v, to: chosen!.to })}
          />
          <VersionPicker
            label="Bản mới"
            value={chosen!.to}
            options={versions}
            onChange={(v) => setPair({ from: chosen!.from, to: v })}
          />
        </div>
      )}

      {chosen ? <Diff kind={kind} subjectId={subjectId} pair={chosen} /> : null}
    </section>
  )
}

function VersionPicker({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: number
  options: { version: number; costVnd: number; actorName: string | null; createdAt: string }[]
  onChange: (version: number) => void
}) {
  return (
    <label className="flex items-center gap-2">
      <span className="text-[length:var(--fs-c1)] text-ink-mute">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-9 rounded-sm border border-line-1 bg-canvas px-2 text-[length:var(--fs-c1)] text-ink-hi"
      >
        {options.map((v) => (
          <option key={v.version} value={v.version}>
            bản {v.version} · {formatVnd(v.costVnd)} · {v.actorName ?? 'hệ thống'}
          </option>
        ))}
      </select>
    </label>
  )
}

const CHANGE_STYLE: Record<RecipeVersionCompare['lines'][number]['change'], string> = {
  added: 'text-ok',
  removed: 'text-danger',
  changed: 'text-warn',
  same: 'text-ink-mute',
}

const CHANGE_LABEL: Record<RecipeVersionCompare['lines'][number]['change'], string> = {
  added: 'thêm',
  removed: 'bỏ',
  changed: 'sửa',
  same: '',
}

function Diff({
  kind,
  subjectId,
  pair,
}: {
  kind: RecipeSubjectKind
  subjectId: string
  pair: { from: number; to: number }
}) {
  const diff = useQuery({
    queryKey: ['recipe-compare', kind, subjectId, pair.from, pair.to],
    queryFn: () => api.compareRecipeVersions(kind, subjectId, pair.from, pair.to),
  })

  if (diff.isError) {
    return (
      <div className="px-5 py-4">
        <ErrorState message={(diff.error as Error).message} />
      </div>
    )
  }
  if (!diff.data) return <p className="px-5 py-4 text-ink-mute">Đang tải…</p>

  const { from, to, lines } = diff.data
  const delta = to.costVnd - from.costVnd
  // Đổi thứ tự dòng không phải là đổi công thức — dòng 'same' xuống cuối
  const sorted = [...lines].sort((a, b) => Number(a.change === 'same') - Number(b.change === 'same'))

  return (
    <>
      <div className="border-b border-line-1 bg-surface-2 px-5 py-3">
        <p className="text-[length:var(--fs-b2)] text-ink-hi">
          Giá vốn {formatVnd(from.costVnd)} → {formatVnd(to.costVnd)}
          {delta !== 0 ? (
            <span className={delta > 0 ? 'text-warn' : 'text-ok'}>
              {' '}
              ({delta > 0 ? 'tăng' : 'giảm'} {formatVnd(Math.abs(delta))})
            </span>
          ) : (
            <span className="text-ink-mute"> (không đổi)</span>
          )}
        </p>
        <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">
          bản {from.version} ({from.actorName ?? 'hệ thống'} · {formatTime(from.createdAt)}) → bản{' '}
          {to.version} ({to.actorName ?? 'hệ thống'} · {formatTime(to.createdAt)})
          {to.yieldBase !== null ? ` · sản lượng mẻ ${from.yieldBase} → ${to.yieldBase}` : ''}
        </p>
      </div>

      <div className="grid grid-cols-[1fr_120px_120px_70px] gap-3 border-b border-line-1 px-5 py-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
        <span>Nguyên liệu</span>
        <span className="text-right">Bản {from.version}</span>
        <span className="text-right">Bản {to.version}</span>
        <span className="text-right" />
      </div>

      {sorted.map((line) => (
        <div
          key={line.ingredientId}
          className="grid grid-cols-[1fr_120px_120px_70px] items-center gap-3 border-b border-line-1 px-5 py-2 last:border-b-0"
        >
          <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">{line.name}</span>
          <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {line.before ? qtyLabel(line.before) : '—'}
          </span>
          <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
            {line.after ? qtyLabel(line.after) : '—'}
          </span>
          <span className={`text-right text-[length:var(--fs-c2)] ${CHANGE_STYLE[line.change]}`}>
            {CHANGE_LABEL[line.change]}
          </span>
        </div>
      ))}
    </>
  )
}

function qtyLabel(line: { qtyBase: number; wasteBp: number }): string {
  return line.wasteBp === 0
    ? line.qtyBase.toLocaleString('vi-VN')
    : `${line.qtyBase.toLocaleString('vi-VN')} +${line.wasteBp / 100}%`
}
