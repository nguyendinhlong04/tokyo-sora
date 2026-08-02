import { Button, useToast } from '@sora/ui'
import { useState } from 'react'
import { Link } from 'react-router'
import { api, type PeriodChoice } from '../api'
import { PageHeader } from '../components/PageHeader'
import { PeriodComparator, formatRange } from '../components/report'
import { useSession } from '../session-context'

/**
 * B10 — Trung tâm báo cáo.
 *
 * §25 B10 nói màn này làm hai việc: **đặt lịch email** và **xuất Excel/PDF**.
 * Bản dựng này làm được một, và nói thẳng phần chưa làm được thay vì để một nút
 * bấm vào không ra gì:
 *
 *   · **Xuất CSV — có.** Kéo đúng dữ liệu mà màn báo cáo đang xem rồi ghi ra tệp
 *     ngay trên máy trạm. Excel mở trực tiếp được CSV, nên đi đường vòng qua một
 *     thư viện .xlsx nặng vài trăm KB chỉ để có phần mở rộng khác là đổi băng
 *     thông lấy hình thức.
 *   · **Đặt lịch email — chưa.** Cần máy chủ gửi thư và một bộ hẹn giờ chạy nền,
 *     mà hệ thống chưa có cả hai. Dựng một màn khai lịch trong khi không có gì
 *     gửi thư đi là dựng một tính năng chết.
 *   · **PDF — chưa.** Cùng lý do: xuất PDF đúng bố cục cần một bộ dựng trang, và
 *     bản in "vừa đủ đọc" thì trình duyệt đã in được từ chính màn báo cáo.
 */

interface ReportDef {
  key: string
  code: string
  title: string
  to: string
  hint: string
  need: 'report.branch-revenue' | 'report.margin-foodcost' | 'accounting.ledger-close-period' | 'report.pnl-branch-summary'
  /** Kéo dữ liệu rồi trải thành các dòng phẳng để ghi CSV */
  fetch: (branchId: string, period: PeriodChoice) => Promise<Record<string, unknown>[]>
}

