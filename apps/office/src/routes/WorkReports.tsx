import {
  REPORT_CADENCE_LABELS,
  REPORT_REVIEW_MODE_LABELS,
  type ReportSlot,
  type ReportTemplateView,
  type WorkReportRow,
} from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router'
import { api } from '../api'
import { DataTable, type Column } from '../components/DataTable'
import { Field, FilterBar, SegmentedControl, Select } from '../components/form'
import { PageHeader } from '../components/PageHeader'
import { ReportDrawer } from '../components/reports/ReportDrawer'
import { ReportStateBadge, slotTitle } from '../components/reports/report-ui'
import { ReportTemplateDrawer } from '../components/reports/ReportTemplateDrawer'
import { formatDateTime } from '../components/tasks/task-ui'
import { useSession } from '../session-context'

/**
 * N7 — Báo cáo công việc.
 *
 * Bốn cửa: báo cáo CẦN TÔI XEM (đã nộp, chờ chính tôi xác nhận), suất CÒN THIẾU
 * (quá hạn mà chưa ai nộp — tính lúc đọc, không ai phải đánh dấu), TẤT CẢ trong
 * phạm vi, và MẪU (trường, lịch nộp, ghế nộp — quản lý chuỗi, chủ cấu hình).
 */

type Tab = 'can-xem' | 'con-thieu' | 'tat-ca' | 'mau'

