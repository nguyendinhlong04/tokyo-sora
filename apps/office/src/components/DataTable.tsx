import { Button } from '@sora/ui'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Select } from './form'

/**
 * Bảng dữ liệu dùng chung của Office.
 *
 * Ba việc nó gom lại, đều là thứ trước đây mỗi màn tự làm một kiểu:
 *
 * 1. **Một nguồn cho bề rộng cột.** Trước đây chuỗi `grid-cols-[...]` được chép
 *    hai lần mỗi bảng — một cho hàng tiêu đề, một cho hàng dữ liệu. Sửa một chỗ
 *    quên chỗ kia là bảng lệch cột, và có khoảng 45 chuỗi như vậy trong Office.
 *    Ở đây bề rộng khai trong mảng cột, tiêu đề và dòng cùng đọc từ đó.
 *
 * 2. **Cột co được, bảng không bị bóp.** Mặc định mỗi cột là
 *    `minmax(tối-thiểu, phần)`, và bảng có bề rộng tối thiểu bằng tổng các mức
 *    tối thiểu. Hết chỗ thì bảng CUỘN NGANG chứ không nén chữ xuống hai dòng —
 *    một bảng giá bị nén là một bảng người ta đọc nhầm số.
 *
 * 3. **Phân trang.** Cắt tại trình duyệt: dữ liệu đã tải hết, chỉ dựng DOM cho
 *    trang đang xem. 800 dòng trong DOM không sai về số liệu, nhưng cuộn giật và
 *    không ai đọc tới dòng 400.
 */

export type Column<T> = {
  key: string
  header: ReactNode
  /**
   * Track của CSS grid. Bỏ trống thì lấy `minmax(120px, 1fr)`.
   * Cột số nên khai cứng (`'130px'`) để các trang khác nhau vẫn thẳng hàng.
   */
  width?: string
  align?: 'left' | 'right' | 'center'
  /** Cột số: canh phải + chữ mono + `tabular-nums` cho thẳng hàng chữ số */
  numeric?: boolean
  cell: (row: T, index: number) => ReactNode
}

const DEFAULT_TRACK = 'minmax(120px, 1fr)'

