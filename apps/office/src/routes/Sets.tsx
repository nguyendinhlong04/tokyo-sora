import { formatVnd } from '@sora/contracts'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type SaleSchedule, type SetOverviewRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { formatPercent } from '../components/report'
import { useSession } from '../session-context'
import { DishEditor, BLANK_DISH } from './DishEditor'

/**
 * M11 — Set & Combo: nhóm lựa chọn, món cố định, giá set, kênh, chi nhánh, lịch
 * bán, và **dải giá vốn min–max** kèm food cost tương ứng.
 *
 * Dải là điểm của cả màn. Set "chọn 4 trong 10" không có một giá vốn — nó có hai
 * đầu, và khoảng cách giữa chúng là rủi ro người định giá đang gánh. Khách chọn
 * toàn món đắt nhất không phải trường hợp hiếm; ở nhiều quán đó là trường hợp mặc
 * định. Nên **food cost đầu đắt** mới là con số dùng để quyết định giá bán, còn
 * đầu rẻ chỉ nói cho biết set có thể lãi tới đâu.
 *
 * Chặng của set sửa ở trình sửa món (mở ngay từ đây), giá và kênh cũng vậy. Màn
 * này thêm đúng hai thứ không nằm trong bảng nào: dải giá vốn, và lịch bán.
 */

const DAY_LABELS = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN']
const ALL_DAYS = 127