export function WorkReports() {
  const { branchId: sessionBranch, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'can-xem'
  const [branch, setBranch] = useState(sessionBranch ?? '')
  const [openId, setOpenId] = useState<number | null>(null)
  const [editing, setEditing] = useState<ReportTemplateView | 'new' | null>(null)
  const mayConfigure = can('workreport.configure')

  const chart = useQuery({ queryKey: ['org', 'chart'], queryFn: () => api.orgChart() })
  const branchUnits = useMemo(
    () => (chart.data?.units ?? []).filter((u) => u.kind === 'chi-nhanh' && u.branchId),
    [chart.data],
  )
  const reports = useQuery({
    queryKey: ['work-reports', tab, branch],
    queryFn: () => api.workReports({ view: tab === 'can-xem' ? 'can-xem' : 'tat-ca', branch }),
    enabled: tab === 'can-xem' || tab === 'tat-ca',
  })
  const missing = useQuery({
    queryKey: ['report-slots', 'missing', branch],
    queryFn: () => api.missingReports(branch || undefined),
    enabled: tab === 'con-thieu',
  })
  const templates = useQuery({
    queryKey: ['report-templates', branch],
    queryFn: () => api.reportTemplates(branch || undefined),
    enabled: tab === 'mau',
  })

  const standard = useMutation({
    mutationFn: () => api.applyStandardReports(branch),
    onSuccess: (r) => {
      const parts = [
        r.created > 0 ? `Đã tạo ${r.created} mẫu` : 'Ba mẫu chuẩn đã có đủ',
        r.withoutShifts
          ? 'chi nhánh chưa có ca mẫu nên sổ giao ca và báo cáo ca bếp thành báo cáo ngày'
          : '',
        r.skipped.length > 0
          ? `bỏ qua: ${r.skipped.map((s) => `${s.name} (${s.reason})`).join('; ')}`
          : '',
      ].filter(Boolean)
      toast(parts.join(' — '), r.skipped.length > 0 ? 'warn' : 'ok')
      void queryClient.invalidateQueries({ queryKey: ['report-templates'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const reportColumns: Column<WorkReportRow>[] = [
    {
      key: 'name',
      header: 'Báo cáo',
      width: 'minmax(240px, 2fr)',
      cell: (r) => (
        <span className="truncate font-medium text-ink-hi">
          {slotTitle({
            templateName: r.templateName,
            shiftLabel: r.shiftLabel,
            businessDate: r.businessDate,
          })}
        </span>
      ),
    },
    { key: 'author', header: 'Người nộp', width: '160px', cell: (r) => r.authorName },
    {
      key: 'submitted',
      header: 'Nộp lúc',
      width: '170px',
      cell: (r) =>
        r.submittedAt ? (
          <span className={r.onTime ? 'text-ink-body' : 'font-semibold text-danger-line'}>
            {formatDateTime(r.submittedAt)}
            {r.onTime ? '' : ' · trễ'}
          </span>
        ) : (
          <span className="text-ink-mute">—</span>
        ),
    },
    {
      key: 'channel',
      header: 'Nơi nộp',
      width: '110px',
      cell: (r) =>
        r.channel === 'kenh-nv' ? 'Điện thoại' : r.channel === 'office' ? 'Office' : '—',
    },
    {
      key: 'addenda',
      header: 'Bổ sung',
      width: '90px',
      numeric: true,
      cell: (r) => (r.addendaCount > 0 ? r.addendaCount : '—'),
    },
    {
      key: 'state',
      header: 'Trạng thái',
      width: '130px',
      cell: (r) => <ReportStateBadge state={r.state} />,
    },
  ]

  const missingColumns: Column<ReportSlot>[] = [
    {
      key: 'name',
      header: 'Suất báo cáo',
      width: 'minmax(260px, 2fr)',
      cell: (s) => <span className="truncate font-medium text-ink-hi">{slotTitle(s)}</span>,
    },
    { key: 'branch', header: 'Chi nhánh', width: '120px', cell: (s) => s.branchId },
    {
      key: 'due',
      header: 'Hạn',
      width: '170px',
      cell: (s) => (
        <span className="font-semibold text-danger-line">{formatDateTime(s.dueAt)} · quá hạn</span>
      ),
    },
    {
      key: 'state',
      header: 'Tình trạng',
      width: '140px',
      cell: (s) =>
        s.state === 'draft' ? (
          <Badge tone="warn">Có nháp, chưa nộp</Badge>
        ) : (
          <Badge tone="danger">Chưa ai mở</Badge>
        ),
    },
  ]

  const templateColumns: Column<ReportTemplateView>[] = [
    {
      key: 'name',
      header: 'Mẫu',
      width: 'minmax(200px, 2fr)',
      cell: (t) => <span className="truncate font-medium text-ink-hi">{t.name}</span>,
    },
    {
      key: 'cadence',
      header: 'Nộp',
      width: '110px',
      cell: (t) => REPORT_CADENCE_LABELS[t.cadence],
    },
    {
      key: 'seats',
      header: 'Ghế nộp',
      width: 'minmax(180px, 1fr)',
      cell: (t) => <span className="truncate">{t.positions.map((p) => p.title).join(', ')}</span>,
    },
    {
      key: 'review',
      header: 'Xác nhận',
      width: '150px',
      cell: (t) => REPORT_REVIEW_MODE_LABELS[t.reviewMode],
    },
    {
      key: 'phone',
      header: 'Điện thoại',
      width: '110px',
      cell: (t) => (t.kenhNv ? 'Nộp được' : <span className="text-ink-mute">Chỉ Office</span>),
    },
    {
      key: 'active',
      header: 'Trạng thái',
      width: '120px',
      cell: (t) =>
        t.active ? <Badge tone="ok">Đang dùng</Badge> : <Badge tone="neutral">Đã tắt</Badge>,
    },
  ]

  const failed = tab === 'con-thieu' ? missing : tab === 'mau' ? templates : reports

  return (
    <>
      <PageHeader
        title="Báo cáo công việc"
        subtitle="Báo cáo cuối ngày, sổ giao ca, báo cáo ca bếp. Số tự điền đóng băng lúc nộp; bản đã nộp không sửa, chỉ viết bổ sung."
        action={
          tab === 'mau' && mayConfigure ? (
            <>
              <Button disabled={!branch || standard.isPending} onClick={() => standard.mutate()}>
                Dùng bộ mẫu chuẩn
              </Button>
              <Button variant="primary" disabled={!branch} onClick={() => setEditing('new')}>
                Thêm mẫu
              </Button>
            </>
          ) : undefined
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="mt-5">
          <SegmentedControl
            size="md"
            value={tab}
            onChange={(next) => setParams({ tab: next })}
            options={[
              { value: 'can-xem', label: 'Cần tôi xem' },
              { value: 'con-thieu', label: 'Còn thiếu' },
              { value: 'tat-ca', label: 'Tất cả' },
              { value: 'mau', label: 'Mẫu' },
            ]}
          />
        </div>
        <div className="mt-5">
          <FilterBar>
            <Field label="Chi nhánh">
              <Select
                value={branch}
                width={220}
                placeholder="Mọi chi nhánh trong phạm vi"
                options={branchUnits.map((u) => ({ value: u.branchId!, label: u.name }))}
                onChange={setBranch}
              />
            </Field>
          </FilterBar>
        </div>

        {failed.isError ? (
          <div className="mt-5">
            <ErrorState
              message={(failed.error as Error).message}
              action={<Button onClick={() => void failed.refetch()}>Thử lại</Button>}
            />
          </div>
        ) : null}

        <div className="mt-5">
          {tab === 'con-thieu' ? (
            <DataTable
              columns={missingColumns}
              rows={missing.data ?? []}
              rowKey={(s) => `${s.templateId}|${s.periodKey}|${s.shiftTemplateId ?? 0}`}
              loading={missing.isPending}
              empty="Không có báo cáo nào quá hạn mà chưa nộp."
            />
          ) : tab === 'mau' ? (
            <DataTable
              columns={templateColumns}
              rows={templates.data ?? []}
              rowKey={(t) => t.id}
              loading={templates.isPending}
              empty="Chi nhánh chưa có mẫu báo cáo — bấm “Dùng bộ mẫu chuẩn”."
              onRowClick={mayConfigure ? (t) => setEditing(t) : undefined}
            />
          ) : (
            <DataTable
              columns={reportColumns}
              rows={reports.data ?? []}
              rowKey={(r) => r.id}
              loading={reports.isPending}
              empty={
                tab === 'can-xem'
                  ? 'Không có báo cáo nào chờ bạn xem.'
                  : 'Chưa có báo cáo nào trong khoảng này.'
              }
              onRowClick={(r) => setOpenId(r.id)}
            />
          )}
        </div>
      </div>

      <ReportDrawer reportId={openId} mode="review" onClose={() => setOpenId(null)} />
      {editing ? (
        <ReportTemplateDrawer
          template={editing === 'new' ? null : editing}
          branchId={editing === 'new' ? branch : editing.branchId}
          chart={chart.data}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </>
  )
}
