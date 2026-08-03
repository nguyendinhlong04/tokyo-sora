import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type PrinterInput, type PrinterRow } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { Field } from '../components/report'
import { TextInput as Input, Toggle } from '../components/form'
import { useSession } from '../session-context'

/**
 * A5 — Máy in.
 *
 * Máy in không có danh tính như thiết bị ở A4: nó không gọi API, nó là ĐÍCH ĐẾN mà
 * cầu in gửi tới. Nên ở đây chỉ có địa chỉ trong mạng LAN, khổ giấy và trạm.
 *
 * Cấu hình này đi theo bundle cấu hình xuống cầu in. Đó là lý do màn này tồn tại:
 * cầu in đặt ở góc bếp không có màn hình, và nếu địa chỉ máy in không đi theo
 * bundle thì đổi một cái máy in phải cắm màn hình vào cái máy đó mà sửa file.
 */

const KIND_LABELS: Record<PrinterRow['kind'], string> = {
  bill: 'Bill · quầy thu ngân',
  tem: 'Tem · dán tại trạm',
}

const blank = (branchId: string): PrinterInput => ({
  branchId,
  name: '',
  kind: 'bill',
  stationId: null,
  host: '',
  port: 9100,
  template: 'k80-bill',
  copies: 1,
  active: true,
})

