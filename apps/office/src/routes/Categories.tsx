import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type CategoryInput, type CategoryNode } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Field } from '../components/report'
import { useSession } from '../session-context'

/**
 * M10 — Cây danh mục: kéo thả, không giới hạn cấp, tên ba ngôn ngữ, ảnh bìa,
 * kênh hiển thị.
 *
 * Điều quan trọng nhất của màn này là điều nó KHÔNG làm: đổi nhóm của một món
 * không đụng tới định tuyến bếp. Trạm nằm trên món (M6), nhóm chỉ là cách sắp
 * thực đơn cho khách lướt. Nhờ vậy đổi cả cây lúc đổi mùa là thao tác an toàn,
 * không phải một cuộc di dời có rủi ro.
 *
 * Kéo thả dùng HTML5 drag & drop: thả LÊN một nhóm là vào làm con của nhóm đó,
 * thả vào vạch giữa hai dòng là chen vào đúng chỗ đó cùng cấp. Hai thao tác khác
 * nhau nên phải có hai vùng thả khác nhau — gộp một thì người dùng không bao giờ
 * đoán được lần thả này ra kết quả nào.
 */

const EMPTY: CategoryInput = {
  id: '',
  parentId: null,
  nameVi: '',
  nameEn: null,
  nameJa: null,
  kanji: null,
  imageUrl: null,
  onlineVisible: true,
  tableVisible: true,
}

/** Chỗ con trỏ đang thả tới: vào trong nhóm, hay chen vào vạch trước dòng */
type DropTarget = { id: string; mode: 'into' | 'before' } | null

