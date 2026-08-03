import { formatVnd } from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type ExpiryBand, type LotRow } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatDay, formatPercent, formatTime } from '../components/report'
import { useSession } from '../session-context'

/**
 * S9 lô & hạn dùng · S11 báo cáo hao hụt · S12 thẻ kho.
 *
 * Ba màn ĐỌC của kho. Chúng không ghi gì cả (trừ nút đục keg ở S9) — giá trị của
 * chúng là nói ra thứ mà sổ kho biết mà không ai nhìn thấy: hàng sắp hỏng, tiền
 * đang bốc hơi, và đường đi của từng đơn vị hàng.
 */

const monthStart = () => new Date().toISOString().slice(0, 8) + '01'
const today = () => new Date().toISOString().slice(0, 10)

// ===================================================================== S9

const BANDS: Record<ExpiryBand, { label: string; className: string }> = {
  'het-han': { label: 'Đã hết hạn', className: 'text-danger' },
  'sap-het': { label: 'Sắp hết hạn', className: 'text-warn' },
  'con-han': { label: 'Còn hạn', className: 'text-ink-mute' },
  'khong-han': { label: 'Không hạn', className: 'text-line-4' },
}

export function Lots() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [showAll, setShowAll] = useState(false)

  const mayTap = can('stock.receive')
  const book = useQuery({
    queryKey: ['lots', branchId, showAll],
    queryFn: () => api.lots(branchId!, showAll),
    enabled: Boolean(branchId),
  })

  const tap = useMutation({
    mutationFn: (lotId: number) => api.tapKeg(lotId, branchId!),
    onSuccess: (res) => {
      toast(`Đã đục keg — hạn dùng tới ${res.expiresOn ? formatDay(res.expiresOn) : '?'}`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['lots'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const data = book.data
  const lots = data?.lots ?? []

  return (
    <>
      <PageHeader
        title="Lô & hạn dùng"
        subtitle="Sắp theo hạn gần nhất trước — đúng thứ tự mà mọi lượt xuất rút hàng. Keg đã đục tính hạn từ ngày đục, không từ hạn in trên vỏ."
        action={
          <Button onClick={() => setShowAll(!showAll)}>
            {showAll ? 'Chỉ lô còn hàng' : 'Xem cả lô đã hết'}
          </Button>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {book.isError ? <ErrorState message={(book.error as Error).message} /> : null}

        {data ? (
          <div className="grid gap-3 lg:grid-cols-2">
            <Tile
              label="Đã hết hạn"
              count={data.summary.expired}
              vnd={data.summary.expiredValueVnd}
              tone={data.summary.expired > 0 ? 'danger' : undefined}
            />
            <Tile
              label="Sắp hết hạn"
              count={data.summary.expiringSoon}
              vnd={data.summary.expiringSoonValueVnd}
              tone={data.summary.expiringSoon > 0 ? 'warn' : undefined}
            />
          </div>
        ) : null}

        <div className="mt-5">
          <DataTable
            rows={lots}
            rowKey={(lot) => lot.id}
            loading={book.isPending}
            empty="Chưa có lô nào. Lô sinh ra khi nhập hàng bắt buộc khai lô ở màn Nhập kho."
            columns={[
              {
                key: 'lot',
                header: 'Nguyên liệu / lô',
                width: 'minmax(200px, 1fr)',
                cell: (lot) => (
                  <span className={lot.qtyRemainBase === 0 ? 'opacity-50' : ''}>
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {lot.ingredientName}
                    </span>
                    <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {lot.lotCode}
                      {lot.supplierName ? ` · ${lot.supplierName}` : ''}
                    </span>
                  </span>
                ),
              },
              {
                key: 'received',
                header: 'Nhập',
                width: '130px',
                cell: (lot) => (
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {formatDay(lot.receivedOn)}
                    {lot.receiveTempDeciC !== null ? (
                      <span className="mt-0.5 block">
                        {(lot.receiveTempDeciC / 10).toFixed(1)}°C
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'expires',
                header: 'Hạn thật',
                width: '120px',
                cell: (lot) => (
                  <span
                    className={`font-mono text-[length:var(--fs-c1)] ${BANDS[lot.band].className}`}
                  >
                    {lot.expiresOn ? formatDay(lot.expiresOn) : '—'}
                    {lot.state === 'open' &&
                    lot.labelExpiresOn &&
                    lot.labelExpiresOn !== lot.expiresOn ? (
                      <span className="mt-0.5 block text-[length:var(--fs-c2)] text-line-4">
                        vỏ: {formatDay(lot.labelExpiresOn)}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'remain',
                header: 'Còn lại',
                width: '120px',
                align: 'right',
                cell: (lot) => (
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-hi">
                    {lot.qtyRemainBase}
                    <span className="ml-1 text-ink-mute">{lot.baseUnit}</span>
                  </span>
                ),
              },
              {
                key: 'value',
                header: 'Tiền',
                width: '130px',
                numeric: true,
                cell: (lot) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-body">
                    {formatVnd(lot.remainValueVnd)}
                  </span>
                ),
              },
              {
                key: 'state',
                header: 'Trạng thái',
                width: '140px',
                cell: (lot) => (
                  <span className="flex flex-wrap items-center gap-1.5">
                    {lot.state === 'open' ? <Badge tone="warn">Đã đục</Badge> : null}
                    <span className={`text-[length:var(--fs-c2)] ${BANDS[lot.band].className}`}>
                      {BANDS[lot.band].label}
                    </span>
                  </span>
                ),
              },
              {
                key: 'actions',
                header: '',
                width: '120px',
                cell: (lot) => (
                  <span className="flex justify-end">
                    {lot.tappable && mayTap ? (
                      <Button disabled={tap.isPending} onClick={() => tap.mutate(lot.id)} size="sm">
                        Đục keg
                      </Button>
                    ) : null}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Rút lô theo hạn gần nhất trước, hàng không hạn xuống cuối — rút con tôm hết hạn ngày mai
          trước gói muối là điều đúng. Lô đã hết không bị xoá: truy ngược "con tôm hỏng hôm nay
          thuộc lô nào" chỉ làm được nếu lô hết vẫn còn đó.
        </p>
      </div>
    </>
  )
}

function Tile({
  label,
  count,
  vnd,
  tone,
}: {
  label: string
  count: number
  vnd: number
  tone?: 'warn' | 'danger'
}) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink-hi'
  return (
    <div
      className={`rounded-md border ${tone ? `border-${tone}` : 'border-line-1'} bg-surface-1 px-5 py-4`}
    >
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p className={`mt-2 font-mono text-[length:var(--fs-d3)] leading-none ${color}`}>
        {count} lô
      </p>
      <p className="mt-2 font-mono text-[length:var(--fs-c1)] text-ink-mute">
        {formatVnd(vnd)} đang nằm trong đó
      </p>
    </div>
  )
}

// ==================================================================== S11

export function WasteReport() {
  const { branchId } = useSession()
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())

  const report = useQuery({
    queryKey: ['waste', branchId, from, to],
    queryFn: () => api.wasteReport(branchId!, from, to),
    enabled: Boolean(branchId),
  })

  const data = report.data
  const rows = data?.rows ?? []

  return (
    <>
      <PageHeader
        title="Báo cáo hao hụt"
        subtitle="Tiêu hao theo công thức so với tiêu hao thực tế. 2% hao trên giá vốn của một quán nướng là vài chục triệu mỗi tháng."
        action={
          <div className="flex items-end gap-3">
            <Field label="Từ ngày">
              <DateInput value={from} onChange={setFrom} />
            </Field>
            <Field label="Đến ngày">
              <DateInput value={to} onChange={setTo} />
            </Field>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {report.isError ? <ErrorState message={(report.error as Error).message} /> : null}

        {data ? (
          <div className="grid gap-3 lg:grid-cols-3">
            <Summary
              label="Chênh lệch công thức"
              value={formatVnd(data.totals.varianceVnd)}
              tone={data.totals.varianceVnd > 0 ? 'danger' : undefined}
              hint="dương = dùng nhiều hơn công thức"
            />
            <Summary
              label="Xuất huỷ"
              value={formatVnd(data.totals.writeOffVnd)}
              tone={data.totals.writeOffVnd > 0 ? 'warn' : undefined}
              hint="mất thật — vào dòng hao của Lãi/Lỗ"
            />
            <Summary
              label="Xuất nội bộ"
              value={formatVnd(data.totals.internalVnd)}
              hint="ăn ca, tiếp khách — chi phí có ích"
            />
          </div>
        ) : null}

        {data && data.draftBeer.length > 0 ? (
          <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-5">
            <h2 className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
              Bia tươi — rót lý thuyết vs keg thực dùng
            </h2>
            <div className="mt-3 flex flex-col gap-2">
              {data.draftBeer.map((beer) => (
                <div
                  key={beer.ingredientId}
                  className="grid grid-cols-[1fr_140px_140px_140px_120px] items-center gap-3 border-b border-line-1 pb-2 last:border-b-0"
                >
                  <span className="text-[length:var(--fs-b2)] text-ink-hi">
                    {beer.ingredientName}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    rót {beer.pouredBase} {beer.baseUnit}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-body">
                    keg {beer.kegUsedBase} {beer.baseUnit}
                  </span>
                  <span
                    className={`text-right font-mono text-[length:var(--fs-c1)] ${
                      beer.diffVnd > 0 ? 'text-warn' : 'text-ink-mute'
                    }`}
                  >
                    {formatVnd(beer.diffVnd)}
                  </span>
                  <span className="text-right font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {beer.ratio === null ? '—' : formatPercent(beer.ratio)}
                  </span>
                </div>
              ))}
            </div>
            <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Bọt đầu keg và cặn cuối keg là hao có thật. Ngoài khoảng quen thuộc thì là vòi hỏng,
              hoặc là bia đi đường khác.
            </p>
          </section>
        ) : null}

        <div className="mt-5">
          <DataTable
            rows={rows}
            rowKey={(row) => row.ingredientId}
            loading={report.isPending}
            empty="Chưa có tiêu hao nào trong khoảng này."
            columns={[
              {
                key: 'name',
                header: 'Nguyên liệu',
                width: 'minmax(200px, 1fr)',
                cell: (row) => (
                  <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">
                    {row.ingredientName}
                    <span className="ml-2 text-[length:var(--fs-c1)] text-ink-mute">
                      {row.baseUnit}
                    </span>
                  </span>
                ),
              },
              {
                key: 'theoretical',
                header: 'Công thức đòi',
                width: '130px',
                numeric: true,
                cell: (row) => <span className="text-ink-mute">{row.theoreticalBase}</span>,
              },
              {
                key: 'actual',
                header: 'Thực tế xuất',
                width: '130px',
                numeric: true,
                cell: (row) => <span className="text-ink-body">{row.actualBase}</span>,
              },
              {
                key: 'writeOff',
                header: 'Huỷ',
                width: '120px',
                numeric: true,
                cell: (row) => <span className="text-warn">{row.writeOffBase || '—'}</span>,
              },
              {
                key: 'internal',
                header: 'Nội bộ',
                width: '120px',
                numeric: true,
                cell: (row) => <span className="text-ink-mute">{row.internalBase || '—'}</span>,
              },
              {
                key: 'diff',
                header: 'Chênh (₫)',
                width: '140px',
                numeric: true,
                cell: (row) => (
                  <span
                    className={
                      row.diffVnd > 0
                        ? 'text-danger'
                        : row.diffVnd < 0
                          ? 'text-ok'
                          : 'text-ink-mute'
                    }
                  >
                    {formatVnd(row.diffVnd)}
                  </span>
                ),
              },
              {
                key: 'ratio',
                header: 'Tỉ lệ',
                width: '110px',
                numeric: true,
                cell: (row) => (
                  <span className="text-ink-mute">
                    {row.ratio === null ? '—' : formatPercent(row.ratio)}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Chênh âm thường nghĩa là định lượng công thức khai thừa chứ không phải bếp tiết kiệm được
          — cả hai chiều đều đáng xem, nên không kẹp về 0.
        </p>
      </div>
    </>
  )
}

function Summary({
  label,
  value,
  hint,
  tone,
}: {
  label: string
  value: string
  hint: string
  tone?: 'warn' | 'danger'
}) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'warn' ? 'text-warn' : 'text-ink-hi'
  return (
    <div className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p className={`mt-2 font-mono text-[length:var(--fs-d3)] leading-none ${color}`}>{value}</p>
      <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">{hint}</p>
    </div>
  )
}

// ==================================================================== S12

const MOVE_LABELS: Record<string, string> = {
  receipt: 'Nhập kho',
  sale: 'Bán',
  count_adjust: 'Kiểm kê',
  write_off: 'Xuất huỷ',
  internal: 'Xuất nội bộ',
  transfer_out: 'Chuyển đi',
  transfer_in: 'Chuyển đến',
  produce_out: 'Sản xuất — vào',
  produce_in: 'Sản xuất — ra',
}

export function StockCardScreen() {
  const { branchId } = useSession()
  const [ingredientId, setIngredientId] = useState('')
  const [from, setFrom] = useState(monthStart())
  const [to, setTo] = useState(today())

  const ingredients = useQuery({
    queryKey: ['ingredients', branchId],
    queryFn: () => api.ingredients(branchId!),
    enabled: Boolean(branchId),
  })
  const card = useQuery({
    queryKey: ['stock-card', branchId, ingredientId, from, to],
    queryFn: () => api.stockCard(branchId!, ingredientId, from, to),
    enabled: Boolean(branchId) && ingredientId !== '',
  })

  const data = card.data

  return (
    <>
      <PageHeader
        title="Thẻ kho"
        subtitle="Mọi bút toán của một mặt hàng, kèm tồn luỹ kế sau từng dòng — nhìn một dòng là biết ngay lúc đó kho còn bao nhiêu."
        action={
          <div className="flex items-end gap-3">
            <Field label="Mặt hàng">
              <select
                value={ingredientId}
                onChange={(e) => setIngredientId(e.target.value)}
                className="h-9 min-w-[220px] rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
              >
                <option value="">Chọn…</option>
                {(ingredients.data ?? []).map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Từ ngày">
              <DateInput value={from} onChange={setFrom} />
            </Field>
            <Field label="Đến ngày">
              <DateInput value={to} onChange={setTo} />
            </Field>
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {card.isError ? <ErrorState message={(card.error as Error).message} /> : null}

        {ingredientId === '' ? (
          <p className="text-[length:var(--fs-b2)] text-ink-mute">
            Chọn một mặt hàng để xem đường đi của nó.
          </p>
        ) : card.isPending ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : data ? (
          <>
            <div className="flex flex-wrap items-center gap-6 rounded-md border border-line-1 bg-surface-1 px-5 py-4">
              <span className="text-[length:var(--fs-b2)] text-ink-hi">{data.ingredient.name}</span>
              <span className="text-[length:var(--fs-c1)] text-ink-mute">
                Đầu kỳ{' '}
                <span className="font-mono text-ink-body">
                  {data.openingBase} {data.ingredient.baseUnit}
                </span>
              </span>
              <span className="text-[length:var(--fs-c1)] text-ink-mute">
                Cuối kỳ{' '}
                <span className="font-mono text-ink-hi">
                  {data.closingBase} {data.ingredient.baseUnit}
                </span>
              </span>
              <span className="ml-auto font-mono text-[length:var(--fs-c1)] text-ink-mute">
                giá bình quân {(data.ingredient.costPerBaseMilli / 1_000).toLocaleString('vi-VN')}₫/
                {data.ingredient.baseUnit}
              </span>
            </div>

            <div className="mt-5">
              <DataTable
                rows={data.moves}
                rowKey={(move) => move.id}
                empty="Không có bút toán nào trong khoảng này."
                columns={[
                  {
                    key: 'day',
                    header: 'Ngày',
                    width: '110px',
                    cell: (move) => (
                      <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                        {formatDay(move.businessDate)}
                        <span className="mt-0.5 block text-[length:var(--fs-c2)] text-line-4">
                          {formatTime(move.createdAt)}
                        </span>
                      </span>
                    ),
                  },
                  {
                    key: 'kind',
                    header: 'Loại',
                    width: '150px',
                    cell: (move) => (
                      <span className="text-[length:var(--fs-c1)] text-ink-body">
                        {MOVE_LABELS[move.kind] ?? move.kind}
                      </span>
                    ),
                  },
                  {
                    key: 'detail',
                    header: 'Chi tiết',
                    width: 'minmax(220px, 1fr)',
                    cell: (move) => (
                      <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">
                        {move.lotCode ? <span className="font-mono">{move.lotCode} </span> : null}
                        {move.note ?? ''}
                        {move.docKind ? ` · ${move.docKind} #${move.docId}` : ''}
                        {move.actorName ? ` · ${move.actorName}` : ''}
                      </span>
                    ),
                  },
                  {
                    key: 'qty',
                    header: 'Lượng',
                    width: '110px',
                    numeric: true,
                    cell: (move) => (
                      <span className={move.qtyBase > 0 ? 'text-ok' : 'text-ink-body'}>
                        {move.qtyBase > 0 ? `+${move.qtyBase}` : move.qtyBase}
                      </span>
                    ),
                  },
                  {
                    key: 'cost',
                    header: 'Tiền',
                    width: '130px',
                    numeric: true,
                    cell: (move) => (
                      <span className="text-ink-mute">{formatVnd(move.costVnd)}</span>
                    ),
                  },
                  {
                    key: 'balance',
                    header: 'Tồn sau',
                    width: '130px',
                    numeric: true,
                    cell: (move) => (
                      <span className="text-[length:var(--fs-b2)] text-ink-hi">
                        {move.balanceBase}
                      </span>
                    ),
                  },
                ]}
              />
            </div>
          </>
        ) : null}
      </div>
    </>
  )
}