/** Bề rộng tối thiểu của một track, để tính bề rộng tối thiểu của cả bảng */
function trackMin(track: string): number {
  const minmax = /minmax\(\s*(\d+)px/.exec(track)
  if (minmax) return Number(minmax[1])
  const px = /^(\d+)px$/.exec(track.trim())
  if (px) return Number(px[1])
  return 120
}

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' } as const

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  pageSize: initialPageSize = 25,
  loading = false,
  empty = 'Chưa có dữ liệu.',
  toolbar,
  renderDetail,
  renderBanner,
  onRowClick,
  onOpenChange,
  rowClassName,
  paginate = true,
  /** Đặt lại về trang 1 khi giá trị này đổi — truyền bộ lọc hiện hành vào đây */
  resetKey,
}: {
  columns: Column<T>[]
  rows: T[]
  rowKey: (row: T) => string | number
  pageSize?: number
  loading?: boolean
  empty?: ReactNode
  /** Thanh lọc / nút hàng loạt, nằm trong khung bảng ngay trên tiêu đề cột */
  toolbar?: ReactNode
  /** Có thì mỗi dòng bung được một khối chi tiết bên dưới */
  renderDetail?: (row: T) => ReactNode
  /**
   * Dải LUÔN HIỆN dưới dòng, không phụ thuộc dòng có bung hay không.
   *
   * Dành cho cảnh báo gắn với chính dòng đó mà người dùng phải thấy khi lướt —
   * "ca chưa chấm ra", "thiếu công 4 ngày" ở bảng công H4. Nhét chúng vào một ô
   * thì mất sức nặng; giấu vào phần bung thì phải mở từng dòng mới biết dòng nào
   * có vấn đề, đúng thứ mà bảng phải trả lời ngay.
   *
   * Trả `null` cho dòng không có gì để cảnh báo.
   */
  renderBanner?: (row: T) => ReactNode
  onRowClick?: (row: T) => void
  /** Báo ra ngoài dòng nào đang bung — cho màn nạp dữ liệu chi tiết theo yêu cầu */
  onOpenChange?: (key: string | number | null) => void
  /** Nhấn nền cho dòng đặc biệt — dòng cộng gộp của bảng Lãi/Lỗ chẳng hạn */
  rowClassName?: (row: T) => string
  paginate?: boolean
  resetKey?: unknown
}) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)
  const [openKey, setOpenKey] = useState<string | number | null>(null)

  const template = columns.map((c) => c.width ?? DEFAULT_TRACK).join(' ')
  const minWidth = columns.reduce((sum, c) => sum + trackMin(c.width ?? DEFAULT_TRACK), 0) + 40

  const total = rows.length
  const pageCount = paginate ? Math.max(1, Math.ceil(total / pageSize)) : 1

  // Lọc xong mà vẫn đứng ở trang 7 thì màn hình trống trơn dù có kết quả.
  useEffect(() => setPage(1), [resetKey, pageSize])
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const visible = useMemo(
    () => (paginate ? rows.slice((page - 1) * pageSize, page * pageSize) : rows),
    [rows, page, pageSize, paginate],
  )

  return (
    <section className="overflow-hidden rounded-md border border-line-1 bg-surface-1">
      {toolbar ? (
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3 border-b border-line-1 px-5 py-3.5">
          {toolbar}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div style={{ minWidth }}>
          <div
            role="row"
            style={{ gridTemplateColumns: template }}
            className="grid items-end gap-3 border-b border-line-1 bg-surface-2 px-5 py-2.5"
          >
            {columns.map((c) => (
              <span
                key={c.key}
                role="columnheader"
                className={[
                  'text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase',
                  ALIGN[c.align ?? (c.numeric ? 'right' : 'left')],
                ].join(' ')}
              >
                {c.header}
              </span>
            ))}
          </div>

          {loading ? (
            <TableMessage>Đang tải…</TableMessage>
          ) : total === 0 ? (
            <TableMessage>{empty}</TableMessage>
          ) : (
            visible.map((row, i) => {
              const key = rowKey(row)
              const open = openKey === key
              // Chỉ số TUYỆT ĐỐI trong `rows`, không phải vị trí trong trang. Cột nào
              // hỏi "dòng này có phải dòng đầu không" mà nhận chỉ số theo trang thì
              // sang trang 2 dòng đầu trang lại tự nhận là dòng đầu bảng.
              const absolute = paginate ? (page - 1) * pageSize + i : i
              // `renderDetail` trả `null` nghĩa là DÒNG NÀY không có gì để bung —
              // ví dụ nhật ký thao tác chỉ một số dòng mang payload. Hỏi trước khi
              // vẽ để không bung ra một khung rỗng, và để dòng đó không giả vờ bấm được.
              const detail = renderDetail ? renderDetail(row) : null
              const banner = renderBanner ? renderBanner(row) : null
              return (
                <div key={key} className="border-b border-line-1 last:border-b-0">
                  <div
                    role="row"
                    style={{ gridTemplateColumns: template }}
                    onClick={
                      detail
                        ? () => {
                            const next = open ? null : key
                            setOpenKey(next)
                            onOpenChange?.(next)
                          }
                        : onRowClick
                          ? () => onRowClick(row)
                          : undefined
                    }
                    className={[
                      'grid items-center gap-3 px-5 py-3 transition-colors',
                      detail || onRowClick ? 'cursor-pointer hover:bg-surface-2' : '',
                      open ? 'bg-surface-2' : '',
                      rowClassName?.(row) ?? '',
                    ].join(' ')}
                  >
                    {columns.map((c) => (
                      <span
                        key={c.key}
                        className={[
                          'min-w-0 text-[length:var(--fs-b2)] text-ink-body',
                          c.numeric ? 'font-mono tabular-nums' : '',
                          ALIGN[c.align ?? (c.numeric ? 'right' : 'left')],
                        ].join(' ')}
                      >
                        {c.cell(row, absolute)}
                      </span>
                    ))}
                  </div>
                  {banner ? (
                    <div className="flex flex-wrap items-center gap-2 border-t border-line-1 px-5 py-2.5">
                      {banner}
                    </div>
                  ) : null}
                  {open && detail ? (
                    <div className="border-t border-line-1 bg-canvas px-5 py-4">{detail}</div>
                  ) : null}
                </div>
              )
            })
          )}
        </div>
      </div>

      {paginate && total > 0 ? (
        <Pagination
          page={page}
          pageCount={pageCount}
          pageSize={pageSize}
          total={total}
          onPage={setPage}
          onPageSize={setPageSize}
        />
      ) : null}
    </section>
  )
}

function TableMessage({ children }: { children: ReactNode }) {
  return (
    <p className="px-5 py-8 text-center text-[length:var(--fs-b2)] text-ink-mute">{children}</p>
  )
}

// ---------------------------------------------------------------------------

const PAGE_SIZES = [25, 50, 100, 200]

/**
 * Chân trang phân trang.
 *
 * Luôn nói rõ "đang xem 26–50 trong 137" chứ không chỉ số trang: người dùng cần
 * biết TỔNG để quyết định có nên lọc hẹp lại không, và một dãy số trang trần
 * không trả lời được câu đó.
 *
 * Tách rời khỏi `DataTable` vì nhiều màn của Office là danh sách thẻ bung được
 * chứ không phải bảng — dùng chung với `usePaged`.
 */
export function Pagination({
  page,
  pageCount,
  pageSize,
  total,
  onPage,
  onPageSize,
}: {
  page: number
  pageCount: number
  pageSize: number
  total: number
  onPage: (next: number) => void
  onPageSize?: (next: number) => void
}) {
  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-line-1 bg-surface-2 px-5 py-3">
      <p className="text-[length:var(--fs-c1)] text-ink-mute">
        Đang xem{' '}
        <span className="font-mono text-ink-body">
          {from}–{to}
        </span>{' '}
        trong <span className="font-mono text-ink-body">{total}</span>
      </p>

      {onPageSize ? (
        <label className="flex items-center gap-2 text-[length:var(--fs-c1)] text-ink-mute">
          Mỗi trang
          <Select
            value={String(pageSize)}
            onChange={(v) => onPageSize(Number(v))}
            options={PAGE_SIZES.map((n) => ({ value: String(n), label: String(n) }))}
            width={80}
          />
        </label>
      ) : null}

      {pageCount > 1 ? (
        <div className="ml-auto flex items-center gap-1.5">
          <Button size="sm" disabled={page === 1} onClick={() => onPage(page - 1)}>
            Trước
          </Button>
          {pageWindow(page, pageCount).map((p, i) =>
            p === null ? (
              <span key={`gap-${i}`} className="px-1 text-[length:var(--fs-c1)] text-ink-mute">
                …
              </span>
            ) : (
              <button
                key={p}
                type="button"
                aria-current={p === page ? 'page' : undefined}
                onClick={() => onPage(p)}
                className={[
                  'h-9 min-w-9 rounded-sm px-2 font-mono text-[length:var(--fs-c1)] transition-colors',
                  'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
                  p === page
                    ? 'bg-accent-strong font-semibold text-on-accent'
                    : 'border border-line-3 text-ink-body hover:bg-surface-3',
                ].join(' ')}
              >
                {p}
              </button>
            ),
          )}
          <Button size="sm" disabled={page === pageCount} onClick={() => onPage(page + 1)}>
            Sau
          </Button>
        </div>
      ) : null}
    </div>
  )
}

