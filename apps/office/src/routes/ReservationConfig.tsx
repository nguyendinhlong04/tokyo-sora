import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { api, type ParameterRow } from '../api'
import { ConfigBranchPicker, useConfigBranch } from '../components/config-branch'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

/** Đúng những tham số mà miền đặt bàn đọc — không hiện ô nào không ai đọc */
const FIELDS: { key: string; label: string; hint: string }[] = [
  {
    key: 'reservation.slotStepMinutes',
    label: 'Bước lưới khung giờ',
    hint: 'Khoảng cách giữa hai khung trên W6. 30 phút là mặc định.',
  },
  {
    key: 'reservation.mealMinutesSmall',
    label: 'Thời lượng bữa · nhóm tới 3 khách',
    hint: 'Suất cuối trong ngày phải kết thúc trước giờ đóng cửa.',
  },
  {
    key: 'reservation.mealMinutesLarge',
    label: 'Thời lượng bữa · nhóm từ 4 khách',
    hint: 'Nhóm đông ăn lâu hơn nên suất cuối lùi sớm hơn.',
  },
  {
    key: 'reservation.turnBufferMinutes',
    label: 'Đệm dọn bàn',
    hint: 'Cộng vào sau mỗi bữa; đây là thứ chặn suất kế tiếp trên cùng một bàn.',
  },
  {
    key: 'reservation.leadMinutes',
    label: 'Đặt trước tối thiểu',
    hint: 'Khung gần hơn ngần này phút sẽ mờ đi trên W6.',
  },
  {
    key: 'reservation.softHoldMinutes',
    label: 'Giữ chỗ mềm khi khách đang điền',
    hint: 'Hết giờ thì suất tự trả về lưới, không cần ai dọn.',
  },
  {
    key: 'reservation.tableHoldMinutes',
    label: 'Giữ bàn sau giờ hẹn',
    hint: 'Chưa hết ngần này phút thì R4 chưa cho đánh no-show.',
  },
  {
    key: 'reservation.horizonDays',
    label: 'Nhận đặt trước tối đa (ngày)',
    hint: 'Xa hơn thì thực đơn và giá đã khác.',
  },
  {
    key: 'reservation.maxGuestsOnline',
    label: 'Nhóm tối đa đặt qua web',
    hint: 'Đông hơn thì W6 mời khách gọi điện để nhân viên ghép bàn.',
  },
  {
    key: 'reservation.remindAheadHours',
    label: 'Cữ nhắc sớm (giờ trước hẹn)',
    hint: 'Suất tới cữ này hiện trong hàng đợi nhắc của R4.',
  },
  {
    key: 'reservation.remindSoonHours',
    label: 'Cữ nhắc gần (giờ trước hẹn)',
    hint: 'Cữ chốt lại trước giờ ăn; khách xác nhận lại ở cữ này là chắc nhất.',
  },
]

/** Trần suất và tiền cọc khai theo KIỂU CHỖ — suất đặt theo kiểu chỗ, không theo khu sàn */
const SEAT_KINDS: { id: string; label: string }[] = [
  { id: 'Standard', label: 'Bàn thường' },
  { id: 'Grill', label: 'Bàn nướng có bếp' },
  { id: 'Private', label: 'Phòng riêng' },
]

/**
 * R3 — Cấu hình nhận đặt.
 *
 * Màn này cố tình chỉ hiện những thứ engine THẬT SỰ đọc. Giờ nhận đặt vẫn là
 * chuỗi giờ mở cửa ở A10 chứ không phải một bảng khung giờ theo thứ: hai nguồn
 * cho cùng một câu trả lời thì sớm muộn cũng lệch nhau.
 */
