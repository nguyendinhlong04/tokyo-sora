import { formatVnd } from '@sora/contracts'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, type DeliveryZone, type ParameterRow } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

const BLANK = (branchId: string, sort: number): Omit<DeliveryZone, 'id'> => ({
  branchId,
  name: '',
  wards: [],
  feeVnd: 15_000,
  minOrderVnd: 150_000,
  etaMinutes: 30,
  active: true,
  sort,
})

/**
 * O10 — Vùng giao & phí.
 *
 * Bản thiết kế vẽ một bản đồ để khoanh đa giác. Hệ thống hiện khớp vùng theo TÊN
 * PHƯỜNG — đó là thứ khách gõ ở O1 và là thứ máy chủ đối chiếu — nên màn này
 * nhập theo phường. Bản đồ chỉ có nghĩa khi có toạ độ địa chỉ khách, mà luồng
 * đặt món hiện chưa hỏi toạ độ.
 */
export function DeliveryZones() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('admin.manage-accounts-roles')
  const [draft, setDraft] = useState<(Omit<DeliveryZone, 'id'> & { id?: number }) | null>(null)

  const zones = useQuery({
    queryKey: ['zones', branchId],
    queryFn: () => api.deliveryZones(branchId!),
    enabled: Boolean(branchId),
  })

  const params = useQuery({
    queryKey: ['parameters', branchId],
    queryFn: () => api.parameters(branchId!),
    enabled: Boolean(branchId),
  })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['zones'] })
  const fail = (err: Error) => toast(err.message, 'danger')

  const save = useMutation({
    mutationFn: (zone: Omit<DeliveryZone, 'id'> & { id?: number }) =>
      zone.id ? api.updateZone(zone.id, zone) : api.createZone(zone),
    onSuccess: () => {
      toast('Đã lưu vùng giao', 'ok')
      setDraft(null)
      refresh()
    },
    onError: fail,
  })

  const remove = useMutation({
    mutationFn: (zone: DeliveryZone) => api.deleteZone(zone.id),
    onSuccess: () => {
      toast('Đã xoá vùng', 'ok')
      refresh()
    },
    onError: fail,
  })

  const saveParam = useMutation({
    mutationFn: (input: { key: string; value: number }) =>
      api.setParameter(input.key, input.value, branchId!),
    onSuccess: () => {
      toast('Đã lưu giờ ngừng nhận', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['parameters'] })
    },
    onError: fail,
  })

  const rows = zones.data ?? []
  const byKey = new Map((params.data ?? []).map((p) => [p.key, p]))

  return (
    <>
      <PageHeader
        title="Vùng giao & phí"
        subtitle="Khớp theo tên phường — đúng thứ khách gõ ở bước chọn kiểu nhận. Một phường chỉ thuộc một vùng, nếu không khách nhập địa chỉ đó sẽ bị chặn."
        action={
          mayEdit ? (
            <Button variant="primary" onClick={() => setDraft(BLANK(branchId!, rows.length + 1))}>
              Thêm vùng
            </Button>
          ) : null
        }
      />

      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto px-8 pb-8 xl:grid-cols-[1fr_380px] xl:items-start">
        <DataTable
          rows={rows}
          rowKey={(zone) => zone.id}
          loading={zones.isPending}
          empty='Chi nhánh này chưa khai vùng giao nào — khách chọn "giao hàng" sẽ được báo là ngoài vùng.'
          columns={[
            {
              key: 'name',
              header: 'Vùng',
              width: 'minmax(200px, 1fr)',
              cell: (zone) => (
                <span className={zone.active ? '' : 'opacity-55'}>
                  <span className="block text-[length:var(--fs-b2)] text-ink-hi">{zone.name}</span>
                  <span className="mt-1 block truncate text-[length:var(--fs-c1)] text-ink-mute">
                    {zone.wards.join(' · ')}
                  </span>
                </span>
              ),
            },
            {
              key: 'fee',
              header: 'Phí giao',
              width: '130px',
              numeric: true,
              cell: (zone) => (
                <span className="text-[length:var(--fs-b2)] text-ink-hi">
                  {formatVnd(zone.feeVnd)}
                </span>
              ),
            },
            {
              key: 'minOrder',
              header: 'Đơn tối thiểu',
              width: '140px',
              numeric: true,
              cell: (zone) => (
                <span className="text-[length:var(--fs-b2)] text-ink-hi">
                  {formatVnd(zone.minOrderVnd)}
                </span>
              ),
            },
            {
              key: 'eta',
              header: 'Thời gian',
              width: '110px',
              numeric: true,
              cell: (zone) => <span className="text-ink-mute">{zone.etaMinutes}′</span>,
            },
            {
              key: 'actions',
              header: '',
              width: '160px',
              cell: (zone) => (
                <span className="flex justify-end gap-2">
                  <Button size="sm" disabled={!mayEdit} onClick={() => setDraft(zone)}>
                    Sửa
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    disabled={!mayEdit}
                    onClick={() => remove.mutate(zone)}
                  >
                    Xoá
                  </Button>
                </span>
              ),
            },
          ]}
        />

        <section className="rounded-md border border-line-1 bg-surface-1 p-6">
          <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Giờ ngừng nhận đơn
          </p>
          <div className="mt-4 grid gap-4">
            <MinuteField
              row={byKey.get('online.lastOrderMinute')}
              label="Đơn mang về"
              disabled={!mayEdit}
              onSave={(value) => saveParam.mutate({ key: 'online.lastOrderMinute', value })}
            />
            <MinuteField
              row={byKey.get('online.lastOrderMinuteDelivery')}
              label="Đơn giao hàng"
              disabled={!mayEdit}
              onSave={(value) => saveParam.mutate({ key: 'online.lastOrderMinuteDelivery', value })}
            />
          </div>
          <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Đơn giao nên chốt sớm hơn: chuyến ship cuối phải về trước khi quán đóng. Sau giờ này
            khách vẫn xem được thực đơn nhưng không còn khung giờ nào để chọn.
          </p>
          <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">
            Giờ mở nhận đơn và thời gian bếp cần nằm ở{' '}
            <Link to="/tham-so" className="text-accent-ink">
              A6 · Trung tâm tham số
            </Link>
            .
          </p>
        </section>
      </div>

      {draft ? (
        <ZoneEditor
          value={draft}
          busy={save.isPending}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => save.mutate(draft)}
        />
      ) : null}
    </>
  )
}