export function Printers() {
  const { branchId } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{ input: PrinterInput; id?: number } | null>(null)

  const data = useQuery({
    queryKey: ['printers', branchId],
    queryFn: () => api.printers(branchId!),
    enabled: Boolean(branchId),
  })

  const done = (message: string) => {
    toast(message, 'ok')
    setDraft(null)
    void queryClient.invalidateQueries({ queryKey: ['printers'] })
  }

  const save = useMutation({
    mutationFn: ({ input, id }: { input: PrinterInput; id?: number }) =>
      id === undefined ? api.createPrinter(input) : api.updatePrinter(id, input),
    onSuccess: () => done('Đã lưu máy in'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.deletePrinter(id),
    onSuccess: () => done('Đã bỏ máy in'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const printers = data.data?.printers ?? []
  const stations = data.data?.stations ?? []
  const templates = data.data?.templates ?? { bill: [], tem: [] }

  return (
    <>
      <PageHeader
        title="Máy in"
        subtitle="Máy in bill ở quầy và máy in tem tại trạm. Cấu hình ở đây đi theo bundle xuống cầu in — không phải sửa tay trên máy đặt trong bếp."
        action={
          draft || !branchId ? null : (
            <Button variant="primary" onClick={() => setDraft({ input: blank(branchId) })}>
              Thêm máy in
            </Button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {data.isError ? <ErrorState message={(data.error as Error).message} /> : null}

        {draft ? (
          <PrinterForm
            draft={draft.input}
            stations={stations}
            templates={templates}
            onChange={(input) => setDraft({ ...draft, input })}
            onCancel={() => setDraft(null)}
            onSave={() => save.mutate(draft)}
            saving={save.isPending}
          />
        ) : null}

        <div className="mt-5">
          <DataTable
            rows={printers}
            rowKey={(row) => row.id}
            loading={data.isPending}
            empty="Chi nhánh này chưa khai máy in nào."
            columns={[
              {
                key: 'name',
                header: 'Máy in',
                width: 'minmax(180px, 1fr)',
                cell: (row) => (
                  <span className={row.active ? '' : 'opacity-60'}>
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.name}
                    </span>
                    {!row.active ? (
                      <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
                        đang tắt — cầu in không nhận máy này
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'kind',
                header: 'Loại',
                width: '190px',
                cell: (row) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-body">
                    {KIND_LABELS[row.kind]}
                  </span>
                ),
              },
              {
                key: 'station',
                header: 'Trạm',
                width: '150px',
                cell: (row) => (
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {row.stationId ?? '—'}
                  </span>
                ),
              },
              {
                key: 'host',
                header: 'Địa chỉ',
                width: '180px',
                cell: (row) => (
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
                    {row.host}:{row.port}
                  </span>
                ),
              },
              {
                key: 'template',
                header: 'Mẫu in',
                width: '130px',
                cell: (row) => (
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {row.template}
                    {row.copies > 1 ? ` ×${row.copies}` : ''}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: '',
                width: '150px',
                cell: (row) => (
                  <span className="flex justify-end gap-2">
                    <Button onClick={() => setDraft({ input: toInput(row), id: row.id })} size="sm">
                      Sửa
                    </Button>
                    <Button onClick={() => remove.mutate(row.id)} size="sm" variant="danger">
                      Bỏ
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Sửa xong nhớ phát hành lại bundle cấu hình thì cầu in mới thấy — cùng cơ chế với sơ đồ bàn
          và thực đơn. Chưa có trong bản dựng này: nút in thử, và trình soạn mẫu in.
        </p>
      </div>
    </>
  )
}

function toInput(row: PrinterRow): PrinterInput {
  return {
    branchId: row.branchId,
    name: row.name,
    kind: row.kind,
    stationId: row.stationId,
    host: row.host,
    port: row.port,
    template: row.template,
    copies: row.copies,
    active: row.active,
  }
}

function PrinterForm({
  draft,
  stations,
  templates,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: PrinterInput
  stations: { id: string; name: string }[]
  templates: Record<PrinterRow['kind'], string[]>
  onChange: (next: PrinterInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof PrinterInput>(key: K, value: PrinterInput[K]) =>
    onChange({ ...draft, [key]: value })

  /**
   * Đổi loại máy là đổi luôn cả trạm và mẫu in cho hợp lệ. Không làm vậy thì
   * người dùng chuyển "bill" sang "tem" rồi bấm lưu và nhận về một lỗi mà họ
   * không gây ra một cách có ý thức.
   */
  const changeKind = (kind: PrinterRow['kind']) =>
    onChange({
      ...draft,
      kind,
      stationId: kind === 'tem' ? (draft.stationId ?? stations[0]?.id ?? null) : null,
      template: templates[kind][0] ?? draft.template,
    })

  const ready =
    draft.name.trim() !== '' &&
    draft.host.trim() !== '' &&
    (draft.kind === 'bill' || draft.stationId !== null)

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Tên máy in">
          <Input value={draft.name} onChange={(v) => set('name', v)} placeholder="Quầy thu ngân" />
        </Field>

        <Field label="Loại">
          <select
            value={draft.kind}
            onChange={(e) => changeKind(e.target.value as PrinterRow['kind'])}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            {(Object.keys(KIND_LABELS) as PrinterRow['kind'][]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </Field>

        {draft.kind === 'tem' ? (
          <Field label="Trạm dán tem">
            <select
              value={draft.stationId ?? ''}
              onChange={(e) => set('stationId', e.target.value || null)}
              className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
            >
              <option value="">Chọn trạm…</option>
              {stations.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} · {s.name}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <div />
        )}

        <Field label="Mẫu in">
          <select
            value={draft.template}
            onChange={(e) => set('template', e.target.value)}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 font-mono text-[length:var(--fs-b2)] text-ink-hi"
          >
            {templates[draft.kind].map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Địa chỉ trong mạng LAN">
          <Input value={draft.host} onChange={(v) => set('host', v)} placeholder="10.0.0.21" mono />
        </Field>
        <Field label="Cổng">
          <Input
            value={String(draft.port)}
            onChange={(v) => set('port', Number(v) || 0)}
            type="number"
            mono
          />
        </Field>
        <Field label="Số bản mỗi lượt">
          <Input
            value={String(draft.copies)}
            onChange={(v) => set('copies', Number(v) || 1)}
            type="number"
            mono
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Toggle onChange={() => set('active', !draft.active)} on={draft.active} tone="ok">
          {draft.active ? 'Đang dùng' : 'Đang tắt'}
        </Toggle>
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel}>Bỏ</Button>
          <Button variant="primary" disabled={!ready || saving} onClick={onSave}>
            Lưu máy in
          </Button>
        </div>
      </div>
    </section>
  )
}
