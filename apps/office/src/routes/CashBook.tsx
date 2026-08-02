import { formatVnd } from '@sora/contracts'
import { EmptyState, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api } from '../api'
import { PageHeader } from '../components/PageHeader'
import { BlockedStat, DateInput, Money, formatDay, formatTime } from '../components/report'
import { useSession } from '../session-context'

/**
 * F1 — Sổ quỹ & đối soát ngân hàng.
 *
 * Màn này chỉ trả lời một câu: **tiền hệ thống ghi có khớp tiền thật không**.
 * Nên nó cố tình không gộp mọi thứ thành một con số đẹp mà tách làm ba khối tiền
 * mặt / chuyển khoản / việc còn treo — chỗ lệch nằm ở khối thứ ba, và gộp lại là
 * giấu mất nó.
 *
 * Hai cửa ghi của F1 trong bản thiết kế chưa dựng: chi tiền mặt (từ phiếu chi C2)
 * và phiếu thu khác. Màn nói thẳng ra chứ không hiện 0₫.
 */

const KIND_LABELS: Record<string, string> = {
  cash: 'Tiền mặt',
  vietqr: 'Chuyển khoản QR',
  card: 'Thẻ',
  cod: 'COD (shipper thu hộ)',
}

const kindLabel = (kind: string) => KIND_LABELS[kind] ?? kind