/** Tham số lưu bằng phút kể từ 00:00; người nhập thì nghĩ bằng giờ treo tường */
function MinuteField({
  row,
  label,
  disabled,
  onSave,
}: {
  row: ParameterRow | undefined
  label: string
  disabled: boolean
  onSave: (value: number) => void
}) {
  const current = typeof row?.effectiveValue === 'number' ? row.effectiveValue : 0
  const [draft, setDraft] = useState(toClock(current))

  // Tham số về sau lần dựng đầu — không đồng bộ lại thì ô hiện 00:00 kèm nút Lưu
  useEffect(() => {
    if (row) setDraft(toClock(current))
  }, [row, current])

  if (!row) {
    return (
      <div>
        <p className="text-[length:var(--fs-b2)] text-ink-hi">{label}</p>
        <p className="mt-1 text-[length:var(--fs-c1)] text-warn">Chưa có tham số này.</p>
      </div>
    )
  }

  const parsed = toMinutes(draft)
  const dirty = parsed !== null && parsed !== current

  return (
    <label className="block">
      <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">{label}</span>
      <div className="flex gap-2">
        <input
          value={draft}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="21:00"
          className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
        />
        {dirty ? (
          <Button variant="primary" onClick={() => onSave(parsed)}>
            Lưu
          </Button>
        ) : null}
      </div>
      {parsed === null ? (
        <span className="mt-1 block text-[length:var(--fs-c1)] text-danger">
          Viết theo mẫu 21:00
        </span>
      ) : null}
    </label>
  )
}

function toClock(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`
}

function toMinutes(clock: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(clock.trim())
  if (!match) return null
  const minutes = Number(match[1]) * 60 + Number(match[2])
  return minutes >= 0 && minutes < 1440 ? minutes : null
}

function ZoneEditor({
  value,
  busy,
  onChange,
  onClose,
  onSave,
}: {
  value: Omit<DeliveryZone, 'id'> & { id?: number }
  busy: boolean
  onChange: (next: Omit<DeliveryZone, 'id'> & { id?: number }) => void
  onClose: () => void
  onSave: () => void
}) {
  const set = (patch: Partial<DeliveryZone>) => onChange({ ...value, ...patch })

  return (
    <div className="fixed inset-0 z-100 grid place-items-center bg-canvas/60 p-6" onClick={onClose}>
      <div
        className="w-full max-w-[560px] rounded-md border border-line-1 bg-surface-1 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
          {value.id ? `Sửa vùng ${value.name}` : 'Thêm vùng giao'}
        </h2>

        <label className="mt-5 block">
          <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">Tên vùng</span>
          <input
            value={value.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Vòng 1 · quanh quán"
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">
            Phường/xã trong vùng
          </span>
          <textarea
            rows={3}
            value={value.wards.join(', ')}
            onChange={(e) =>
              set({
                wards: e.target.value
                  .split(',')
                  .map((w) => w.trim())
                  .filter(Boolean),
              })
            }
            placeholder="Dịch Vọng, Dịch Vọng Hậu, Quan Hoa"
            className="w-full resize-y rounded-sm border border-line-1 bg-canvas p-3 text-[length:var(--fs-b2)] leading-relaxed text-ink-hi"
          />
          <span className="mt-1.5 block text-[length:var(--fs-c1)] text-ink-mute">
            Ngăn nhau bằng dấu phẩy. Viết có dấu cũng được — khách gõ "Phường Dịch Vọng" hay "dich
            vong" đều khớp.
          </span>
        </label>

        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <label className="block">
            <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">Phí giao</span>
            <input
              type="number"
              min={0}
              step={1000}
              value={value.feeVnd}
              onChange={(e) => set({ feeVnd: Number(e.target.value) })}
              className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">
              Đơn tối thiểu
            </span>
            <input
              type="number"
              min={0}
              step={10000}
              value={value.minOrderVnd}
              onChange={(e) => set({ minOrderVnd: Number(e.target.value) })}
              className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            />
          </label>
          <label className="block">
            <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">
              Thời gian (phút)
            </span>
            <input
              type="number"
              min={1}
              max={240}
              value={value.etaMinutes}
              onChange={(e) => set({ etaMinutes: Number(e.target.value) })}
              className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
            />
          </label>
        </div>

        <label className="mt-4 flex items-center gap-2.5 text-[length:var(--fs-b2)] text-ink-hi">
          <input
            type="checkbox"
            checked={value.active}
            onChange={(e) => set({ active: e.target.checked })}
          />
          Đang nhận giao ở vùng này
        </label>

        <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Đơn tối thiểu so trên tiền MÓN, chưa gồm phí giao — vùng xa thì một chuyến ship phải cõng
          được nhiều tiền món hơn mới đáng đi.
        </p>

        <div className="mt-6 flex justify-end gap-2">
          <Button onClick={onClose}>Huỷ</Button>
          <Button
            variant="primary"
            disabled={busy || value.name.trim() === '' || value.wards.length === 0}
            onClick={onSave}
          >
            Lưu vùng
          </Button>
        </div>
      </div>
    </div>
  )
}
