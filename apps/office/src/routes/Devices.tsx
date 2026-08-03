import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type DeviceRow } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { Field, formatTime } from '../components/report'
import { useSession } from '../session-context'

/**
 * A4 — Thiết bị.
 *
 * Hai việc: **ghép máy mới** và **ngắt từ xa**. Ghép đi qua mã 6 số sống 10 phút
 * và dùng một lần — người quản lý sinh mã trên màn này rồi đọc cho người đang
 * đứng ở cái máy kia; không có cách nào dán token thẳng vào máy, vì token dán tay
 * là token sẽ được chép sang máy thứ hai.
 *
 * Ngắt thì cắt cả token thiết bị lẫn phiên nhân viên đang mở trên nó. Nếu chỉ cắt
 * token thiết bị thì cái tablet vừa mất vẫn gọi API bình thường cho tới khi phiên
 * hết hạn — tức là tới 12 tiếng sau, và đó không phải là "ngắt".
 */

const KIND_LABELS: Record<DeviceRow['kind'], string> = {
  pos: 'Tablet phục vụ',
  cashier: 'Máy thu ngân',
  kds: 'Màn bếp',
  kiosk: 'Kiosk chấm công',
  bridge: 'Cầu in',
}

export function Devices() {
  const { branchId } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<DeviceRow['kind']>('pos')
  const [stationId, setStationId] = useState('')

  const data = useQuery({
    queryKey: ['devices', branchId],
    queryFn: () => api.devices(branchId!),
    enabled: Boolean(branchId),
  })

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['devices'] })

  const makeCode = useMutation({
    mutationFn: () =>
      api.createPairingCode({
        branchId: branchId!,
        kind,
        stationId: kind === 'kds' ? stationId || null : null,
      }),
    onSuccess: (res) => {
      toast(`Mã ghép ${res.code} — đọc cho người đứng ở máy, sống 10 phút`, 'ok')
      invalidate()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const revoke = useMutation({
    mutationFn: (id: number) => api.revokeDevice(id),
    onSuccess: (res) => {
      toast(
        res.sessionsKilled > 0
          ? `Đã ngắt máy và cắt ${res.sessionsKilled} phiên đang mở trên đó`
          : 'Đã ngắt máy',
        'ok',
      )
      invalidate()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const devices = data.data?.devices ?? []
  const live = devices.filter((d) => d.revokedAt === null)
  const revoked = devices.filter((d) => d.revokedAt !== null)
  const stations = data.data?.stations ?? []
  const pending = data.data?.pendingCodes ?? []

  return (
    <>
      <PageHeader
        title="Thiết bị"
        subtitle="Máy nào của chi nhánh này đang được phép nói chuyện với hệ thống. Màn bếp ghim cứng một trạm ngay từ lúc ghép."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {data.isError ? <ErrorState message={(data.error as Error).message} /> : null}

        <section className="rounded-md border border-line-1 bg-surface-1 p-5">
          <div className="flex flex-wrap items-end gap-4">
            <Field label="Loại máy">
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as DeviceRow['kind'])}
                className="h-9 rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
              >
                {(Object.keys(KIND_LABELS) as DeviceRow['kind'][]).map((k) => (
                  <option key={k} value={k}>
                    {KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </Field>

            {kind === 'kds' ? (
              <Field label="Ghim vào trạm">
                <select
                  value={stationId}
                  onChange={(e) => setStationId(e.target.value)}
                  className="h-9 rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
                >
                  <option value="">Chọn trạm…</option>
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} · {s.name}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Button
              variant="primary"
              disabled={makeCode.isPending || (kind === 'kds' && !stationId)}
              onClick={() => makeCode.mutate()}
            >
              Sinh mã ghép
            </Button>

            <p className="max-w-[420px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Mã gồm 6 số, sống 10 phút và dùng một lần. Nhập ở màn hình mở đầu của máy cần ghép.
            </p>
          </div>

          {pending.length > 0 ? (
            <div className="mt-5 flex flex-wrap gap-3 border-t border-line-1 pt-4">
              {pending.map((c) => (
                <span
                  key={c.code}
                  className="inline-flex items-baseline gap-3 rounded-sm border border-accent bg-canvas px-3 py-2"
                >
                  <span className="font-mono text-[length:var(--fs-t2)] tracking-[0.2em] text-ink-hi">
                    {c.code}
                  </span>
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {KIND_LABELS[c.kind as DeviceRow['kind']] ?? c.kind}
                    {c.stationId ? ` · ${c.stationId}` : ''} · hết hạn {formatTime(c.expiresAt)}
                  </span>
                </span>
              ))}
            </div>
          ) : null}
        </section>

        <DeviceTable
          title="Đang hoạt động"
          rows={live}
          onRevoke={(id) => revoke.mutate(id)}
          busy={revoke.isPending}
        />

        {revoked.length > 0 ? <DeviceTable title="Đã ngắt" rows={revoked} /> : null}

        {data.isPending ? <p className="mt-4 text-ink-mute">Đang tải…</p> : null}
      </div>
    </>
  )
}

function DeviceTable({
  title,
  rows,
  onRevoke,
  busy = false,
}: {
  title: string
  rows: DeviceRow[]
  onRevoke?: (id: number) => void
  busy?: boolean
}) {
  return (
    <section className="mt-5">
      <h2 className="mb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {title}
      </h2>
      <DataTable
        rows={rows}
        rowKey={(row) => row.id}
        empty="Chưa có máy nào. Sinh mã ghép ở trên rồi nhập vào máy cần ghép."
        columns={[
          {
            key: 'name',
            header: 'Máy',
            width: 'minmax(200px, 1fr)',
            cell: (row) => (
              <span className={row.revokedAt ? 'opacity-60' : ''}>
                <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                  {row.name}
                </span>
                <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
                  ghép {formatTime(row.pairedAt)}
                  {row.pairedByName ? ` · ${row.pairedByName}` : ''}
                </span>
              </span>
            ),
          },
          {
            key: 'kind',
            header: 'Loại',
            width: '160px',
            cell: (row) => (
              <span className="text-[length:var(--fs-c1)] text-ink-body">
                {KIND_LABELS[row.kind] ?? row.kind}
              </span>
            ),
          },
          {
            key: 'station',
            header: 'Trạm',
            width: '150px',
            cell: (row) => (
              <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {row.stationId ? `${row.stationId} · ${row.stationName ?? ''}` : '—'}
              </span>
            ),
          },
          {
            key: 'signedIn',
            header: 'Đang đăng nhập',
            width: 'minmax(180px, 1fr)',
            cell: (row) => (
              <span className="flex flex-wrap gap-1.5">
                {row.signedIn.length === 0 ? (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">Không ai</span>
                ) : (
                  row.signedIn.map((name) => (
                    <Badge key={name} tone="ok">
                      {name}
                    </Badge>
                  ))
                )}
              </span>
            ),
          },
          {
            key: 'actions',
            header: '',
            width: '120px',
            cell: (row) => (
              <span className="flex justify-end">
                {onRevoke ? (
                  <Button
                    disabled={busy}
                    onClick={() => onRevoke(row.id)}
                    size="sm"
                    variant="danger"
                  >
                    Ngắt máy
                  </Button>
                ) : (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {formatTime(row.revokedAt!)}
                  </span>
                )}
              </span>
            ),
          },
        ]}
      />
    </section>
  )
}
