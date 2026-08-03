import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type ModifierGroupInput, type ModifierGroupRow } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { Field } from '../components/report'
import { TextInput as Input, Toggle } from '../components/form'
import { useSession } from '../session-context'

const EMPTY: ModifierGroupInput = {
  id: '',
  name: '',
  required: false,
  multi: true,
  pickMin: 0,
  pickMax: null,
  options: [{ id: null, name: '', priceDelta: 0, affectsStock: false }],
}

/**
 * M5 — Tuỳ chọn.
 *
 * Nhóm tuỳ chọn DÙNG CHUNG cho nhiều món, nên nó có màn riêng chứ không nằm gọn
 * trong trình sửa món: khai lại bảng vị ở từng món là cách chắc chắn để mười ba
 * món nướng có mười ba bảng vị lệch nhau. Trình sửa món chỉ tích chọn dùng nhóm
 * nào — và cột "Áp cho" ở đây là chỗ nhìn ra hậu quả trước khi sửa.
 *
 * Ô "trừ kho" là thứ duy nhất trên màn này chạm tới tiền: "thêm tỏi nướng" là một
 * nguyên liệu thật phải trừ khỏi kho và tính vào giá vốn, còn "ít cay" thì không.
 * Bật nhầm thì giá vốn món phồng lên mà không ai tìm ra vì sao.
 */
export function Modifiers() {
  const { can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('menu.edit-price')

  const groups = useQuery({ queryKey: ['modifier-groups'], queryFn: api.modifierGroups })
  const [draft, setDraft] = useState<ModifierGroupInput | null>(null)

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['modifier-groups'] })
  const fail = (err: Error) => toast(err.message, 'danger')

  const save = useMutation({
    mutationFn: (input: ModifierGroupInput) => api.saveModifierGroup(input),
    onSuccess: (result) => {
      toast(
        result.dropped > 0 ? `Đã lưu nhóm — bỏ ${result.dropped} lựa chọn` : 'Đã lưu nhóm tuỳ chọn',
        'ok',
      )
      setDraft(null)
      refresh()
    },
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: (id: string) => api.deleteModifierGroup(id),
    onSuccess: () => {
      toast('Đã xoá nhóm', 'ok')
      refresh()
    },
    onError: fail,
  })

  const rows = groups.data ?? []

  return (
    <>
      <PageHeader
        title="Tuỳ chọn"
        subtitle="Nhóm câu hỏi mà POS và điện thoại khách hỏi khi gọi món. Nhóm dùng chung cho nhiều món — sửa ở đây là mọi món dùng nhóm đó đổi theo."
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
          <GroupForm
            draft={draft}
            existing={rows.some((g) => g.id === draft.id)}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => save.mutate(draft)}
            saving={save.isPending}
          />
        ) : null}

        <div className="mt-5">
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            loading={groups.isPending}
            empty="Chưa có nhóm tuỳ chọn nào. Món vẫn gọi được — POS chỉ thả thẳng vào phiếu order mà không hỏi gì."
            columns={[
              {
                key: 'name',
                header: 'Tên nhóm',
                width: 'minmax(220px, 1fr)',
                cell: (row) => (
                  <span className="min-w-0">
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.name}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[length:var(--fs-c2)] text-ink-mute">
                      {row.id} · {row.options.map((o) => o.name).join(' · ')}
                    </span>
                  </span>
                ),
              },
              {
                key: 'kind',
                header: 'Kiểu',
                width: '130px',
                cell: (row) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-body">
                    {row.required ? 'Bắt buộc' : 'Tuỳ ý'}
                    <span className="block text-[length:var(--fs-c2)] text-ink-mute">
                      {row.multi
                        ? `chọn nhiều${row.pickMax ? ` · tối đa ${row.pickMax}` : ''}`
                        : 'chọn một'}
                    </span>
                  </span>
                ),
              },
              {
                key: 'options',
                header: 'Lựa chọn',
                width: '110px',
                numeric: true,
                cell: (row) => <span className="text-ink-body">{row.options.length}</span>,
              },
              {
                key: 'dishes',
                header: 'Áp cho',
                width: '130px',
                numeric: true,
                cell: (row) => <span className="text-ink-body">{row.dishCount} món</span>,
              },
              {
                key: 'price',
                header: 'Chênh giá',
                width: '170px',
                numeric: true,
                cell: (row) => <span className="text-ink-body">{priceRange(row)}</span>,
              },
              {
                key: 'actions',
                header: '',
                width: '150px',
                cell: (row) => (
                  <span className="flex justify-end gap-1.5">
                    {mayEdit ? (
                      <>
                        <Button onClick={() => setDraft(toInput(row))} size="sm">
                          Sửa
                        </Button>
                        <Button
                          onClick={() => remove.mutate(row.id)}
                          disabled={row.dishCount > 0}
                          title={
                            row.dishCount > 0
                              ? 'Còn món đang dùng — gỡ khỏi các món đó trước'
                              : undefined
                          }
                          size="sm"
                          variant="danger"
                        >
                          Xoá
                        </Button>
                      </>
                    ) : null}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Tên và chênh giá của lựa chọn được ĐÓNG BĂNG vào dòng đơn lúc khách gọi, nên sửa ở đây
          không viết lại hoá đơn cũ. Món nào hỏi nhóm nào thì chọn trong trình sửa món, mục “Tuỳ
          chọn”.
        </p>
      </div>
    </>
  )
}