export function CashBook() {
  const { branchId } = useSession()
  const [date, setDate] = useState<string | null>(null)

  const report = useQuery({
    queryKey: ['report-cashbook', branchId, date],
    queryFn: () => api.cashbook(branchId!, date),
    enabled: Boolean(branchId),
  })

  const data = report.data
  const totalPaid = (data?.byKind ?? []).reduce((sum, k) => sum + k.paid, 0)

  return (
    <>
      <PageHeader
        title="Sổ quỹ & đối soát"
        subtitle={
          data
            ? `Ngày làm việc ${formatDay(data.date)} · đã thu ${formatVnd(totalPaid)}`
            : 'Tiền mặt theo ca, chuyển khoản theo giao dịch, và những khoản còn treo.'
        }
        action={<DateInput value={date ?? data?.date ?? ''} onChange={setDate} />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {report.isError ? (
          <ErrorState message={(report.error as Error).message} />
        ) : !data ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          <>
            <div className="grid gap-4 lg:grid-cols-4">
              {data.byKind.length === 0 ? (
                <p className="text-ink-mute lg:col-span-4">Ngày này chưa thu khoản nào.</p>
              ) : (
                data.byKind.map((kind) => (
                  <div
                    key={kind.kind}
                    className="rounded-md border border-line-1 bg-surface-1 px-5 py-4"
                  >
                    <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                      {kindLabel(kind.kind)}
                    </p>
                    <p className="mt-2 font-mono text-[length:var(--fs-t1)] leading-none text-ink-hi">
                      {formatVnd(kind.paid)}
                    </p>
                    <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
                      {kind.count} lượt trả
                    </p>
                  </div>
                ))
              )}
            </div>

            <Section title="Tiền mặt theo ca">
              {data.shifts.length === 0 ? (
                <EmptyState title="Ngày này chưa mở ca nào." />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line-1 text-left text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                      <Th>Thu ngân</Th>
                      <Th>Ca</Th>
                      <Th right>Đầu ca</Th>
                      <Th right>Thu tiền mặt</Th>
                      <Th right>Chi tiền mặt</Th>
                      <Th right>Dự kiến cuối ca</Th>
                      <Th right>Đếm thực</Th>
                      <Th right>Lệch</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.shifts.map((shift) => (
                      <tr key={shift.id} className="border-b border-line-1 last:border-b-0">
                        <Td>{shift.cashier ?? '—'}</Td>
                        <Td>
                          {formatTime(shift.openedAt)} –{' '}
                          {shift.closedAt ? (
                            formatTime(shift.closedAt)
                          ) : (
                            <span className="text-accent">đang mở</span>
                          )}
                        </Td>
                        <Td right>
                          <Money amount={shift.openingCash} className="text-ink-body" />
                        </Td>
                        <Td right>
                          <Money amount={shift.cashIn} className="text-ink-body" />
                        </Td>
                        <Td right>
                          {shift.cashOut === 0 ? (
                            <span className="text-line-4">—</span>
                          ) : (
                            <Money amount={-shift.cashOut} className="text-danger" />
                          )}
                        </Td>
                        <Td right>
                          {shift.expected === null ? (
                            <span className="text-ink-mute">chưa chốt</span>
                          ) : (
                            <Money amount={shift.expected} className="text-ink-body" />
                          )}
                        </Td>
                        <Td right>
                          {shift.counted === null ? (
                            <span className="text-ink-mute">chưa đếm</span>
                          ) : (
                            <Money amount={shift.counted} className="text-ink-hi" />
                          )}
                        </Td>
                        <Td right>
                          {shift.variance === null ? (
                            <span className="text-ink-mute">—</span>
                          ) : (
                            <Money
                              amount={shift.variance}
                              className={shift.variance === 0 ? 'text-ok' : 'text-danger'}
                            />
                          )}
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                Cột chi tiền mặt là tổng phiếu chi tiền mặt ĐÃ DUYỆT của cả NGÀY: phiếu chi không
                gắn ca thu ngân, nên nó chỉ đúng ở mức ngày. “Dự kiến cuối ca” vẫn do lúc đóng ca
                chốt, chưa trừ phần chi này.
              </p>
            </Section>

            {data.cashVouchers.length > 0 ? (
              <Section title="Phiếu chi tiền mặt trong ngày">
                <ul className="flex flex-col gap-2">
                  {data.cashVouchers.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-baseline gap-3 border-b border-line-1 pb-2 text-[length:var(--fs-c1)] last:border-b-0"
                    >
                      <span className="w-44 text-ink-body">{row.categoryName}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-mute">
                        {row.supplier ?? row.memo ?? ''}
                      </span>
                      <span className={row.state === 'approved' ? 'text-ok' : 'text-warn'}>
                        {row.state === 'approved' ? 'đã duyệt' : 'chờ duyệt'}
                      </span>
                      <Money
                        amount={-row.amountVnd}
                        className={row.state === 'approved' ? 'text-danger' : 'text-ink-mute'}
                      />
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                  Phiếu chờ duyệt hiện ở đây để đối soát quỹ nhưng CHƯA trừ vào cột chi và chưa vào
                  Lãi/Lỗ.
                </p>
              </Section>
            ) : null}

            <Section title="Chuyển khoản & thẻ">
              {data.transfers.length === 0 ? (
                <EmptyState title="Ngày này chưa có giao dịch không dùng tiền mặt." />
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-line-1 text-left text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                      <Th>Giờ</Th>
                      <Th>Hình thức</Th>
                      <Th>Đơn</Th>
                      <Th>Tài khoản ảo</Th>
                      <Th>Mã giao dịch</Th>
                      <Th right>Số tiền</Th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transfers.map((row) => (
                      <tr key={row.paymentId} className="border-b border-line-1 last:border-b-0">
                        <Td>{row.paidAt ? formatTime(row.paidAt) : '—'}</Td>
                        <Td>{kindLabel(row.kind)}</Td>
                        <Td mono>{row.orderCode ?? '—'}</Td>
                        <Td mono>{row.vaNumber ?? '—'}</Td>
                        <Td mono>{row.bankRef ?? '—'}</Td>
                        <Td right>
                          <Money amount={row.amount} className="text-ink-hi" />
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Section>

            <Section title="Còn treo — phải soi trước khi khoá ngày">
              <div className="grid gap-6 lg:grid-cols-2">
                <div>
                  <p className="text-[length:var(--fs-b2)] text-ink-hi">
                    Lượt trả chưa có tiền về
                  </p>
                  {data.pending.length === 0 ? (
                    <p className="mt-2 text-[length:var(--fs-c1)] text-ok">
                      Không có lượt nào treo.
                    </p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                      {data.pending.map((row) => (
                        <li
                          key={row.paymentId}
                          className="flex items-baseline gap-3 border-b border-line-1 pb-2 text-[length:var(--fs-c1)] last:border-b-0"
                        >
                          <span className="text-ink-mute">{formatTime(row.createdAt)}</span>
                          <span className="font-mono text-ink-mute">{row.vaNumber ?? '—'}</span>
                          <Money amount={row.amount} className="ml-auto text-warn" />
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                    Khách đã sinh mã QR nhưng ngân hàng chưa báo có. Chỉ webhook/API ngân hàng mới
                    đóng được khoản — không có nút đánh dấu tay ở đây.
                  </p>
                </div>

                <div>
                  <p className="text-[length:var(--fs-b2)] text-ink-hi">
                    Ngân hàng báo có nhưng chưa khớp
                  </p>
                  {data.unmatchedBankEvents.length === 0 ? (
                    <p className="mt-2 text-[length:var(--fs-c1)] text-ok">
                      Mọi báo có đều đã khớp lượt trả.
                    </p>
                  ) : (
                    <ul className="mt-3 flex flex-col gap-2">
                      {data.unmatchedBankEvents.map((row) => (
                        <li
                          key={row.id}
                          className="flex items-baseline gap-3 border-b border-line-1 pb-2 text-[length:var(--fs-c1)] last:border-b-0"
                        >
                          <span className="text-ink-mute">{formatTime(row.receivedAt)}</span>
                          <span className="font-mono text-ink-mute">{row.bankRef}</span>
                          <span className="text-danger">
                            {row.matchState === 'amount_mismatch' ? 'lệch số tiền' : 'không khớp'}
                          </span>
                          <Money amount={row.amount} className="ml-auto text-ink-hi" />
                        </li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                    Hộp thư ngân hàng không mang mã chi nhánh, nên danh sách này là của toàn hệ
                    thống — khoản chưa khớp thì chưa biết thuộc về ai.
                  </p>
                </div>
              </div>
            </Section>

            {data.adjustments.length > 0 ? (
              <Section title="Bút toán lệch quỹ">
                <ul className="flex flex-col gap-2">
                  {data.adjustments.map((row) => (
                    <li
                      key={row.id}
                      className="flex items-baseline gap-3 border-b border-line-1 pb-2 text-[length:var(--fs-c1)] last:border-b-0"
                    >
                      <span className="text-ink-mute">{formatTime(row.createdAt)}</span>
                      <span className="text-ink-body">{row.memo ?? 'Không ghi lý do'}</span>
                      <Money amount={row.amount} className="ml-auto text-danger" />
                    </li>
                  ))}
                </ul>
                <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                  Chênh lệch kiểm quỹ ghi thành bút toán riêng, không âm thầm sửa doanh thu — sổ
                  doanh thu là sổ bất biến.
                </p>
              </Section>
            ) : null}

            <div className="mt-5">
              <BlockedStat label="Phiếu thu khác" tile={data.otherIncome} />
            </div>
          </>
        )}
      </div>
    </>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-5">
      <p className="mb-4 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {title}
      </p>
      {children}
    </section>
  )
}

function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return <th className={`pb-3 font-semibold ${right ? 'text-right' : ''}`}>{children}</th>
}

function Td({
  children,
  right = false,
  mono = false,
}: {
  children: ReactNode
  right?: boolean
  mono?: boolean
}) {
  return (
    <td
      className={`py-2.5 text-[length:var(--fs-b2)] text-ink-body ${right ? 'text-right' : ''} ${
        mono ? 'font-mono text-[length:var(--fs-c1)]' : ''
      }`}
    >
      {children}
    </td>
  )
}
