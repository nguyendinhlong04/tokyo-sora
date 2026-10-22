import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, type DeviceRow } from '../api'
import { ConfigBranchPicker, useConfigBranch } from '../components/config-branch'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { Field, formatTime } from '../components/report'

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
 *
 * iPad tại bàn (§9.1) chọn bàn ngay lúc sinh mã: mã ghép là thứ duy nhất nói iPad
 * đứng ở bàn nào, người cầm máy không tự khai được. Một bàn một iPad — chuyển iPad
 * sang bàn khác là ngắt máy ở đây rồi ghép lại.
 */

const KIND_LABELS: Record<DeviceRow['kind'], string> = {
  pos: 'Tablet phục vụ',
  cashier: 'Máy thu ngân',
  kds: 'Màn bếp',
  kiosk: 'Kiosk chấm công',
  bridge: 'Cầu in',
  table: 'iPad tại bàn',
}

export function Devices() {
  const { branchId } = useConfigBranch()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<DeviceRow['kind']>('pos')
  const [stationId, setStationId] = useState('')
  const [tableId, setTableId] = useState('')

  // Trạm và bàn là của từng chi nhánh — đổi chi nhánh mà giữ lựa chọn cũ thì mã
  // ghép sinh ra sẽ trỏ vào một trạm hay một bàn không có ở nơi mới.
  useEffect(() => {
    setStationId('')
    setTableId('')
  }, [branchId])

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
        tableId: kind === 'table' && tableId ? Number(tableId) : null,
      }),
    onSuccess: (res) => {
      toast(`Mã ghép ${res.code} — đọc cho người đứng ở máy, sống 10 phút`, 'ok')
      setTableId('')
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
  const tables = data.data?.tables ?? []
  const pending = data.data?.pendingCodes ?? []
  const missingTarget = (kind === 'kds' && !stationId) || (kind === 'table' && !tableId)

  return (
    <>
      <PageHeader
        title="Thiết bị"
        subtitle="Máy nào của chi nhánh này đang được phép nói chuyện với hệ thống. Màn bếp ghim cứng một trạm, iPad tại bàn ghim cứng một bàn ngay từ lúc ghép."
        action={<ConfigBranchPicker />}
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

            {kind === 'table' ? (
              <Field label="Gắn vào bàn">
                <select
                  value={tableId}
                  onChange={(e) => setTableId(e.target.value)}
                  className="h-9 rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
                >
                  <option value="">Chọn bàn…</option>
                  {tables.map((t) => (
                    <option key={t.id} value={t.id} disabled={t.hasIpad}>
                      {t.code}
                      {t.area ? ` · ${t.area}` : ''}
                      {t.hasIpad ? ' — đã có iPad' : ''}
                    </option>
                  ))}
                </select>
              </Field>
            ) : null}

            <Button
              variant="primary"
              disabled={makeCode.isPending || missingTarget}
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
                    {c.stationId ? ` · ${c.stationId}` : ''}
                    {c.tableCode ? ` · bàn ${c.tableCode}` : ''} · hết hạn {formatTime(c.expiresAt)}
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
            header: 'Trạm / bàn',
            width: '150px',
            cell: (row) => (
              <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {row.stationId
                  ? `${row.stationId} · ${row.stationName ?? ''}`
                  : row.tableCode
                    ? `Bàn ${row.tableCode}`
                    : '—'}
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