export function ReservationConfig() {
  const { can } = useSession()
  const { branchId } = useConfigBranch()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('admin.manage-accounts-roles')

  const params = useQuery({
    queryKey: ['parameters', branchId],
    queryFn: () => api.parameters(branchId!),
    enabled: Boolean(branchId),
  })

  const branches = useQuery({ queryKey: ['admin-branches'], queryFn: api.branches })
  const floorplan = useQuery({
    queryKey: ['floorplan', branchId],
    queryFn: () => api.floorplan(branchId!),
    enabled: Boolean(branchId),
  })

  const save = useMutation({
    mutationFn: (input: { key: string; value: unknown }) =>
      api.setParameter(input.key, input.value, branchId!),
    onSuccess: () => {
      toast('Đã lưu cho chi nhánh này', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['parameters'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const blocked = useQuery({
    queryKey: ['reservation-blocked-days', branchId],
    queryFn: () => api.blockedDays(branchId!),
    enabled: Boolean(branchId),
  })

  const blockDay = useMutation({
    mutationFn: (input: { day: string; reason: string }) =>
      api.blockDay(branchId!, input.day, input.reason),
    onSuccess: (row) => {
      toast(
        row.existingReservations > 0
          ? `Đã chặn ${row.day} — ngày này đang có ${row.existingReservations} suất, nhớ gọi từng khách`
          : `Đã chặn ${row.day}`,
        row.existingReservations > 0 ? 'warn' : 'ok',
      )
      void queryClient.invalidateQueries({ queryKey: ['reservation-blocked-days', branchId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const unblockDay = useMutation({
    mutationFn: (id: number) => api.unblockDay(id),
    onSuccess: () => {
      toast('Đã mở lại ngày này', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['reservation-blocked-days', branchId] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const [newDay, setNewDay] = useState('')
  const [newReason, setNewReason] = useState('')

  const byKey = new Map((params.data ?? []).map((row) => [row.key, row]))
  const branch = branches.data?.find((b) => b.id === branchId)
  const tables = floorplan.data?.tables.filter((t) => t.active) ?? []
  const autoConfirm = byKey.get('reservation.autoConfirm')

  return (
    <>
      <PageHeader
        title="Cấu hình nhận đặt"
        subtitle={`Áp cho chi nhánh ${branch?.name ?? branchId}. Mỗi ô dưới đây là một con số miền đặt bàn đọc lúc dựng lưới khung giờ của W6.`}
        action={<ConfigBranchPicker />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="max-w-[720px]">
          <section className="rounded-md border border-line-1 bg-surface-1 p-6">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Hai thứ không nằm ở đây
            </p>
            <dl className="mt-4 grid gap-3 text-[length:var(--fs-b2)]">
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-mute">Giờ nhận đặt</dt>
                <dd className="m-0 text-right">
                  <span className="font-mono text-ink-hi">{branch?.openHours ?? '—'}</span>
                  <Link to="/chi-nhanh" className="ml-3 text-accent-ink">
                    Sửa ở A10 →
                  </Link>
                </dd>
              </div>
              <div className="flex items-baseline justify-between gap-4">
                <dt className="text-ink-mute">Sức chứa</dt>
                <dd className="m-0 text-right">
                  <span className="text-ink-hi">
                    {tables.length} bàn · {tables.filter((t) => t.kind === 'grill').length} bàn
                    nướng · {tables.filter((t) => t.kind === 'private').length} phòng riêng
                  </span>
                  <Link to="/so-do-ban" className="ml-3 text-accent-ink">
                    Sửa ở A3 →
                  </Link>
                </dd>
              </div>
            </dl>
            <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Lưới khung giờ dựng từ giờ mở cửa của chi nhánh; còn chỗ hay hết thì đếm từ bàn thật.
              Trần bên dưới chỉ HẠ con số đó xuống khi bếp kham không nổi, không thay nó — đặt trần
              cao hơn số bàn thì cũng chỉ có ngần ấy bàn.
            </p>
          </section>

          <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-6">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Chế độ xác nhận
            </p>
            <div className="mt-4 flex items-center justify-between gap-6">
              <div>
                <p className="text-[length:var(--fs-b2)] text-ink-hi">Xác nhận tự động</p>
                <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
                  Tắt để mọi đặt chỗ từ web nằm chờ nhân viên duyệt tay ở R2.
                </p>
              </div>
              <Button
                disabled={!mayEdit || save.isPending || !autoConfirm}
                onClick={() =>
                  save.mutate({
                    key: 'reservation.autoConfirm',
                    value: !autoConfirm?.effectiveValue,
                  })
                }
              >
                {autoConfirm?.effectiveValue === false ? 'Đang duyệt tay' : 'Đang tự động'}
              </Button>
            </div>
          </section>

          <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-6">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Thời lượng &amp; giữ chỗ
            </p>
            <div className="mt-4 grid gap-5 lg:grid-cols-2">
              {FIELDS.map((field) => (
                <NumberField
                  key={field.key}
                  row={byKey.get(field.key)}
                  label={field.label}
                  hint={field.hint}
                  disabled={!mayEdit || save.isPending}
                  onSave={(value) => save.mutate({ key: field.key, value })}
                />
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-6">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Trần suất mỗi khung
            </p>
            <div className="mt-4 grid gap-5 lg:grid-cols-3">
              {SEAT_KINDS.map((seat) => (
                <NumberField
                  key={seat.id}
                  row={byKey.get(`reservation.slotCap${seat.id}`)}
                  label={seat.label}
                  hint="0 là không đặt trần — nhận tới khi hết bàn."
                  disabled={!mayEdit || save.isPending}
                  onSave={(value) => save.mutate({ key: `reservation.slotCap${seat.id}`, value })}
                />
              ))}
            </div>
          </section>

          <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-6">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Đặt cọc
            </p>
            <div className="mt-4 grid gap-5 lg:grid-cols-3">
              {SEAT_KINDS.map((seat) => (
                <NumberField
                  key={seat.id}
                  row={byKey.get(`reservation.deposit${seat.id}Vnd`)}
                  label={`${seat.label} (đồng)`}
                  hint="Khác 0 thì suất nằm chờ tới khi thu được cọc, dù đang bật xác nhận tự động."
                  disabled={!mayEdit || save.isPending}
                  onSave={(value) =>
                    save.mutate({ key: `reservation.deposit${seat.id}Vnd`, value })
                  }
                />
              ))}
            </div>
            <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Hệ chưa thu cọc trực tuyến: bật số ở đây là để W6 nói trước với khách và để suất không
              tự xác nhận. Thu tiền vẫn là nhân viên gọi điện, rồi bấm xác nhận ở R2.
            </p>
          </section>

          <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-6">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Ngày không nhận đặt
            </p>

            <div className="mt-4 grid gap-2">
              {blocked.isPending ? (
                <p className="text-[length:var(--fs-c1)] text-ink-mute">Đang tải…</p>
              ) : (blocked.data ?? []).length === 0 ? (
                <p className="text-[length:var(--fs-c1)] text-ink-mute">
                  Chưa chặn ngày nào. Lịch nghỉ lễ và tiệc bao trọn quán khai ở đây.
                </p>
              ) : (
                blocked.data!.map((row) => (
                  <div
                    key={row.id}
                    className="flex items-center gap-4 rounded-sm border border-line-1 bg-canvas px-4 py-3"
                  >
                    <span className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
                      {row.day}
                    </span>
                    <span className="min-w-0 flex-1 text-[length:var(--fs-b2)] text-ink-body">
                      {row.reason}
                    </span>
                    <Button
                      variant="ghost"
                      disabled={!mayEdit || unblockDay.isPending}
                      onClick={() => unblockDay.mutate(row.id)}
                    >
                      Mở lại
                    </Button>
                  </div>
                ))
              )}
            </div>

            <div className="mt-4 flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">Ngày</span>
                <input
                  type="date"
                  value={newDay}
                  disabled={!mayEdit}
                  onChange={(e) => setNewDay(e.target.value)}
                  className="h-10 rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
                />
              </label>
              <label className="block min-w-[240px] flex-1">
                <span className="mb-1.5 block text-[length:var(--fs-c1)] text-ink-mute">Lý do</span>
                <input
                  value={newReason}
                  disabled={!mayEdit}
                  placeholder="Nghỉ Tết · tiệc bao trọn quán"
                  onChange={(e) => setNewReason(e.target.value)}
                  className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
                />
              </label>
              <Button
                variant="primary"
                disabled={!mayEdit || !newDay || !newReason.trim() || blockDay.isPending}
                onClick={() =>
                  blockDay.mutate(
                    { day: newDay, reason: newReason.trim() },
                    {
                      onSuccess: () => {
                        setNewDay('')
                        setNewReason('')
                      },
                    },
                  )
                }
              >
                Chặn ngày
              </Button>
            </div>

            <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Chặn ngày KHÔNG huỷ suất đã nhận — quán đổi ý thì phải gọi từng khách. Số suất đang có
              hiện ngay lúc bấm chặn.
            </p>
          </section>
        </div>
      </div>
    </>
  )
}

function NumberField({
  row,
  label,
  hint,
  disabled,
  onSave,
}: {
  row: ParameterRow | undefined
  label: string
  hint: string
  disabled: boolean
  onSave: (value: number) => void
}) {
  const [draft, setDraft] = useState('')

  useEffect(() => {
    if (row) setDraft(String(row.effectiveValue))
  }, [row])

  if (!row) {
    return (
      <div>
        <p className="text-[length:var(--fs-b2)] text-ink-hi">{label}</p>
        <p className="mt-1.5 text-[length:var(--fs-c1)] text-warn">
          Chưa có tham số này trong hệ thống.
        </p>
      </div>
    )
  }

  const dirty = draft !== String(row.effectiveValue)

  return (
    <div>
      <label className="block">
        <span className="mb-1.5 block text-[length:var(--fs-b2)] text-ink-hi">{label}</span>
        <div className="flex gap-2">
          <input
            type="number"
            min={0}
            value={draft}
            disabled={disabled}
            onChange={(e) => setDraft(e.target.value)}
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
          {dirty ? (
            <Button variant="primary" disabled={disabled} onClick={() => onSave(Number(draft))}>
              Lưu
            </Button>
          ) : null}
        </div>
      </label>
      <p className="mt-1.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        {hint}
        {row.scope === 'branch' ? ' · đang dùng số riêng của chi nhánh' : ''}
      </p>
    </div>
  )
}