export function Categories() {
  const { can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('menu.edit-price')

  const tree = useQuery({ queryKey: ['categories'], queryFn: api.categories })
  const [draft, setDraft] = useState<CategoryInput | null>(null)
  const [dragging, setDragging] = useState<string | null>(null)
  const [over, setOver] = useState<DropTarget>(null)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['categories'] })
  const fail = (err: Error) => toast(err.message, 'danger')

  const save = useMutation({
    mutationFn: (input: CategoryInput) =>
      tree.data?.some((c) => c.id === input.id)
        ? api.updateCategory(input.id, input)
        : api.createCategory(input),
    onSuccess: () => {
      toast('Đã lưu nhóm', 'ok')
      setDraft(null)
      refresh()
    },
    onError: fail,
  })

  const move = useMutation({
    mutationFn: (input: { id: string; parentId: string | null; position: number }) =>
      api.moveCategory(input.id, input.parentId, input.position),
    onSuccess: refresh,
    onError: (err: Error) => {
      fail(err)
      refresh()
    },
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteCategory(id),
    onSuccess: () => {
      toast('Đã xoá nhóm', 'ok')
      refresh()
    },
    onError: fail,
  })

  const rows = tree.data ?? []

  const drop = (target: DropTarget) => {
    setOver(null)
    const id = dragging
    setDragging(null)
    if (!id || !target || id === target.id) return

    const node = rows.find((r) => r.id === target.id)
    if (!node) return

    if (target.mode === 'into') {
      if (isAncestor(rows, id, target.id)) {
        toast('Không thả được một nhóm vào chính nhóm con của nó', 'danger')
        return
      }
      move.mutate({ id, parentId: target.id, position: 999 })
      return
    }

    const siblings = rows.filter((r) => r.parentId === node.parentId && r.id !== id)
    move.mutate({
      id,
      parentId: node.parentId,
      position: Math.max(0, siblings.findIndex((s) => s.id === target.id)),
    })
  }

  return (
    <>
      <PageHeader
        title="Cây danh mục"
        subtitle="Kéo thả để xếp lại thực đơn: thả lên một nhóm là vào làm nhóm con, thả vào vạch giữa hai dòng là chen ngang cùng cấp. Đổi nhóm không ảnh hưởng định tuyến bếp."
        action={
          mayEdit ? (
            <Button variant="primary" onClick={() => setDraft({ ...EMPTY })}>
              Thêm nhóm
            </Button>
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {draft ? (
          <CategoryForm
            draft={draft}
            existing={rows.some((c) => c.id === draft.id)}
            parents={rows}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => save.mutate(draft)}
            saving={save.isPending}
          />
        ) : null}

        <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="grid grid-cols-[1fr_120px_120px_150px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Nhóm</span>
            <span className="text-right">Món</span>
            <span className="text-center">Kênh</span>
            <span />
          </div>

          {tree.isPending ? (
            <p className="px-5 py-4 text-ink-mute">Đang tải…</p>
          ) : rows.length === 0 ? (
            <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
              Chưa có nhóm nào. Món chưa xếp nhóm vẫn bán được, chỉ là thực đơn không có chặng nào
              để khách lướt.
            </p>
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                draggable={mayEdit}
                onDragStart={() => setDragging(row.id)}
                onDragEnd={() => {
                  setDragging(null)
                  setOver(null)
                }}
                onDragOver={(e) => {
                  if (!mayEdit || !dragging) return
                  e.preventDefault()
                  // Một phần tư trên của dòng = chen ngang; phần còn lại = vào trong
                  const box = e.currentTarget.getBoundingClientRect()
                  const mode = e.clientY - box.top < box.height / 4 ? 'before' : 'into'
                  setOver({ id: row.id, mode })
                }}
                onDrop={(e) => {
                  e.preventDefault()
                  drop(over)
                }}
                className={`grid grid-cols-[1fr_120px_120px_150px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0 ${
                  dragging === row.id ? 'opacity-40' : ''
                } ${
                  over?.id === row.id && over.mode === 'into'
                    ? 'bg-surface-3 ring-1 ring-accent ring-inset'
                    : over?.id === row.id
                      ? 'border-t-2 border-t-accent'
                      : ''
                }`}
              >
                <span className="flex min-w-0 items-center gap-2" style={{ paddingLeft: row.depth * 22 }}>
                  {mayEdit ? (
                    <span className="cursor-grab text-line-4 select-none" aria-hidden>
                      ⠿
                    </span>
                  ) : null}
                  <span className="min-w-0">
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.nameVi}
                      {row.kanji ? (
                        <span className="ml-2 text-[length:var(--fs-c1)] text-ink-mute">
                          {row.kanji}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[length:var(--fs-c2)] text-ink-mute">
                      {row.id}
                      {row.nameEn || row.nameJa
                        ? ` · ${[row.nameEn, row.nameJa].filter(Boolean).join(' · ')}`
                        : ''}
                    </span>
                  </span>
                </span>

                <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                  {row.dishCount}
                  {row.totalDishCount !== row.dishCount ? (
                    <span className="text-ink-mute"> ({row.totalDishCount})</span>
                  ) : null}
                </span>

                <span className="flex justify-center gap-1.5">
                  <Channel on={row.tableVisible} label="bàn" />
                  <Channel on={row.onlineVisible} label="online" />
                </span>

                <span className="flex justify-end gap-1.5">
                  {mayEdit ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setDraft(toInput(row))}
                        className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        onClick={() => remove.mutate(row.id)}
                        disabled={row.childCount > 0 || row.totalDishCount > 0}
                        className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-mute hover:text-danger disabled:opacity-40"
                        title={
                          row.childCount > 0 || row.totalDishCount > 0
                            ? 'Còn nhóm con hoặc còn món — chuyển đi trước'
                            : undefined
                        }
                      >
                        Xoá
                      </button>
                    </>
                  ) : null}
                </span>
              </div>
            ))
          )}

          {mayEdit && rows.length > 0 ? (
            <div
              onDragOver={(e) => {
                if (!dragging) return
                e.preventDefault()
                setOver(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                if (dragging) move.mutate({ id: dragging, parentId: null, position: 999 })
                setDragging(null)
              }}
              className="border-t border-dashed border-line-2 px-5 py-3 text-center text-[length:var(--fs-c1)] text-ink-mute"
            >
              Thả xuống đây để đưa nhóm ra ngoài cùng
            </div>
          ) : null}
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Số trong ngoặc là tổng món tính cả nhóm con. Tắt kênh chỉ ẩn NHÓM, cờ bán của từng món
          giữ nguyên — bật lại là mọi thứ trở về như cũ. Kênh online đã ẩn thật (thực đơn O2 đọc
          trực tiếp); cờ <span className="text-ink-body">bàn</span> đi theo cấu hình xuống POS và
          Table, hai app đó dùng nó khi dựng lại bảng phím món.
        </p>
      </div>
    </>
  )
}