const REPORTS: ReportDef[] = [
  {
    key: 'revenue',
    code: 'B2',
    title: 'Doanh thu',
    to: '/doanh-thu',
    hint: 'Theo ngày, khung giờ, khu, hình thức, kênh và cách trả tiền',
    need: 'report.branch-revenue',
    fetch: async (branch, period) => {
      const r = await api.revenueReport(branch, period)
      return r.daily.map((d) => ({
        ngay: d.day,
        doanhThu: d.value,
        ngayDoiChieu: d.baselineDay,
        doanhThuDoiChieu: d.baseline,
      }))
    },
  },
  {
    key: 'menu-matrix',
    code: 'B3',
    title: 'Phân tích món',
    to: '/phan-tich-mon',
    hint: 'Ma trận Ngôi sao · Bò sữa · Câu đố · Bỏ đi',
    need: 'report.margin-foodcost',
    fetch: async (branch, period) => {
      const r = await api.menuMatrix(branch, period)
      return r.rows.map((d) => ({
        mon: d.name,
        ma: d.code,
        oPhanTich: d.quadrant,
        soBan: d.qty,
        doanhThu: d.revenue,
        giaVonMoiPhan: d.unitCostVnd ?? '',
        dongGopMoiPhan: d.unitContribution,
      }))
    },
  },
  {
    key: 'cost-margin',
    code: 'B4',
    title: 'Giá vốn & lãi gộp',
    to: '/gia-von',
    hint: 'Food cost từng ngày so mục tiêu, lãi gộp theo nhóm món',
    need: 'report.margin-foodcost',
    fetch: async (branch, period) => {
      const r = await api.costMargin(branch, period)
      return r.daily.map((d) => ({
        ngay: d.day,
        doanhThu: d.revenueVnd,
        giaVon: d.cogsVnd,
        foodCost: d.foodCost === null ? '' : d.foodCost,
        vuotMucTieu: d.overTarget === null ? '' : d.overTarget ? 'có' : 'không',
      }))
    },
  },
  {
    key: 'kitchen',
    code: 'B5',
    title: 'Hiệu suất bếp',
    to: '/hieu-suat-bep',
    hint: 'Thời gian gửi→xong theo trạm, tỉ lệ trễ SLA, món hay trễ',
    need: 'report.margin-foodcost',
    fetch: async (branch, period) => {
      const r = await api.kitchenReport(branch, period)
      return r.byStation.map((s) => ({
        tram: s.key,
        soVe: s.total,
        trungBinhGiay: s.avgSeconds,
        chamNhat10PhanTramGiay: s.p90Seconds,
        soVeTre: s.late,
        tiLeTre: s.lateRate ?? '',
      }))
    },
  },
  {
    key: 'turnover',
    code: 'B6',
    title: 'Vòng quay bàn',
    to: '/vong-quay-ban',
    hint: 'Thời gian ngồi, lượt mỗi bàn mỗi ngày, tỉ lệ lấp đầy',
    need: 'report.branch-revenue',
    fetch: async (branch, period) => {
      const r = await api.tableTurnover(branch, period)
      return r.byTable.map((t) => ({
        ban: t.code,
        khu: t.areaName ?? '',
        luot: t.sessions,
        luotMoiNgay: t.turnsPerDay,
        ngoiTrungBinhPhut: t.avgMinutes,
        khach: t.guests,
        doanhThu: t.revenueVnd,
        lapDay: t.occupancy ?? '',
      }))
    },
  },
  {
    key: 'staff',
    code: 'B7',
    title: 'Nhân sự — bán hàng',
    to: '/nhan-su-ban-hang',
    hint: 'Doanh thu theo phục vụ, số huỷ, số lần cần duyệt',
    need: 'report.branch-revenue',
    fetch: async (branch, period) => {
      const r = await api.staffReport(branch, period)
      return r.rows.map((s) => ({
        nhanVien: s.fullName,
        doanhThu: s.revenue.value,
        soDon: s.orders,
        binhQuanMoiDon: s.perOrderVnd,
        soHuy: s.cancels,
        soLanCanDuyet: s.approvalRequests,
      }))
    },
  },
  {
    key: 'sets',
    code: 'B8',
    title: 'Set & giảm giá',
    to: '/set-khuyen-mai',
    hint: 'Food cost set theo lựa chọn thật, tác động của giảm giá',
    need: 'report.margin-foodcost',
    fetch: async (branch, period) => {
      const r = await api.setsReport(branch, period)
      return r.sets.map((s) => ({
        set: s.name,
        soSuat: s.sold,
        doanhThu: s.revenueVnd,
        giaVon: s.cogsVnd,
        laiGop: s.grossVnd,
        foodCost: s.foodCost ?? '',
      }))
    },
  },
  {
    key: 'online',
    code: 'B9',
    title: 'Online & đặt bàn',
    to: '/online-dat-ban',
    hint: 'Đơn online theo giờ, tỉ lệ huỷ, thời gian giao, no-show',
    need: 'report.branch-revenue',
    fetch: async (branch, period) => {
      const r = await api.onlineReport(branch, period)
      return r.online.byHour.map((h) => ({
        khungGio: h.label,
        soDon: h.orders,
        soDonHuy: h.cancelled,
      }))
    },
  },
  {
    key: 'pnl',
    code: 'F7',
    title: 'Lãi / Lỗ',
    to: '/lai-lo',
    hint: 'Doanh thu, giá vốn, nhân sự, chi phí và prime cost',
    need: 'report.pnl-branch-summary',
    fetch: async (branch, period) => {
      const r = await api.profitLoss(branch, period)
      return r.rows.map((row) => ({
        dong: row.label,
        soTien: row.amount ?? '',
        kyDoiChieu: row.baseline ?? '',
        // Dòng chưa có nguồn thì nói ra lý do, không để trống trơn rồi ai đọc cũng đoán
        chuaCoNguon: row.blockedBy ?? '',
      }))
    },
  },
]

