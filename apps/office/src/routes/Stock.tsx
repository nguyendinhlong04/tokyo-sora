import { formatVnd } from '@sora/contracts'
import { emberColor } from '@sora/core'
import { Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, type IngredientRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { BlockedStat, Field, formatDay } from '../components/report'
import { useSession } from '../session-context'

/**
 * S1 Tổng quan · S2 Tồn kho.
 *
 * Thanh mức tồn dùng thang than hồng (§8.3) nhưng ĐẢO CHIỀU so với đồng hồ vé bếp:
 * ở vé bếp, càng lâu càng nóng; ở kho, càng CẠN càng nóng. Cùng một ngôn ngữ màu,
 * cùng một ý "sắp phải làm gì đó".
 */

export function StockOverview() {
  const { branchId } = useSession()

  const overview = useQuery({
    queryKey: ['stock-overview', branchId],
    queryFn: () => api.stockOverview(branchId!),
    enabled: Boolean(branchId),
  })

  const data = overview.data

  return (
    <>
      <PageHeader
        title="Tổng quan kho"
        subtitle="Giá trị tồn, hàng dưới định mức, và tiêu hao nguyên liệu trong tháng."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {overview.isError ? (
          <ErrorState message={(overview.error as Error).message} />
        ) : !data ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          <>
            <div className="grid gap-4 xl:grid-cols-2 2xl:grid-cols-4">
              <Stat
                label="Giá trị tồn"
                value={formatVnd(data.totalValueVnd)}
                note={`${data.ingredientCount} nguyên liệu đang khai`}
              />
              <Stat
                label="Dưới định mức"
                value={String(data.belowMin.length)}
                note={data.belowMin.length === 0 ? 'Không có mặt hàng nào cạn' : 'cần đặt thêm'}
                tone={data.belowMin.length > 0 ? 'text-danger' : undefined}
              />
              <Stat
                label="Giá vốn tiêu hao tháng này"
                value={formatVnd(data.consumedThisMonthVnd)}
                note="Trừ kho thật khi bếp bấm Xong"
              />
              <BlockedStat label="Lô sắp hết hạn" tile={data.expiringLots} />
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-2">
              <section className="rounded-md border border-line-1 bg-surface-1 p-5">
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Đang cản trở giá vốn
                </p>
                <ul className="mt-4 flex flex-col gap-3 text-[length:var(--fs-b2)]">
                  <li className="flex items-baseline gap-3">
                    <span className="font-mono text-ink-hi">{data.dishesWithoutRecipe}</span>
                    <span className="text-ink-body">món chưa khai công thức</span>
                    <Link to="/cong-thuc" className="ml-auto text-[length:var(--fs-c1)] text-accent-ink">
                      Khai ở M4
                    </Link>
                  </li>
                  <li className="flex items-baseline gap-3">
                    <span className="font-mono text-ink-hi">{data.withoutCost}</span>
                    <span className="text-ink-body">nguyên liệu chưa có giá</span>
                    <Link
                      to="/nguyen-lieu"
                      className="ml-auto text-[length:var(--fs-c1)] text-accent-ink"
                    >
                      Nhập kho ở M7
                    </Link>
                  </li>
                </ul>
                <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                  Mỗi dòng ở đây là một chỗ food cost đang bị hụt: món chưa có công thức thì không
                  vào được giá vốn hàng bán, và nguyên liệu chưa có giá thì vào với giá 0₫.
                </p>
              </section>

              <BlockedStat label="Hao hụt tháng" tile={data.wasteThisMonth} />
            </div>

            {data.belowMin.length > 0 ? (
              <section className="mt-4 rounded-md border border-danger-line bg-surface-1 p-5">
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  Dưới định mức
                </p>
                <ul className="mt-4 flex flex-col gap-2">
                  {data.belowMin.map((row) => (
                    <li key={row.id} className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate text-[length:var(--fs-b2)] text-ink-hi">
                        {row.name}
                      </span>
                      <span className="font-mono text-[length:var(--fs-c1)] text-danger">
                        còn {row.qtyBase.toLocaleString('vi-VN')} / {row.minLevelBase.toLocaleString('vi-VN')} {row.baseUnit}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            <p className="mt-5 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
              Chưa có trong bản dựng này: nhà cung cấp (S3), đơn đặt hàng gợi ý theo tốc độ tiêu
              thụ (S4), nhập theo lô kèm hạn dùng (S5 · S9), xuất kho bốn loại (S6), sản xuất nội
              bộ và pha lóc thịt (S7), kiểm kê (S8), chuyển kho giữa chi nhánh (S10), báo cáo hao
              hụt (S11), thẻ kho đầy đủ (S12).
            </p>
          </>
        )}
      </div>
    </>
  )
}

// ---------------------------------------------------------------- S2

export function StockLevels() {
  const { branchId, can } = useSession()
  const [adjusting, setAdjusting] = useState<IngredientRow | null>(null)
  const [inspecting, setInspecting] = useState<IngredientRow | null>(null)
  const mayAdjust = can('stock.write-off')

  const rows = useQuery({
    queryKey: ['ingredients', branchId],
    queryFn: () => api.ingredients(branchId!),
    enabled: Boolean(branchId),
  })

  const list = (rows.data ?? []).filter((r) => r.active)
  const groups = [...new Set(list.map((r) => r.groupName ?? 'Chưa phân nhóm'))]

  return (
    <>
      <PageHeader
        title="Tồn kho"
        subtitle="Thanh mức tồn theo thang than hồng — càng cạn càng nóng. Tồn giảm tự động khi bếp bấm Xong."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {adjusting ? (
          <AdjustForm
            row={adjusting}
            branchId={branchId!}
            onClose={() => setAdjusting(null)}
          />
        ) : null}

        {inspecting ? (
          <MoveList row={inspecting} branchId={branchId!} onClose={() => setInspecting(null)} />
        ) : null}

        {rows.isPending ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : list.length === 0 ? (
          <p className="text-[length:var(--fs-b2)] text-ink-mute">
            Chưa có nguyên liệu nào.{' '}
            <Link to="/nguyen-lieu" className="text-accent-ink">
              Khai ở M7
            </Link>
            .
          </p>
        ) : (
          groups.map((group) => (
            <section key={group} className="mt-5 first:mt-0">
              <p className="mb-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                {group}
              </p>
              <div className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
                {list
                  .filter((r) => (r.groupName ?? 'Chưa phân nhóm') === group)
                  .map((row) => (
                    <div
                      key={row.id}
                      className="grid grid-cols-[1fr_200px_150px_140px_160px] items-center gap-4 border-b border-line-1 px-5 py-3 last:border-b-0"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                          {row.name}
                        </span>
                        <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
                          {row.code}
                        </span>
                      </span>

                      <EmberBar row={row} />

                      <span className="text-right">
                        <span className="block font-mono text-[length:var(--fs-b2)] text-ink-hi">
                          {row.qtyBase.toLocaleString('vi-VN')} {row.baseUnit}
                        </span>
                        <span className="block text-[length:var(--fs-c2)] text-ink-mute">
                          {row.qtyPurchase.toLocaleString('vi-VN', { maximumFractionDigits: 2 })}{' '}
                          {row.purchaseUnit}
                        </span>
                      </span>

                      <span className="text-right font-mono text-[length:var(--fs-b2)] text-ink-body">
                        {formatVnd(row.valueVnd)}
                      </span>

                      <span className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setInspecting(row)}
                          className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                        >
                          Thẻ kho
                        </button>
                        {mayAdjust ? (
                          <button
                            type="button"
                            onClick={() => setAdjusting(row)}
                            className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                          >
                            Điều chỉnh
                          </button>
                        ) : null}
                      </span>
                    </div>
                  ))}
              </div>
            </section>
          ))
        )}
      </div>
    </>
  )
}

function EmberBar({ row }: { row: IngredientRow }) {
  if (row.emberRatio === null) {
    return (
      <span className="text-[length:var(--fs-c1)] text-ink-mute">chưa khai định mức</span>
    )
  }
  // Thanh vẽ mức CÒN LẠI, còn màu lấy theo mức CẠN
  const remaining = Math.max(0, Math.min(1, 1 - row.emberRatio))

  return (
    <span className="block">
      <span className="block h-2 w-full overflow-hidden rounded-pill bg-surface-3">
        <span
          className="block h-full rounded-pill"
          style={{ width: `${remaining * 100}%`, backgroundColor: emberColor(row.emberRatio) }}
        />
      </span>
      <span className="mt-1 block text-[length:var(--fs-c2)] text-ink-mute">
        định mức {row.minLevelBase.toLocaleString('vi-VN')} {row.baseUnit}
      </span>
    </span>
  )
}

function AdjustForm({
  row,
  branchId,
  onClose,
}: {
  row: IngredientRow
  branchId: string
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [delta, setDelta] = useState('')
  const [note, setNote] = useState('')

  const adjust = useMutation({
    mutationFn: () =>
      api.adjustStock({
        branchId,
        ingredientId: row.id,
        qtyBaseDelta: Number(delta),
        note,
      }),
    onSuccess: () => {
      toast('Đã ghi điều chỉnh vào sổ kho', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['ingredients'] })
      onClose()
    },
    onError: (err: Error) =>
      toast(
        err.message.includes('duyệt')
          ? 'Vai trò của bạn cần người khác duyệt thao tác này — luồng duyệt bằng PIN chưa có trên Office'
          : err.message,
        'danger',
      ),
  })

  return (
    <section className="rounded-md border border-warn bg-surface-1 p-5">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        Điều chỉnh tồn · {row.name}
      </p>
      <div className="mt-4 grid gap-4 lg:grid-cols-[200px_1fr_auto]">
        <Field label={`Chênh lệch (${row.baseUnit}, âm là giảm)`}>
          <input
            type="number"
            value={delta}
            onChange={(e) => setDelta(e.target.value)}
            placeholder="-250"
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-right font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field label="Lý do (bắt buộc)">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Đếm lại sau ca tối, hành hỏng bỏ đi"
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <div className="flex items-end gap-2">
          <Button onClick={onClose}>Bỏ</Button>
          <Button
            variant="primary"
            disabled={!delta || !note.trim() || adjust.isPending}
            onClick={() => adjust.mutate()}
          >
            Ghi
          </Button>
        </div>
      </div>
      <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Đây không phải kiểm kê (S8) — kiểm kê là đếm cả kho rồi duyệt một lượt. Đây là cửa sửa một
        con số lệch, và nó ghi thành bút toán riêng trong sổ kho chứ không sửa số cũ.
      </p>
    </section>
  )
}

const MOVE_LABELS: Record<string, string> = {
  receipt: 'Nhập kho',
  sale: 'Bán (bếp bấm Xong)',
  count_adjust: 'Điều chỉnh',
}

function MoveList({
  row,
  branchId,
  onClose,
}: {
  row: IngredientRow
  branchId: string
  onClose: () => void
}) {
  const moves = useQuery({
    queryKey: ['stock-moves', branchId, row.id],
    queryFn: () => api.stockMoves(branchId, row.id),
  })

  return (
    <section className="rounded-md border border-line-1 bg-surface-1 p-5">
      <div className="flex items-baseline">
        <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
          Thẻ kho · {row.name}
        </p>
        <button
          type="button"
          onClick={onClose}
          className="ml-auto text-[length:var(--fs-c1)] text-accent-ink"
        >
          Đóng
        </button>
      </div>

      {moves.isPending ? (
        <p className="mt-4 text-ink-mute">Đang tải…</p>
      ) : (moves.data ?? []).length === 0 ? (
        <p className="mt-4 text-[length:var(--fs-c1)] text-ink-mute">
          Chưa có bút toán nào cho nguyên liệu này.
        </p>
      ) : (
        <ul className="mt-4 flex flex-col gap-2">
          {(moves.data ?? []).map((move) => (
            <li
              key={move.id}
              className="flex items-baseline gap-3 border-b border-line-1 pb-2 text-[length:var(--fs-c1)] last:border-b-0"
            >
              <span className="w-24 text-ink-mute">{formatDay(move.businessDate)}</span>
              <span className="w-44 text-ink-body">{MOVE_LABELS[move.kind] ?? move.kind}</span>
              <span
                className={`w-32 text-right font-mono ${
                  move.qtyBase > 0 ? 'text-ok' : 'text-danger'
                }`}
              >
                {move.qtyBase > 0 ? '+' : ''}
                {move.qtyBase.toLocaleString('vi-VN')} {row.baseUnit}
              </span>
              <span className="w-32 text-right font-mono text-ink-mute">
                {formatVnd(move.costVnd)}
              </span>
              <span className="min-w-0 flex-1 truncate text-ink-mute">{move.note ?? ''}</span>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Sổ kho là sổ bất biến: không dòng nào sửa hay xoá được, kể cả từ máy chủ. Đây là bản rút
        gọn của thẻ kho S12 — 50 bút toán gần nhất.
      </p>
    </section>
  )
}

function Stat({
  label,
  value,
  note,
  tone,
}: {
  label: string
  value: string
  note: string
  tone?: string
}) {
  return (
    <div className="rounded-md border border-line-1 bg-surface-1 px-5 py-4">
      <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
        {label}
      </p>
      <p className={`mt-2 font-mono text-[length:var(--fs-d3)] leading-none ${tone ?? 'text-ink-hi'}`}>
        {value}
      </p>
      <p className="mt-3 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">{note}</p>
    </div>
  )
}
