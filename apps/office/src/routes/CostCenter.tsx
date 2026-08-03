import { formatVnd } from '@sora/contracts'
import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, type PayMethod } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { DateInput, Field, formatDay, formatPercent } from '../components/report'
import { useSession } from '../session-context'

/**
 * C1 Tổng quan chi phí (kèm ngân sách của C6) · C3 Chi phí định kỳ · C4 Tài sản.
 *
 * Ba màn ở chung một file vì chúng chia nhau một ý: **máy tự ghi mọi khoản máy
 * biết**. C3 sinh phiếu nháp hằng tháng để không ai quên tiền nhà; C4 sinh bút
 * toán khấu hao để không ai phải nhớ chia nguyên giá; C1 là chỗ cả hai lộ ra
 * cùng những khoản người gõ tay.
 */

const startOfMonth = (iso: string) => `${iso.slice(0, 7)}-01`

const monthLabel = (iso: string) => `Tháng ${Number(iso.slice(5, 7))}/${iso.slice(0, 4)}`

// ---------------------------------------------------------------- C1 · C6

export function ExpenseOverview() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayBudget = can('expense.approve')
  const [month, setMonth] = useState(() => startOfMonth(new Date().toISOString().slice(0, 10)))

  const overview = useQuery({
    queryKey: ['expense-overview', branchId, month],
    queryFn: () => api.expenseOverview(branchId!, month),
    enabled: Boolean(branchId),
  })

  const setBudget = useMutation({
    mutationFn: (input: { categoryId: string; amountVnd: number }) =>
      api.setExpenseBudget({ branchId: branchId!, month, ...input }),
    onSuccess: () => {
      toast('Đã đặt ngân sách', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['expense-overview'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const data = overview.data
  const delta = data ? data.totalVnd - data.previousTotalVnd : 0

  return (
    <>
      <PageHeader
        title="Tổng quan chi phí"
        subtitle={
          data
            ? `${monthLabel(data.month)} · tổng chi ${formatVnd(data.totalVnd)}${
                data.previousTotalVnd > 0
                  ? ` · ${delta >= 0 ? 'tăng' : 'giảm'} ${formatVnd(Math.abs(delta))} so tháng trước`
                  : ''
              }`
            : 'Cơ cấu chi phí theo khoản mục, so tháng trước, và ngân sách.'
        }
        action={<DateInput value={month} onChange={(v) => setMonth(startOfMonth(v))} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {overview.isError ? (
          <ErrorState message={(overview.error as Error).message} />
        ) : !data ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          <>
            {data.draftVouchers > 0 ? (
              <p className="rounded-md border border-warn bg-surface-1 px-5 py-3.5 text-[length:var(--fs-c1)] leading-relaxed text-ink-body">
                {data.draftVouchers} phiếu chi đang chờ duyệt — chúng CHƯA vào Lãi/Lỗ.{' '}
                <Link to="/chi-phi" className="text-accent-ink">
                  Mở sổ phiếu chi
                </Link>
              </p>
            ) : null}

            <div className="mt-5">
              <DataTable
                rows={data.lines}
                rowKey={(line) => line.categoryId}
                paginate={false}
                empty="Tháng này chưa có khoản chi nào."
                columns={[
                  {
                    key: 'name',
                    header: 'Khoản mục',
                    width: 'minmax(200px, 1fr)',
                    cell: (line) => (
                      <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">
                        {line.name}
                      </span>
                    ),
                  },
                  {
                    key: 'share',
                    header: 'Tỉ trọng',
                    width: '180px',
                    cell: (line) => {
                      const share = data.totalVnd === 0 ? 0 : line.amountVnd / data.totalVnd
                      return (
                        <span className="block">
                          <span className="block h-2 w-full overflow-hidden rounded-pill bg-surface-3">
                            <span
                              className={`block h-full rounded-pill ${
                                line.overBudget ? 'bg-danger' : 'bg-accent'
                              }`}
                              style={{ width: `${Math.min(100, share * 100)}%` }}
                            />
                          </span>
                          <span className="mt-1 block text-[length:var(--fs-c2)] text-ink-mute">
                            {formatPercent(share).replace('+', '')} tổng chi
                          </span>
                        </span>
                      )
                    },
                  },
                  {
                    key: 'amount',
                    header: 'Tháng này',
                    width: '150px',
                    numeric: true,
                    cell: (line) => (
                      <span
                        className={`text-[length:var(--fs-b2)] ${
                          line.overBudget ? 'text-danger' : 'text-ink-hi'
                        }`}
                      >
                        {formatVnd(line.amountVnd)}
                      </span>
                    ),
                  },
                  {
                    key: 'previous',
                    header: 'Tháng trước',
                    width: '150px',
                    numeric: true,
                    cell: (line) => (
                      <span className="text-ink-mute">
                        {line.previousVnd === 0 ? '—' : formatVnd(line.previousVnd)}
                      </span>
                    ),
                  },
                  {
                    key: 'budget',
                    header: 'Ngân sách',
                    width: '170px',
                    align: 'right',
                    cell: (line) => (
                      <span className="flex justify-end">
                        {mayBudget ? (
                          <input
                            type="number"
                            defaultValue={line.budgetVnd ?? ''}
                            placeholder="chưa đặt"
                            onBlur={(e) => {
                              const next = Number(e.target.value) || 0
                              if (next !== (line.budgetVnd ?? 0)) {
                                setBudget.mutate({ categoryId: line.categoryId, amountVnd: next })
                              }
                            }}
                            className="h-9 w-[140px] rounded-sm border border-line-1 bg-canvas px-2.5 text-right font-mono text-[length:var(--fs-c1)] text-ink-hi"
                          />
                        ) : (
                          <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                            {line.budgetVnd === null ? '—' : formatVnd(line.budgetVnd)}
                          </span>
                        )}
                      </span>
                    ),
                  },
                ]}
              />
            </div>

            <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Ba ngưỡng đang áp: chi vặt {formatVnd(data.thresholds.pettyCashVnd)} · chủ duyệt từ{' '}
              {formatVnd(data.thresholds.ownerApprovalVnd)} · ghi nhận tài sản từ{' '}
              {formatVnd(data.thresholds.assetVnd)}. Sửa ở{' '}
              <Link to="/tham-so" className="text-accent-ink">
                A6 · Trung tâm tham số
              </Link>
              . Cây khoản mục dùng bộ mặc định chuẩn F&B, chưa sửa được trên giao diện; và chưa có
              quy tắc phân bổ chi phí chung cấp chuỗi về chi nhánh.
            </p>
          </>
        )}
      </div>
    </>
  )
}

// -------------------------------------------------------------------- C3

export function RecurringExpenses() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const mayEdit = can('expense.approve')
  const [month, setMonth] = useState(() => startOfMonth(new Date().toISOString().slice(0, 10)))
  const [adding, setAdding] = useState(false)

  const rows = useQuery({
    queryKey: ['recurring', branchId],
    queryFn: () => api.recurringExpenses(branchId!),
    enabled: Boolean(branchId),
  })
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: api.expenseCategories })

  const generate = useMutation({
    mutationFn: () => api.generateRecurring(branchId!, month),
    onSuccess: (result) => {
      toast(
        result.created === 0
          ? 'Tháng này đã sinh phiếu rồi — không tạo trùng'
          : `Đã sinh ${result.created} phiếu chi nháp, kiểm số thật rồi duyệt`,
        'ok',
      )
      void queryClient.invalidateQueries({ queryKey: ['vouchers'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const list = rows.data ?? []

  return (
    <>
      <PageHeader
        title="Chi phí định kỳ"
        subtitle="Khoản chi tháng nào cũng có. Sinh phiếu nháp hằng tháng để không ai quên — chống bỏ sót là chống ở đây."
        action={
          mayEdit ? (
            <>
              <DateInput value={month} onChange={(v) => setMonth(startOfMonth(v))} />
              <Button onClick={() => generate.mutate()} disabled={generate.isPending}>
                Sinh phiếu {monthLabel(month).toLowerCase()}
              </Button>
              <Button variant="primary" onClick={() => setAdding(true)}>
                Thêm khoản định kỳ
              </Button>
            </>
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {adding ? (
          <RecurringForm
            branchId={branchId!}
            categories={(categories.data ?? []).filter((c) => c.active && !c.automatic)}
            onClose={() => setAdding(false)}
            onDone={() => void queryClient.invalidateQueries({ queryKey: ['recurring'] })}
          />
        ) : null}

        <div className="mt-5">
          <DataTable
            rows={list}
            rowKey={({ recurring }) => recurring.id}
            loading={rows.isPending}
            empty="Chưa khai khoản định kỳ nào."
            columns={[
              {
                key: 'name',
                header: 'Khoản',
                width: 'minmax(200px, 1fr)',
                cell: ({ recurring }) => (
                  <span className={recurring.active ? '' : 'opacity-60'}>
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {recurring.name}
                    </span>
                    {recurring.supplier ? (
                      <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
                        {recurring.supplier}
                      </span>
                    ) : null}
                  </span>
                ),
              },
              {
                key: 'category',
                header: 'Khoản mục',
                width: '180px',
                cell: ({ categoryName }) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-body">{categoryName}</span>
                ),
              },
              {
                key: 'day',
                header: 'Sinh ngày',
                width: '130px',
                cell: ({ recurring }) => (
                  <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    ngày {recurring.dayOfMonth}
                  </span>
                ),
              },
              {
                key: 'expected',
                header: 'Dự kiến',
                width: '150px',
                numeric: true,
                cell: ({ recurring }) => (
                  <span className="text-[length:var(--fs-b2)] text-ink-hi">
                    {formatVnd(recurring.expectedVnd)}
                  </span>
                ),
              },
              {
                key: 'method',
                header: 'Hình thức',
                width: '140px',
                cell: ({ recurring }) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {recurring.method === 'cash' ? 'Tiền mặt' : 'Chuyển khoản'}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Phiếu sinh ra mang số DỰ KIẾN và ở trạng thái nháp: điện nước biến động nên phải điền số
          thật rồi mới duyệt. Chưa có bộ hẹn giờ chạy nền, nên hằng tháng phải bấm nút sinh — nút đó
          chạy lại bao nhiêu lần cũng không tạo phiếu trùng.
        </p>
      </div>
    </>
  )
}

function RecurringForm({
  branchId,
  categories,
  onClose,
  onDone,
}: {
  branchId: string
  categories: { id: string; name: string; parentId: string | null }[]
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [supplier, setSupplier] = useState('')
  const [expected, setExpected] = useState('')
  const [dayOfMonth, setDayOfMonth] = useState(5)
  const [method, setMethod] = useState<PayMethod>('transfer')

  const create = useMutation({
    mutationFn: () =>
      api.createRecurring({
        branchId,
        categoryId,
        name,
        supplier: supplier || null,
        expectedVnd: Number(expected) || 0,
        dayOfMonth,
        method,
      }),
    onSuccess: () => {
      toast('Đã thêm khoản định kỳ', 'ok')
      onDone()
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Tên khoản">
          <TextInput value={name} onChange={setName} placeholder="Tiền nhà" />
        </Field>
        <Field label="Khoản mục">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            <option value="">Chọn khoản mục…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.parentId ? `— ${c.name}` : c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nhà cung cấp">
          <TextInput value={supplier} onChange={setSupplier} placeholder="Chủ nhà" />
        </Field>
        <Field label="Số tiền dự kiến (₫)">
          <TextInput type="number" value={expected} onChange={setExpected} placeholder="25000000" />
        </Field>
        <Field label="Sinh phiếu ngày mấy (1–28)">
          <TextInput
            type="number"
            value={String(dayOfMonth)}
            onChange={(v) => setDayOfMonth(Math.min(28, Math.max(1, Number(v) || 1)))}
          />
        </Field>
        <Field label="Hình thức">
          <select
            value={method}
            onChange={(e) => setMethod(e.target.value as PayMethod)}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            <option value="transfer">Chuyển khoản</option>
            <option value="cash">Tiền mặt</option>
          </select>
        </Field>
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Bỏ</Button>
        <Button
          variant="primary"
          disabled={!name || !categoryId || !expected || create.isPending}
          onClick={() => create.mutate()}
        >
          Thêm
        </Button>
      </div>
    </section>
  )
}

// -------------------------------------------------------------------- C4

export function Assets() {
  const { branchId } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [month, setMonth] = useState(() => startOfMonth(new Date().toISOString().slice(0, 10)))
  const [adding, setAdding] = useState(false)

  const rows = useQuery({
    queryKey: ['assets', branchId],
    queryFn: () => api.assets(branchId!),
    enabled: Boolean(branchId),
  })
  const categories = useQuery({ queryKey: ['expense-categories'], queryFn: api.expenseCategories })

  const refresh = () => void queryClient.invalidateQueries({ queryKey: ['assets'] })
  const fail = (err: Error) => toast(err.message, 'danger')

  const depreciate = useMutation({
    mutationFn: () => api.generateDepreciation(branchId!, month),
    onSuccess: (result) => {
      toast(
        result.posted === 0
          ? 'Tháng này đã sinh khấu hao rồi — không ghi trùng'
          : `Đã sinh khấu hao cho ${result.posted} tài sản`,
        'ok',
      )
      refresh()
    },
    onError: fail,
  })

  const retire = useMutation({
    mutationFn: (id: number) => api.retireAsset(id, new Date().toISOString().slice(0, 10)),
    onSuccess: () => {
      toast('Đã thanh lý — ngừng sinh khấu hao từ tháng này', 'ok')
      refresh()
    },
    onError: fail,
  })

  const list = rows.data ?? []
  const totalRemaining = list.reduce((sum, a) => sum + a.remainingVnd, 0)

  return (
    <>
      <PageHeader
        title="Tài sản & khấu hao"
        subtitle={`${list.length} tài sản · giá trị còn lại ${formatVnd(totalRemaining)}. Khấu hao là chi phí nhưng không phải tiền ra.`}
        action={
          <>
            <DateInput value={month} onChange={(v) => setMonth(startOfMonth(v))} />
            <Button onClick={() => depreciate.mutate()} disabled={depreciate.isPending}>
              Sinh khấu hao {monthLabel(month).toLowerCase()}
            </Button>
            <Button variant="primary" onClick={() => setAdding(true)}>
              Ghi nhận tài sản
            </Button>
          </>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {adding ? (
          <AssetForm
            branchId={branchId!}
            categories={(categories.data ?? []).filter((c) => c.pnlLine === 'depreciation')}
            onClose={() => setAdding(false)}
            onDone={refresh}
          />
        ) : null}

        <div className="mt-5">
          <DataTable
            rows={list}
            rowKey={(asset) => asset.id}
            loading={rows.isPending}
            empty="Chưa ghi nhận tài sản nào. Mua thiết bị từ ngưỡng tài sản trở lên thì ghi ở đây thay vì ghi phiếu chi."
            columns={[
              {
                key: 'name',
                header: 'Tài sản',
                width: 'minmax(200px, 1fr)',
                cell: (asset) => (
                  <span className={asset.retiredOn ? 'opacity-60' : ''}>
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {asset.name}
                      {asset.retiredOn ? (
                        <span className="ml-2 text-[length:var(--fs-c2)] text-ink-mute">
                          thanh lý {formatDay(asset.retiredOn)}
                        </span>
                      ) : null}
                    </span>
                    <span className="mt-0.5 block text-[length:var(--fs-c1)] text-ink-mute">
                      {asset.depreciationMonths} tháng đường thẳng
                    </span>
                  </span>
                ),
              },
              {
                key: 'from',
                header: 'Dùng từ',
                width: '120px',
                cell: (asset) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {formatDay(asset.inServiceFrom)}
                  </span>
                ),
              },
              {
                key: 'monthly',
                header: 'Khấu hao',
                width: '140px',
                numeric: true,
                cell: (asset) => (
                  <span className="text-ink-body">{formatVnd(asset.monthlyVnd)}/th</span>
                ),
              },
              {
                key: 'cost',
                header: 'Nguyên giá',
                width: '140px',
                numeric: true,
                cell: (asset) => (
                  <span className="text-[length:var(--fs-b2)] text-ink-body">
                    {formatVnd(asset.costVnd)}
                  </span>
                ),
              },
              {
                key: 'accumulated',
                header: 'Đã khấu hao',
                width: '140px',
                numeric: true,
                cell: (asset) => (
                  <span className="text-ink-mute">{formatVnd(asset.accumulatedVnd)}</span>
                ),
              },
              {
                key: 'remaining',
                header: 'Còn lại',
                width: '140px',
                numeric: true,
                cell: (asset) => (
                  <span className="text-[length:var(--fs-b2)] text-ink-hi">
                    {formatVnd(asset.remainingVnd)}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: '',
                width: '130px',
                cell: (asset) => (
                  <span className="flex justify-end">
                    {asset.retiredOn ? null : (
                      <Button onClick={() => retire.mutate(asset.id)} size="sm" variant="danger">
                        Thanh lý
                      </Button>
                    )}
                  </span>
                ),
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Khấu hao đi thẳng vào sổ chi phí, không qua phiếu chi — nó là chi phí mà không có đồng nào
          rời két, nên chỉ xuất hiện ở chế độ dồn tích của{' '}
          <Link to="/lai-lo" className="text-accent-ink">
            F7 · Lãi / Lỗ
          </Link>
          . Chưa có: tab bảo trì theo chu kỳ, và luồng thanh lý có thu tiền.
        </p>
      </div>
    </>
  )
}

function AssetForm({
  branchId,
  categories,
  onClose,
  onDone,
}: {
  branchId: string
  categories: { id: string; name: string }[]
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [cost, setCost] = useState('')
  const [months, setMonths] = useState(36)
  const [from, setFrom] = useState(() => startOfMonth(new Date().toISOString().slice(0, 10)))

  const create = useMutation({
    mutationFn: () =>
      api.createAsset({
        branchId,
        categoryId,
        name,
        costVnd: Number(cost) || 0,
        inServiceFrom: from,
        depreciationMonths: months,
        note: null,
      }),
    onSuccess: () => {
      toast('Đã ghi nhận tài sản', 'ok')
      onDone()
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const monthly = months > 0 ? Math.floor((Number(cost) || 0) / months) : 0

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Tên tài sản">
          <TextInput value={name} onChange={setName} placeholder="Tủ mát 2 cánh" />
        </Field>
        <Field label="Khoản mục">
          <select
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nguyên giá (₫)">
          <TextInput type="number" value={cost} onChange={setCost} placeholder="36000000" />
        </Field>
        <Field label="Số tháng khấu hao">
          <TextInput
            type="number"
            value={String(months)}
            onChange={(v) => setMonths(Math.max(1, Number(v) || 1))}
          />
        </Field>
        <Field label="Bắt đầu dùng từ tháng">
          <DateInput value={from} onChange={(v) => setFrom(startOfMonth(v))} />
        </Field>
      </div>

      {monthly > 0 ? (
        <p className="mt-3 text-[length:var(--fs-c1)] text-ink-body">
          Khấu hao {formatVnd(monthly)} mỗi tháng trong {months} tháng. Tháng cuối nhận phần dư để
          tổng đúng bằng nguyên giá.
        </p>
      ) : null}

      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Bỏ</Button>
        <Button
          variant="primary"
          disabled={!name || !categoryId || !cost || create.isPending}
          onClick={() => create.mutate()}
        >
          Ghi nhận
        </Button>
      </div>
    </section>
  )
}

function TextInput({
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
    />
  )
}
