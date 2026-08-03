import { formatVnd } from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type CustomerRow } from '../api'
import { Pagination, usePaged } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { Field, formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * B12 — Sổ khách.
 *
 * Hồ sơ hợp nhất theo SỐ ĐIỆN THOẠI, gom tự động từ ba nguồn: đặt bàn, đơn online
 * và lượt thu tiền. Không có nút "thêm khách" ở đầu trang — khách xuất hiện trong
 * sổ vì họ đã đến, không vì ai đó gõ tay.
 *
 * Số điện thoại hiện dạng che `091***5678` với vai trò không cần thấy (§25 B12).
 * Việc che làm ở MÁY CHỦ; màn hình chỉ nói cho người dùng biết là đang bị che, để
 * họ không đi tìm số ở chỗ khác.
 */

const TIER_TONES: Record<CustomerRow['tier'], 'neutral' | 'accent' | 'warn'> = {
  dong: 'neutral',
  bac: 'neutral',
  vang: 'accent',
}

export function Customers() {
  const { can } = useSession()
  const [search, setSearch] = useState('')
  const [selected, setSelected] = useState<number | null>(null)

  const seesFullPhone = can('customer.view-phone-full')
  const customers = useQuery({
    queryKey: ['customers', search],
    queryFn: () => api.customers(search),
  })

  const rows = customers.data ?? []
  const paged = usePaged(rows, 25, search)

  return (
    <>
      <PageHeader
        title="Sổ khách"
        subtitle="Gom tự động theo số điện thoại từ đặt bàn, đơn online và hoá đơn. Dị ứng và ghi chú phục vụ là thứ bếp và phục vụ cần biết TRƯỚC khi món ra."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="flex flex-wrap items-end gap-4 rounded-md border border-line-1 bg-surface-1 px-5 py-4">
          <Field label="Tìm theo tên hoặc số điện thoại">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="0912… hoặc Tuấn"
              className="h-9 w-[280px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
            />
          </Field>
          {!seesFullPhone ? (
            <p className="text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Vai trò của bạn thấy số điện thoại dạng che ba số giữa. Tìm theo số vẫn được — gõ đủ
              số thật.
            </p>
          ) : null}
        </div>

        {customers.isError ? <ErrorState message={(customers.error as Error).message} /> : null}

        <div className="mt-5 flex flex-col gap-3">
          {customers.isPending ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : rows.length === 0 ? (
            <p className="text-[length:var(--fs-b2)] text-ink-mute">
              {search
                ? 'Không có khách nào khớp.'
                : 'Sổ khách còn trống. Hồ sơ đầu tiên xuất hiện khi có đặt bàn, đơn online, hoặc bill thu tiền có số điện thoại.'}
            </p>
          ) : (
            paged.visible.map((row) => (
              <CustomerCard
                key={row.id}
                row={row}
                open={selected === row.id}
                onToggle={() => setSelected(selected === row.id ? null : row.id)}
              />
            ))
          )}
          <Pagination {...paged.controls} />
        </div>
      </div>
    </>
  )
}

function CustomerCard({
  row,
  open,
  onToggle,
}: {
  row: CustomerRow
  open: boolean
  onToggle: () => void
}) {
  return (
    <section className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
      <div className="grid grid-cols-[1fr_150px_160px_130px_120px_100px] items-center gap-3 px-5 py-3">
        <span className="min-w-0">
          <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
            {row.name ?? 'Chưa có tên'}
          </span>
          <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {row.phone}
            {row.phoneMasked ? <span className="ml-1.5 not-italic">(che)</span> : null}
          </span>
        </span>

        <span className="text-[length:var(--fs-c1)] text-ink-body">
          {row.visits} lượt
          <span className="mt-0.5 block text-ink-mute">gần nhất {formatDay(row.lastSeenOn)}</span>
        </span>

        <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-hi">
          {formatVnd(row.spendTotalVnd)}
          <span className="mt-0.5 block text-ink-mute">
            12 tháng {formatVnd(row.spend12MonthsVnd)}
          </span>
        </span>

        <span>
          <Badge tone={TIER_TONES[row.tier]}>{row.tierLabel}</Badge>
          <span className="mt-1 block font-mono text-[length:var(--fs-c2)] text-ink-mute">
            {row.pointsBalance} điểm
          </span>
        </span>

        <span className="text-[length:var(--fs-c1)]">
          {row.allergies ? (
            <span className="text-danger">Dị ứng</span>
          ) : row.noShowCount > 0 ? (
            <span className="text-warn">{row.noShowCount} no-show</span>
          ) : (
            <span className="text-ink-mute">—</span>
          )}
        </span>

        <span className="flex justify-end">
          <Button onClick={onToggle} size="sm">
            {open ? 'Thu' : 'Hồ sơ'}
          </Button>
        </span>
      </div>

      {open ? <CustomerDetail id={row.id} /> : null}
    </section>
  )
}

function CustomerDetail({ id }: { id: number }) {
  const { can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'ho-so' | 'diem'>('ho-so')
  const [edit, setEdit] = useState<{ name: string; allergies: string; note: string } | null>(null)
  const [adjust, setAdjust] = useState<{ points: string; reason: string } | null>(null)

  const mayEdit = can('customer.view-phone-full')
  const mayAdjust = can('loyalty.adjust-manual')

  const profile = useQuery({ queryKey: ['customer', id], queryFn: () => api.customer(id) })
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['customer', id] })
    void queryClient.invalidateQueries({ queryKey: ['customers'] })
  }

  const save = useMutation({
    mutationFn: (input: { name: string; allergies: string; note: string }) =>
      api.saveCustomer({
        phone: profile.data!.phone,
        name: input.name || null,
        allergies: input.allergies || null,
        note: input.note || null,
      }),
    onSuccess: () => {
      toast('Đã lưu hồ sơ', 'ok')
      setEdit(null)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  if (profile.isPending) {
    return <div className="border-t border-line-1 bg-canvas px-5 py-4 text-ink-mute">Đang tải…</div>
  }
  if (!profile.data) return null
  const data = profile.data

  return (
    <div className="border-t border-line-1 bg-canvas px-5 py-4">
      <div className="flex gap-2">
        {(
          [
            ['ho-so', 'Hồ sơ & lịch sử'],
            ['diem', 'Điểm & hạng'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`h-8 rounded-sm border px-3 text-[length:var(--fs-c1)] ${
              tab === key ? 'border-accent text-accent-ink' : 'border-line-3 text-ink-mute'
            }`}
          >
            {label}
          </button>
        ))}
        {tab === 'ho-so' && mayEdit && !edit ? (
          <Button
            onClick={() =>
              setEdit({
                name: data.name ?? '',
                allergies: data.allergies ?? '',
                note: data.note ?? '',
              })
            }
            size="sm"
            className="ml-auto"
          >
            Sửa
          </Button>
        ) : null}
      </div>

      {tab === 'ho-so' ? (
        <>
          {edit ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-3">
              <Field label="Tên">
                <TextInput value={edit.name} onChange={(v) => setEdit({ ...edit, name: v })} />
              </Field>
              <Field label="Dị ứng">
                <TextInput
                  value={edit.allergies}
                  onChange={(v) => setEdit({ ...edit, allergies: v })}
                  placeholder="Hải sản, đậu phộng…"
                />
              </Field>
              <Field label="Ghi chú phục vụ">
                <TextInput
                  value={edit.note}
                  onChange={(v) => setEdit({ ...edit, note: v })}
                  placeholder="Hay ngồi bàn cửa sổ"
                />
              </Field>
              <div className="flex gap-2 lg:col-span-3">
                <Button onClick={() => setEdit(null)}>Bỏ</Button>
                <Button
                  variant="primary"
                  disabled={save.isPending}
                  onClick={() => save.mutate(edit)}
                >
                  Lưu
                </Button>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 lg:grid-cols-3">
              <InfoBlock label="Dị ứng" value={data.allergies} danger />
              <InfoBlock label="Ghi chú phục vụ" value={data.note} />
              <InfoBlock
                label="Khách từ"
                value={`${formatDay(data.firstSeenOn)} · ${data.visitCount} lượt`}
              />
            </div>
          )}

          <div className="mt-5 grid gap-6 lg:grid-cols-2">
            <div>
              <SectionTitle>Món hay gọi</SectionTitle>
              {data.favourites.length === 0 ? (
                <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">Chưa đủ dữ liệu.</p>
              ) : (
                <div className="mt-2 flex flex-col">
                  {data.favourites.map((dish) => (
                    <div
                      key={dish.dishId}
                      className="flex items-baseline gap-3 border-b border-line-1 py-1.5 last:border-b-0"
                    >
                      <span className="text-[length:var(--fs-c1)] text-ink-body">{dish.name}</span>
                      <span className="ml-auto font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {dish.times} lần · {dish.qty} phần
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <SectionTitle>Lịch sử đến</SectionTitle>
              {data.visits.length === 0 ? (
                <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">Chưa có bill nào.</p>
              ) : (
                <div className="mt-2 flex flex-col">
                  {data.visits.slice(0, 10).map((visit) => (
                    <div
                      key={visit.orderId}
                      className="flex items-baseline gap-3 border-b border-line-1 py-1.5 last:border-b-0"
                    >
                      <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {formatDay(visit.businessDate)}
                      </span>
                      <span className="text-[length:var(--fs-c1)] text-ink-body">
                        {visit.displayCode}
                      </span>
                      <span className="ml-auto font-mono text-[length:var(--fs-c1)] text-ink-hi">
                        {formatVnd(visit.moneyTotal)}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {data.bookings.length > 0 ? (
                <>
                  <SectionTitle className="mt-4">Đặt bàn</SectionTitle>
                  <div className="mt-2 flex flex-col">
                    {data.bookings.slice(0, 6).map((booking) => (
                      <div
                        key={booking.id}
                        className="flex items-baseline gap-3 border-b border-line-1 py-1.5 last:border-b-0"
                      >
                        <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                          {new Date(booking.slotAt).toLocaleString('vi-VN')}
                        </span>
                        <span className="text-[length:var(--fs-c1)] text-ink-body">
                          {booking.guestCount} khách
                        </span>
                        <span
                          className={`ml-auto text-[length:var(--fs-c1)] ${
                            booking.status === 'no_show' ? 'text-danger' : 'text-ink-mute'
                          }`}
                        >
                          {booking.status === 'no_show' ? 'không đến' : booking.status}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mt-4 grid gap-4 lg:grid-cols-4">
            <InfoBlock label="Số dư điểm" value={`${data.loyalty.balance} điểm`} />
            <InfoBlock label="Hạng hiện tại" value={data.loyalty.tierLabel} />
            <InfoBlock label="Chi tiêu 12 tháng trượt" value={formatVnd(data.spend12MonthsVnd)} />
            <InfoBlock
              label="Lên hạng tiếp theo"
              value={
                data.loyalty.next
                  ? `Còn ${formatVnd(data.loyalty.next.remainingVnd)}`
                  : 'Đã ở hạng cao nhất'
              }
            />
          </div>

          {mayAdjust ? (
            adjust ? (
              <div className="mt-4 flex flex-wrap items-end gap-3 rounded-sm border border-accent bg-surface-1 px-4 py-3">
                <p className="w-full text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                  Điểm chỉ sinh từ lượt thanh toán. Đây là cửa duy nhất đi vòng qua quy tắc đó, nên
                  nó luôn ghi vào nhật ký thao tác A7.
                </p>
                <Field label="Số điểm (âm để trừ)">
                  <TextInput
                    type="number"
                    value={adjust.points}
                    onChange={(v) => setAdjust({ ...adjust, points: v })}
                    mono
                  />
                </Field>
                <Field label="Lý do">
                  <TextInput
                    value={adjust.reason}
                    onChange={(v) => setAdjust({ ...adjust, reason: v })}
                    placeholder="Bù điểm bill lỗi ngày 02/08"
                  />
                </Field>
                <Button onClick={() => setAdjust(null)}>Bỏ</Button>
                <Button
                  variant="primary"
                  disabled={!Number(adjust.points) || !adjust.reason.trim()}
                  onClick={() =>
                    api
                      .adjustPoints({
                        customerId: id,
                        points: Number(adjust.points),
                        reason: adjust.reason.trim(),
                      })
                      .then(() => {
                        toast('Đã điều chỉnh điểm', 'ok')
                        setAdjust(null)
                        refresh()
                      })
                      .catch((err: Error) => toast(err.message, 'danger'))
                  }
                >
                  Ghi điều chỉnh
                </Button>
              </div>
            ) : (
              <Button
                onClick={() => setAdjust({ points: '', reason: '' })}
                size="sm"
                className="mt-4"
              >
                Điều chỉnh điểm tay
              </Button>
            )
          ) : null}

          <SectionTitle className="mt-5">Sổ điểm</SectionTitle>
          {data.loyalty.entries.length === 0 ? (
            <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
              Chưa có điểm nào. Điểm sinh khi bill được thu tiền, không cộng tay được.
            </p>
          ) : (
            <div className="mt-2 flex flex-col">
              {data.loyalty.entries.map((entry) => (
                <div
                  key={entry.id}
                  className="grid grid-cols-[100px_120px_1fr_120px] items-baseline gap-3 border-b border-line-1 py-1.5 last:border-b-0"
                >
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {formatDay(entry.businessDate)}
                  </span>
                  <span className="text-[length:var(--fs-c1)] text-ink-body">
                    {ENTRY_LABELS[entry.kind]}
                  </span>
                  <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
                    {entry.reason ?? (entry.baseVnd ? `Bill ${formatVnd(entry.baseVnd)}` : '')}
                    {entry.staffName ? ` · ${entry.staffName}` : ''}
                    {entry.expiresOn ? ` · hết hạn ${formatDay(entry.expiresOn)}` : ''}
                  </span>
                  <span
                    className={`text-right font-mono text-[length:var(--fs-c1)] ${
                      entry.points > 0 ? 'text-ok' : 'text-danger'
                    }`}
                  >
                    {entry.points > 0 ? '+' : ''}
                    {entry.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  )
}

const ENTRY_LABELS: Record<string, string> = {
  earn: 'Tích từ bill',
  redeem: 'Đổi tại quầy',
  reclaim: 'Thu hồi (huỷ bill)',
  adjust: 'Điều chỉnh tay',
  expire: 'Hết hạn',
}

function SectionTitle({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <p
      className={`text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase ${className}`}
    >
      {children}
    </p>
  )
}

function InfoBlock({
  label,
  value,
  danger,
}: {
  label: string
  value: string | null
  danger?: boolean
}) {
  return (
    <div className="rounded-sm border border-line-1 bg-surface-1 px-4 py-3">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p
        className={`mt-1.5 text-[length:var(--fs-b2)] ${
          value ? (danger ? 'text-danger' : 'text-ink-hi') : 'text-ink-mute'
        }`}
      >
        {value ?? '—'}
      </p>
    </div>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
  mono = false,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  type?: string
  mono?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 w-full min-w-[180px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi ${
        mono ? 'font-mono' : ''
      }`}
    />
  )
}