export function Sets() {
  const { branchId, can } = useSession()
  const mayEdit = can('menu.edit-price')
  const [editing, setEditing] = useState<string | null>(null)
  const [scheduling, setScheduling] = useState<SetOverviewRow | null>(null)

  const sets = useQuery({
    queryKey: ['sets', branchId],
    queryFn: () => api.sets(branchId!),
    enabled: Boolean(branchId),
  })

  const rows = sets.data ?? []
  const unpriced = rows.filter((r) => r.unknownDishes.length > 0).length

  return (
    <>
      <PageHeader
        title="Set & Combo"
        subtitle={
          unpriced === 0
            ? 'Dải giá vốn tính từ món khách có thể chọn thật: đầu rẻ là chọn toàn món rẻ nhất, đầu đắt là chọn toàn món đắt nhất — kể cả chọn trùng.'
            : `${unpriced}/${rows.length} set còn món thành phần chưa khai công thức, nên dải giá vốn của chúng chưa đọc được.`
        }
        action={
          mayEdit ? (
            <Button variant="primary" onClick={() => setEditing('new')}>
              Thêm set
            </Button>
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {rows.length === 0 && !sets.isPending ? (
          <p className="rounded-md border border-line-1 bg-surface-1 px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
            Chưa có set nào. Set là một món có <span className="text-ink-body">loại = set</span>,
            giá nằm ở dòng set và các chặng bên trong quyết định bếp làm gì.
          </p>
        ) : null}

        <div className="grid gap-4">
          {rows.map((set) => (
            <SetCard
              key={set.id}
              set={set}
              mayEdit={mayEdit}
              onEdit={() => setEditing(set.id)}
              onSchedule={() => setScheduling(set)}
            />
          ))}
        </div>

        <p className="mt-5 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Lịch bán được cưỡng chế ở cửa gọi món: hết khung giờ thì POS, Table và đơn online đều bị
          từ chối kèm lý do, và thực đơn online tự ẩn món. Bàn phím POS vẫn hiện set ngoài giờ —
          nó đọc cấu hình đã cache, nên chỗ chặn là lúc bấm chứ chưa phải lúc nhìn.
        </p>
      </div>

      {editing ? (
        <DishEditor
          dishId={editing === 'new' ? null : editing}
          blank={{ ...BLANK_DISH, kind: 'set' }}
          onClose={() => setEditing(null)}
        />
      ) : null}

      {scheduling ? (
        <ScheduleDialog set={scheduling} onClose={() => setScheduling(null)} />
      ) : null}
    </>
  )
}

function SetCard({
  set,
  mayEdit,
  onEdit,
  onSchedule,
}: {
  set: SetOverviewRow
  mayEdit: boolean
  onEdit: () => void
  onSchedule: () => void
}) {
  const spread = set.costMaxVnd - set.costMinVnd
  const known = set.unknownDishes.length === 0

  return (
    <section className={`rounded-md border border-line-1 bg-surface-1 ${set.active ? '' : 'opacity-60'}`}>
      <header className="flex flex-wrap items-start gap-4 border-b border-line-1 px-5 py-4">
        <div className="min-w-0">
          <p className="text-[length:var(--fs-b1)] text-ink-hi">
            {set.nameVi}
            <span className="ml-2 font-mono text-[length:var(--fs-c1)] text-ink-mute">
              {set.code}
            </span>
          </p>
          <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
            {set.courseCount} chặng · {set.tableOrderable ? 'tại bàn' : 'không bán tại bàn'} ·{' '}
            {set.onlineVisible ? 'có bán online' : 'không bán online'}
            {set.branchOverride ? ' · chi nhánh này có ghi đè riêng' : ''}
            {set.scheduleLabel ? (
              <span className="text-accent-ink"> · chỉ bán {set.scheduleLabel}</span>
            ) : null}
          </p>
        </div>

        <div className="ml-auto flex flex-none items-center gap-4">
          <div className="text-right">
            <span className="block text-[length:var(--fs-c2)] tracking-[0.12em] text-ink-mute uppercase">
              Giá set
            </span>
            <span className="block font-mono text-[length:var(--fs-b1)] text-ink-hi">
              {formatVnd(set.priceVnd)}
            </span>
          </div>
          {mayEdit ? (
            <div className="flex gap-2">
              <Button onClick={onSchedule}>Lịch bán</Button>
              <Button onClick={onEdit}>Sửa set</Button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid gap-5 px-5 py-4 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]">
        <div>
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Dải giá vốn
          </p>

          {known ? (
            <>
              <p className="mt-2 font-mono text-[length:var(--fs-b1)] text-ink-hi">
                {formatVnd(set.costMinVnd)} – {formatVnd(set.costMaxVnd)}
              </p>
              <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
                food cost{' '}
                <span className={bandTone(set.foodCostMin)}>{percent(set.foodCostMin)}</span> –{' '}
                <span className={bandTone(set.foodCostMax)}>{percent(set.foodCostMax)}</span>
                {spread > 0 ? ` · chênh ${formatVnd(spread)} tuỳ khách chọn` : ' · không có dải'}
              </p>
              <SpreadBar set={set} />
            </>
          ) : (
            <p className="mt-2 text-[length:var(--fs-b2)] text-warn">
              Chưa đọc được: {set.unknownDishes.join(', ')} chưa khai công thức.
            </p>
          )}
        </div>

        <div>
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Chặng
          </p>
          {set.courses.length === 0 ? (
            <p className="mt-2 text-[length:var(--fs-b2)] text-warn">
              Set chưa khai chặng nào — bấm Sửa set để thêm.
            </p>
          ) : (
            <div className="mt-2 grid gap-1.5">
              {set.courses.map((course) => (
                <div
                  key={course.groupId}
                  className="grid grid-cols-[1fr_130px_170px] items-center gap-3 text-[length:var(--fs-c1)]"
                >
                  <span className="truncate text-ink-body">{course.label}</span>
                  <span className="text-ink-mute">
                    {course.pickCount === null ? 'lấy hết' : `chọn ${course.pickCount}`}
                  </span>
                  <span className="text-right font-mono text-ink-mute">
                    {course.minVnd === course.maxVnd
                      ? formatVnd(course.minVnd)
                      : `${formatVnd(course.minVnd)} – ${formatVnd(course.maxVnd)}`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}

/** Thanh dải: giá bán là toàn bộ chiều rộng, phần tô là khoảng giá vốn nằm trong đó */
function SpreadBar({ set }: { set: SetOverviewRow }) {
  if (set.priceVnd <= 0) return null
  const clamp = (v: number) => Math.max(0, Math.min(1, v))
  const left = clamp(set.costMinVnd / set.priceVnd)
  const right = clamp(set.costMaxVnd / set.priceVnd)

  return (
    <div className="mt-3">
      <div className="relative h-2 overflow-hidden rounded-sm bg-surface-3">
        <div
          className="absolute inset-y-0 bg-accent/50"
          style={{ left: `${left * 100}%`, width: `${Math.max(1, (right - left) * 100)}%` }}
        />
      </div>
      <p className="mt-1 text-[length:var(--fs-c2)] text-ink-mute">
        phần tô là giá vốn trong giá bán {formatVnd(set.priceVnd)}
      </p>
    </div>
  )
}

function percent(value: number | null): string {
  return value === null ? '—' : formatPercent(value).replace('+', '')
}

function bandTone(value: number | null): string {
  if (value === null) return 'text-ink-mute'
  if (value < 0.3) return 'text-ok'
  return value <= 0.38 ? 'text-warn' : 'text-danger'
}

// ------------------------------------------------------------- lịch bán

function ScheduleDialog({ set, onClose }: { set: SetOverviewRow; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<SaleSchedule>(set.schedule)

  const save = useMutation({
    mutationFn: () => api.updateDish(set.id, draft),
    onSuccess: () => {
      toast('Đã lưu lịch bán', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['sets'] })
      void queryClient.invalidateQueries({ queryKey: ['dishes'] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const toggleDay = (bit: number) => {
    const next = draft.saleDays ^ (1 << bit)
    // Bỏ hết bảy ngày là "không bán ngày nào" — thứ đó đã có tên là tắt món
    if (next === 0) return
    setDraft({ ...draft, saleDays: next })
  }

  const windowOn = draft.saleStartMinute !== null

  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/50 p-6">
      <section className="w-full max-w-[560px] rounded-md border border-line-1 bg-surface-1 p-6">
        <p className="text-[length:var(--fs-b1)] text-ink-hi">Lịch bán · {set.nameVi}</p>
        <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
          Khác với tắt món: lịch bán là quy tắc lặp lại, hết mùa thì tự ngừng và tới mùa thì tự bán
          lại.
        </p>

        <div className="mt-5">
          <span className="block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Thứ trong tuần
          </span>
          <div className="mt-2 flex gap-1.5">
            {DAY_LABELS.map((label, bit) => {
              const on = (draft.saleDays & (1 << bit)) !== 0
              return (
                <button
                  key={label}
                  type="button"
                  onClick={() => toggleDay(bit)}
                  className={`h-9 w-11 rounded-sm border text-[length:var(--fs-c1)] ${
                    on ? 'border-accent text-accent-ink' : 'border-line-3 text-ink-mute'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>

        <div className="mt-5">
          <label className="flex items-center gap-2 text-[length:var(--fs-b2)] text-ink-body">
            <input
              type="checkbox"
              checked={windowOn}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  saleStartMinute: e.target.checked ? 11 * 60 : null,
                  saleEndMinute: e.target.checked ? 14 * 60 : null,
                })
              }
            />
            Chỉ bán trong một khung giờ
          </label>

          {windowOn ? (
            <div className="mt-2 flex items-center gap-3">
              <Clock
                value={draft.saleStartMinute!}
                onChange={(v) => setDraft({ ...draft, saleStartMinute: v })}
              />
              <span className="text-ink-mute">→</span>
              <Clock
                value={draft.saleEndMinute!}
                onChange={(v) => setDraft({ ...draft, saleEndMinute: v })}
              />
            </div>
          ) : null}
        </div>

        <div className="mt-5 grid grid-cols-2 gap-4">
          <label className="block">
            <span className="block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Bán từ ngày
            </span>
            <input
              type="date"
              value={draft.saleFrom ?? ''}
              onChange={(e) => setDraft({ ...draft, saleFrom: e.target.value || null })}
              className="mt-2 h-9 w-full rounded-sm border border-line-1 bg-canvas px-2 text-[length:var(--fs-b2)] text-ink-hi"
            />
          </label>
          <label className="block">
            <span className="block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Đến hết ngày
            </span>
            <input
              type="date"
              value={draft.saleTo ?? ''}
              onChange={(e) => setDraft({ ...draft, saleTo: e.target.value || null })}
              className="mt-2 h-9 w-full rounded-sm border border-line-1 bg-canvas px-2 text-[length:var(--fs-b2)] text-ink-hi"
            />
          </label>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <button
            type="button"
            onClick={() =>
              setDraft({
                saleFrom: null,
                saleTo: null,
                saleDays: ALL_DAYS,
                saleStartMinute: null,
                saleEndMinute: null,
              })
            }
            className="h-9 rounded-sm border border-line-3 px-3 text-[length:var(--fs-c1)] text-ink-mute hover:text-ink-body"
          >
            Bỏ mọi giới hạn
          </button>
          <div className="ml-auto flex gap-2">
            <Button onClick={onClose}>Đóng</Button>
            <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
              Lưu lịch bán
            </Button>
          </div>
        </div>
      </section>
    </div>
  )
}

function Clock({ value, onChange }: { value: number; onChange: (minute: number) => void }) {
  const text = `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`
  return (
    <input
      type="time"
      value={text}
      onChange={(e) => {
        const [hour, minute] = e.target.value.split(':').map(Number)
        if (Number.isFinite(hour) && Number.isFinite(minute)) onChange(hour! * 60 + minute!)
      }}
      className="h-9 rounded-sm border border-line-1 bg-canvas px-2 font-mono text-[length:var(--fs-b2)] text-ink-hi"
    />
  )
}