export function ReportCenter() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const [period, setPeriod] = useState<PeriodChoice>({ kind: 'thang', compare: 'ky-truoc' })
  const [busy, setBusy] = useState<string | null>(null)

  const visible = REPORTS.filter((r) => can(r.need))

  const exportCsv = async (report: ReportDef) => {
    setBusy(report.key)
    try {
      const rows = await report.fetch(branchId!, period)
      if (rows.length === 0) {
        toast('Kỳ này không có dòng nào để xuất', 'warn')
        return
      }
      download(`${report.code}-${branchId}-${period.kind}.csv`, toCsv(rows))
      toast(`Đã xuất ${rows.length} dòng`, 'ok')
    } catch (err) {
      toast((err as Error).message, 'danger')
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <PageHeader
        title="Trung tâm báo cáo"
        subtitle="Chọn kỳ một lần rồi xuất bất kỳ báo cáo nào của kỳ đó. Mọi tệp xuất ra dùng đúng kỳ đang chọn ở đây."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <PeriodComparator value={period} onChange={setPeriod} />

        <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="grid grid-cols-[80px_1fr_140px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Mã</span>
            <span>Báo cáo</span>
            <span />
          </div>

          {visible.map((report) => (
            <div
              key={report.key}
              className="grid grid-cols-[80px_1fr_140px] items-center gap-3 border-b border-line-1 px-5 py-3 last:border-b-0"
            >
              <span className="font-mono text-[length:var(--fs-b2)] text-ink-mute">{report.code}</span>
              <span className="min-w-0">
                <Link
                  to={report.to}
                  className="block truncate text-[length:var(--fs-b2)] text-ink-hi hover:text-accent-ink"
                >
                  {report.title}
                </Link>
                <span className="mt-0.5 block truncate text-[length:var(--fs-c1)] text-ink-mute">
                  {report.hint}
                </span>
              </span>
              <span className="flex justify-end">
                <Button
                  disabled={busy !== null || !branchId}
                  onClick={() => void exportCsv(report)}
                >
                  {busy === report.key ? 'Đang lấy…' : 'Xuất CSV'}
                </Button>
              </span>
            </div>
          ))}
        </div>

        <section className="mt-5 rounded-md border border-line-3 bg-surface-1 p-6">
          <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
            Chưa có trong bản dựng này
          </h2>
          <ul className="mt-3 flex max-w-[820px] flex-col gap-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            <li>
              <span className="text-ink-body">Đặt lịch gửi email.</span> Cần máy chủ gửi thư và một
              bộ hẹn giờ chạy nền — hệ thống chưa có cả hai. Dựng màn khai lịch trong khi không có
              gì gửi thư đi là dựng một tính năng chết.
            </li>
            <li>
              <span className="text-ink-body">Xuất PDF.</span> Đúng bố cục thì cần một bộ dựng
              trang; còn bản "vừa đủ đọc" thì trình duyệt đã in được từ chính màn báo cáo bằng
              Ctrl+P.
            </li>
            <li>
              <span className="text-ink-body">So sánh liên chi nhánh.</span> §4.2 có dòng riêng
              (`report.compare-branches`, R8 · R11 · R10) và §25 mô tả chế độ small-multiples — chưa
              dựng, mọi màn hiện tại đọc đúng một chi nhánh.
            </li>
          </ul>
        </section>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Kỳ đang chọn: {period.kind === 'tuy-chon' && period.from && period.to
            ? formatRange({ from: period.from, to: period.to })
            : 'theo bộ chọn ở trên'}. Tệp CSV mở thẳng bằng Excel, dấu phân cách là dấu phẩy và mã
          hoá UTF-8 có BOM để Excel không hỏng dấu tiếng Việt.
        </p>
      </div>
    </>
  )
}

/**
 * Trải mảng đối tượng thành CSV.
 *
 * Bọc mọi ô trong dấu nháy kép và nhân đôi nháy bên trong: tên món có dấu phẩy
 * ("Bò cuộn nấm, hành") sẽ tự tách thành hai cột nếu không bọc, và cả bảng lệch
 * từ dòng đó trở đi mà không ai để ý cho tới lúc cộng sai.
 */
function toCsv(rows: Record<string, unknown>[]): string {
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))]
  const cell = (value: unknown) => `"${String(value ?? '').replaceAll('"', '""')}"`
  return [
    columns.map(cell).join(','),
    ...rows.map((row) => columns.map((c) => cell(row[c])).join(',')),
  ].join('\r\n')
}

/**
 * BOM đứng đầu tệp — thiếu nó là Excel đọc UTF-8 thành ANSI và hỏng hết dấu.
 *
 * Dựng bằng `String.fromCharCode` chứ không dán ký tự thật vào chuỗi: một ký tự
 * vô hình nằm giữa mã nguồn là thứ không ai đọc ra khi nó bị xoá nhầm.
 */
const BOM = String.fromCharCode(0xfeff)

function download(filename: string, content: string) {
  const blob = new Blob([BOM + content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}