function Channel({ on, label }: { on: boolean; label: string }) {
  return (
    <span
      className={`rounded-sm border px-1.5 py-0.5 text-[length:var(--fs-c2)] ${
        on ? 'border-ok text-ok' : 'border-line-3 text-line-4 line-through'
      }`}
    >
      {label}
    </span>
  )
}

function CategoryForm({
  draft,
  existing,
  parents,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: CategoryInput
  existing: boolean
  parents: CategoryNode[]
  onChange: (next: CategoryInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof CategoryInput>(key: K, value: CategoryInput[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {existing ? `Sửa ${draft.nameVi}` : 'Nhóm mới'}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Field label="Mã nhóm">
          <Input
            value={draft.id}
            disabled={existing}
            onChange={(v) => set('id', v)}
            placeholder="bo-nuong"
          />
        </Field>
        <Field label="Tên tiếng Việt">
          <Input value={draft.nameVi} onChange={(v) => set('nameVi', v)} placeholder="Bò nướng" />
        </Field>
        <Field label="Tên tiếng Anh">
          <Input
            value={draft.nameEn ?? ''}
            onChange={(v) => set('nameEn', v || null)}
            placeholder="Grilled beef"
          />
        </Field>
        <Field label="Tên tiếng Nhật">
          <Input
            value={draft.nameJa ?? ''}
            onChange={(v) => set('nameJa', v || null)}
            placeholder="牛焼き"
          />
        </Field>

        <Field label="Kanji hiển thị">
          <Input value={draft.kanji ?? ''} onChange={(v) => set('kanji', v || null)} placeholder="牛" />
        </Field>
        <Field label="Ảnh bìa (URL)">
          <Input
            value={draft.imageUrl ?? ''}
            onChange={(v) => set('imageUrl', v || null)}
            placeholder="/anh/nhom-bo.png"
          />
        </Field>
        {existing ? null : (
          <Field label="Nhóm cha">
            <select
              value={draft.parentId ?? ''}
              onChange={(e) => set('parentId', e.target.value || null)}
              className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2 text-[length:var(--fs-b2)] text-ink-hi"
            >
              <option value="">— nhóm gốc —</option>
              {parents.map((p) => (
                <option key={p.id} value={p.id}>
                  {'— '.repeat(p.depth)}
                  {p.nameVi}
                </option>
              ))}
            </select>
          </Field>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <Toggle
          on={draft.tableVisible}
          onToggle={() => set('tableVisible', !draft.tableVisible)}
          label="Hiện ở kênh tại bàn"
        />
        <Toggle
          on={draft.onlineVisible}
          onToggle={() => set('onlineVisible', !draft.onlineVisible)}
          label="Hiện ở kênh online"
        />
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel}>Bỏ</Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            Lưu
          </Button>
        </div>
      </div>

      <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Nhóm cha chỉ chọn được lúc tạo; sau đó chuyển chỗ bằng kéo thả, vì đổi cha còn phải xếp lại
        thứ tự anh em ở cả chỗ cũ lẫn chỗ mới.
      </p>
    </section>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  disabled = false,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  disabled?: boolean
}) {
  return (
    <input
      value={value}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi disabled:text-ink-mute"
    />
  )
}

function Toggle({ on, onToggle, label }: { on: boolean; onToggle: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`h-9 rounded-sm border px-3 text-[length:var(--fs-c1)] ${
        on ? 'border-ok text-ok' : 'border-line-3 text-ink-mute'
      }`}
    >
      {label}
    </button>
  )
}

function toInput(row: CategoryNode): CategoryInput {
  return {
    id: row.id,
    parentId: row.parentId,
    nameVi: row.nameVi,
    nameEn: row.nameEn,
    nameJa: row.nameJa,
    kanji: row.kanji,
    imageUrl: row.imageUrl,
    onlineVisible: row.onlineVisible,
    tableVisible: row.tableVisible,
  }
}

/**
 * `candidate` có nằm trong cây con của `id` không.
 *
 * Máy chủ cũng chặn, nhưng chặn ở đây thì con trỏ không kịp thả xong đã biết là
 * hỏng — và cây không nháy một lần rồi quay về chỗ cũ.
 */
function isAncestor(rows: CategoryNode[], id: string, candidate: string): boolean {
  const parentOf = new Map(rows.map((r) => [r.id, r.parentId]))
  let cursor: string | null | undefined = candidate
  while (cursor) {
    if (cursor === id) return true
    cursor = parentOf.get(cursor)
  }
  return false
}