function GroupForm({
  draft,
  existing,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: ModifierGroupInput
  existing: boolean
  onChange: (next: ModifierGroupInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof ModifierGroupInput>(key: K, value: ModifierGroupInput[K]) =>
    onChange({ ...draft, [key]: value })

  const setOption = (index: number, patch: Partial<ModifierGroupInput['options'][number]>) =>
    onChange({
      ...draft,
      options: draft.options.map((o, i) => (i === index ? { ...o, ...patch } : o)),
    })

  // Nhóm bắt buộc mà một lựa chọn thì đó là thuộc tính của món, không phải câu hỏi
  const tooFewForRequired = draft.required && draft.options.length < 2
  const blocked =
    draft.id.trim().length < 2 ||
    draft.name.trim().length === 0 ||
    draft.options.some((o) => o.name.trim().length === 0) ||
    tooFewForRequired

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {existing ? `Sửa ${draft.name}` : 'Nhóm tuỳ chọn mới'}
      </p>

      <div className="mt-4 grid gap-4 lg:grid-cols-4">
        <Field label="Mã nhóm">
          <Input
            value={draft.id}
            disabled={existing}
            onChange={(v) => set('id', v)}
            placeholder="do-chin"
          />
        </Field>
        <Field label="Tên hiện cho khách">
          <Input value={draft.name} onChange={(v) => set('name', v)} placeholder="Độ chín" />
        </Field>
        <Field label="Bắt buộc chọn">
          <Toggle
            on={draft.required}

            onChange={() => set('required', !draft.required)}
            tone="ok"
          >
            {draft.required ? 'Bắt buộc' : 'Tuỳ ý'}
          </Toggle>
        </Field>
        <Field label="Số lựa chọn">
          <div className="flex gap-2">
            <Toggle
              on={draft.multi}

              onChange={() => set('multi', !draft.multi)}
              tone="ok"
            >
              {draft.multi ? 'Chọn nhiều' : 'Chọn một'}
            </Toggle>
            {draft.multi ? (
              <Input
                value={draft.pickMax === null ? '' : String(draft.pickMax)}
                onChange={(v) =>
                  set('pickMax', v.trim() === '' ? null : Number(v.replace(/\D/g, '')) || null)
                }
                placeholder="tối đa"
              />
            ) : null}
          </div>
        </Field>
      </div>

      <div className="mt-5">
        <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
          Lựa chọn
        </p>
        <div className="mt-2.5 flex flex-col gap-2">
          {draft.options.map((option, index) => (
            <div
              key={option.id ?? `moi-${index}`}
              className="grid grid-cols-[1fr_170px_150px_90px] items-center gap-3"
            >
              <Input
                value={option.name}
                onChange={(v) => setOption(index, { name: v })}
                placeholder="Tên lựa chọn"
              />
              <Input
                value={String(option.priceDelta)}
                onChange={(v) => setOption(index, { priceDelta: toMoney(v) })}
                placeholder="Chênh giá"
              />
              <Toggle
                on={option.affectsStock}

                onChange={() => setOption(index, { affectsStock: !option.affectsStock })}
                tone="ok"
              >
                {option.affectsStock ? 'Có trừ kho' : 'Không trừ kho'}
              </Toggle>
              <Button
                onClick={() =>
                  onChange({ ...draft, options: draft.options.filter((_, i) => i !== index) })
                }
                disabled={draft.options.length <= 1}
                size="sm"
                variant="danger"
              >
                Bỏ
              </Button>
            </div>
          ))}
        </div>

        <Button
          onClick={() =>
            onChange({
              ...draft,
              options: [
                ...draft.options,
                { id: null, name: '', priceDelta: 0, affectsStock: false },
              ],
            })
          }
          size="sm"
          className="mt-2.5"
        >
          Thêm lựa chọn
        </Button>
      </div>

      {tooFewForRequired ? (
        <p className="mt-4 text-[length:var(--fs-c1)] text-warn">
          Nhóm bắt buộc phải có ít nhất hai lựa chọn — một lựa chọn duy nhất là thuộc tính của món,
          không phải câu hỏi để hỏi khách.
        </p>
      ) : null}

      <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Bật “có trừ kho” khi lựa chọn là nguyên liệu thật (thêm tỏi, thêm rau) — nó vào giá vốn và
        trừ khỏi tồn. Lựa chọn kiểu “ít cay”, “không hành” thì để tắt.
      </p>

      <div className="mt-5 flex gap-2">
        <Button variant="primary" disabled={blocked || saving} onClick={onSave}>
          Lưu nhóm
        </Button>
        <Button onClick={onCancel}>Huỷ</Button>
      </div>
    </section>
  )
}

/** Chênh giá âm hợp lệ: bỏ bớt topping có thể giảm giá suất */
function toMoney(input: string): number {
  const negative = input.trim().startsWith('-')
  const digits = Number(input.replace(/\D/g, '')) || 0
  return negative ? -digits : digits
}

function priceRange(row: ModifierGroupRow): string {
  if (row.options.length === 0) return '—'
  const format = (value: number) => `${value.toLocaleString('vi-VN')}₫`
  return row.priceMin === row.priceMax
    ? format(row.priceMin)
    : `${format(row.priceMin)} – ${format(row.priceMax)}`
}

function toInput(row: ModifierGroupRow): ModifierGroupInput {
  return {
    id: row.id,
    name: row.name,
    required: row.required,
    multi: row.multi,
    pickMin: row.pickMin,
    pickMax: row.pickMax,
    options: row.options.map((o) => ({
      id: o.id,
      name: o.name,
      priceDelta: o.priceDelta,
      affectsStock: o.affectsStock,
    })),
  }
}