/**
 * Dãy số trang rút gọn: luôn có trang đầu, trang cuối, trang hiện tại và hai
 * trang kề. `null` là chỗ chèn dấu "…".
 */
function pageWindow(page: number, pageCount: number): (number | null)[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1)

  const keep = new Set([1, pageCount, page, page - 1, page + 1])
  const out: (number | null)[] = []
  let gap = false
  for (let p = 1; p <= pageCount; p++) {
    if (keep.has(p)) {
      out.push(p)
      gap = false
    } else if (!gap) {
      out.push(null)
      gap = true
    }
  }
  return out
}

// ---------------------------------------------------------------------------

/** Phân trang cho danh sách KHÔNG phải bảng (danh sách thẻ bung được). */
export function usePaged<T>(rows: T[], initialPageSize = 25, resetKey?: unknown) {
  const [page, setPage] = useState(1)
  const [pageSize, setPageSize] = useState(initialPageSize)

  const total = rows.length
  const pageCount = Math.max(1, Math.ceil(total / pageSize))

  useEffect(() => setPage(1), [resetKey, pageSize])
  useEffect(() => {
    if (page > pageCount) setPage(pageCount)
  }, [page, pageCount])

  const visible = useMemo(
    () => rows.slice((page - 1) * pageSize, page * pageSize),
    [rows, page, pageSize],
  )

  return {
    visible,
    /** Gắn thẳng vào `<Pagination {...paged.controls} />` */
    controls: { page, pageCount, pageSize, total, onPage: setPage, onPageSize: setPageSize },
  }
}
