import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type AreaRow, type TableInput, type TableRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

const KIND_LABEL: Record<TableRow['kind'], string> = {
  standard: 'Bàn thường',
  grill: 'Bàn nướng có bếp',
  private: 'Phòng riêng',
}

const GRILL_LABEL: Record<string, string> = { than: 'Than', gas: 'Gas', dien: 'Điện' }

const BLANK = (branchId: string, areaId: number | null): TableInput => ({
  branchId,
  areaId,
  code: '',
  kind: 'standard',
  hasGrill: false,
  grillType: null,
  seatMin: 2,
  seatMax: 4,
  active: true,
})

/**
 * A3 — Khu vực & bàn.
 *
 * Ba thuộc tính ở đây đi thẳng vào vận hành, không phải trang trí: `kind` quyết
 * định khách đặt được kiểu chỗ nào ở W6, `hasGrill` quyết định món sống đi trạm
 * nào (§16), và sức chứa quyết định lưới khung giờ còn nhận hay không.
 */
export function Floorplan() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('admin.manage-accounts-roles')
  const [editing, setEditing] = useState<(TableInput & { id?: number }) | null>(null)
  const [newArea, setNewArea] = useState('')

  const plan = useQuery({
    queryKey: ['floorplan', branchId],
    queryFn: () => api.floorplan(branchId!),
    enabled: Boolean(branchId),
  })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['floorplan'] })
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const addArea = useMutation({
    mutationFn: () => api.createArea(branchId!, newArea.trim()),
    onSuccess: () => {
      toast('Đã thêm khu', 'ok')
      setNewArea('')
      refresh()
    },
    onError: fail,
  })

  const removeArea = useMutation({
    mutationFn: (area: AreaRow) => api.deleteArea(area.id),
    onSuccess: () => {
      toast('Đã xoá khu', 'ok')
      refresh()
    },
    onError: fail,
  })

  const saveTable = useMutation({
    mutationFn: (input: TableInput & { id?: number }) =>
      input.id ? api.updateTable(input.id, input) : api.createTable(input),
    onSuccess: () => {
      toast('Đã lưu bàn', 'ok')
      setEditing(null)
      refresh()
    },
    onError: fail,
  })

  const deactivate = useMutation({
    mutationFn: (table: TableRow) => api.deactivateTable(table.id),
    onSuccess: () => {
      toast('Bàn đã ngừng dùng — dữ liệu cũ giữ nguyên', 'ok')
      refresh()
    },
    onError: fail,
  })

  const areas = plan.data?.areas ?? []
  const tables = plan.data?.tables ?? []
  const active = tables.filter((t) => t.active)

  return (
    <>
      <PageHeader
        title="Khu vực & bàn"
        subtitle={`${active.length} bàn đang dùng · ${active.filter((t) => t.hasGrill).length} bàn có bếp · ${active.filter((t) => t.kind === 'private').length} phòng riêng. Sức chứa đặt bàn của W6 đếm từ đúng bảng này.`}
        action={
          mayEdit && areas.length > 0 ? (
            <Button variant="primary" onClick={() => setEditing(BLANK(branchId!, areas[0]!.id))}>
              Thêm bàn
            </Button>
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {plan.isPending ? (
          <p className="text-ink-mute">Đang tải sơ đồ…</p>
        ) : (
          <>
            {areas.map((area) => {
              const rows = tables.filter((t) => t.areaId === area.id)
              return (
                <section
                  key={area.id}
                  className="mb-4 overflow-hidden rounded-md border border-line-1 bg-surface-1"
                >
                  <header className="flex items-center gap-3 border-b border-line-1 bg-canvas px-5 py-3">
                    <p className="text-[length:var(--fs-b2)] font-semibold text-ink-hi">
                      {area.name}
                    </p>
                    <span className="text-[length:var(--fs-c1)] text-ink-mute">
                      {rows.length} bàn
                    </span>
                    {mayEdit && rows.length === 0 ? (
                      <Button
                        onClick={() => removeArea.mutate(area)}
                        size="sm"
                        variant="danger"
                        className="ml-auto"
                      >
                        Xoá khu
                      </Button>
                    ) : null}
                  </header>

                  {rows.length === 0 ? (
                    <p className="px-5 py-4 text-[length:var(--fs-c1)] text-ink-mute">
                      Khu này chưa có bàn nào.
                    </p>
                  ) : (
                    rows.map((table) => (
                      <div
                        key={table.id}
                        className={`grid items-center gap-4 border-b border-line-1 px-5 py-3 lg:grid-cols-[80px_1fr_140px_120px_120px_auto] ${
                          table.active ? '' : 'opacity-55'
                        }`}
                      >
                        <span className="font-mono text-[length:var(--fs-t2)] text-ink-hi">
                          {table.code}
                        </span>
                        <span className="text-[length:var(--fs-b2)] text-ink-body">
                          {KIND_LABEL[table.kind]}
                          {table.hasGrill ? ` · bếp ${GRILL_LABEL[table.grillType ?? '']}` : ''}
                        </span>
                        <span className="text-[length:var(--fs-b2)] text-ink-body">
                          {table.seatMin}–{table.seatMax} chỗ
                        </span>
                        <span className="text-[length:var(--fs-c1)] text-ink-mute">
                          {table.busy ? 'Đang có khách' : table.active ? 'Trống' : 'Ngừng dùng'}
                        </span>
                        <span />
                        <div className="flex gap-2">
                          <Button
                            disabled={!mayEdit}
                            onClick={() => setEditing({ ...table, branchId: branchId! })}
                          >
                            Sửa
                          </Button>
                          {table.active ? (
                            <Button
                              variant="danger"
                              disabled={!mayEdit || table.busy || deactivate.isPending}
                              onClick={() => deactivate.mutate(table)}
                            >
                              Ngừng dùng
                            </Button>
                          ) : null}
                        </div>
                      </div>
                    ))
                  )}
                </section>
              )
            })}

            {mayEdit ? (
              <div className="flex items-center gap-2">
                <input
                  value={newArea}
                  onChange={(e) => setNewArea(e.target.value)}
                  placeholder="Tên khu mới — Khu Sakura, Phòng riêng…"
                  className="h-10 w-[320px] rounded-sm border border-line-1 bg-surface-1 px-3 text-[length:var(--fs-b2)] text-ink-hi"
                />
                <Button
                  disabled={newArea.trim() === '' || addArea.isPending}
                  onClick={() => addArea.mutate()}
                >
                  Thêm khu
                </Button>
              </div>
            ) : null}
          </>
        )}
      </div>

      {editing ? (
        <TableEditor
          value={editing}
          areas={areas}
          busy={saveTable.isPending}
          onChange={setEditing}
          onClose={() => setEditing(null)}
          onSave={() => saveTable.mutate(editing)}
        />
      ) : null}
    </>
  )
}

function TableEditor({
  value,
  areas,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  value: TableInput & { id?: number }
  areas: AreaRow[]
  busy: boolean
  onChange: (next: TableInput & { id?: number }) => void
  onClose: () => void
  onSave: () => void
}) {
  const set = (patch: Partial<TableInput>) => onChange({ ...value, ...patch })

  return (
    <div className="fixed inset-0 z-100 grid place-items-center bg-canvas/60 p-6" onClick={onClose}>
      <div
        className="w-full max-w-[520px] rounded-md border border-line-1 bg-surface-1 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
          {value.id ? `Sửa bàn ${value.code}` : 'Thêm bàn'}
        </h2>

        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Số bàn
            </span>
            <input
              value={value.code}
              onChange={(e) => set({ code: e.target.value })}
              className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Khu
            </span>
            <select
              value={value.areaId ?? ''}
              onChange={(e) => set({ areaId: e.target.value ? Number(e.target.value) : null })}
              className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
            >
              {areas.map((area) => (
                <option key={area.id} value={area.id}>
                  {area.name}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Loại chỗ
            </span>
            <select
              value={value.kind}
              onChange={(e) => set({ kind: e.target.value as TableRow['kind'] })}
              className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
            >
              {Object.entries(KIND_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Bếp tại bàn
            </span>
            <select
              value={value.hasGrill ? (value.grillType ?? 'than') : ''}
              onChange={(e) =>
                set(
                  e.target.value
                    ? { hasGrill: true, grillType: e.target.value as TableRow['grillType'] }
                    : { hasGrill: false, grillType: null },
                )
              }
              className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
            >
              <option value="">Không có bếp</option>
              {Object.entries(GRILL_LABEL).map(([id, label]) => (
                <option key={id} value={id}>
                  Bếp {label.toLowerCase()}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Sức chứa tối thiểu
            </span>
            <input
              type="number"
              min={1}
              value={value.seatMin}
              onChange={(e) => set({ seatMin: Number(e.target.value) })}
              className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Sức chứa tối đa
            </span>
            <input
              type="number"
              min={1}
              value={value.seatMax}
              onChange={(e) => set({ seatMax: Number(e.target.value) })}
              className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            />
          </label>
        </div>

        <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Bàn có bếp than thì món sống ra quầy sống để khách tự nướng; bàn không bếp thì bếp nướng
          hộ và món cộng thêm thời gian. Sức chứa tối đa là con số W6 dùng để lọc bàn cho nhóm
          khách.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onClose}>Huỷ</Button>
          <Button variant="primary" disabled={busy || value.code.trim() === ''} onClick={onSave}>
            Lưu
          </Button>
        </div>
      </div>
    </div>
  )
}
