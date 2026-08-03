import { ApiError } from '@sora/core'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type ParameterRow } from '../api'
import { ConfigBranchPicker, useConfigBranch } from '../components/config-branch'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

/** Nhóm tham số theo tiền tố khoá — cùng cách người vận hành nghĩ về chúng */
const GROUP_LABEL: Record<string, string> = {
  sales: 'Bán hàng & thuế',
  kitchen: 'Bếp',
  auth: 'Đăng nhập & thiết bị',
  online: 'Kênh online',
  reservation: 'Đặt bàn',
  site: 'Website',
  payroll: 'Lương & chấm công',
  expense: 'Chi phí',
  stock: 'Kho',
  einvoice: 'Hoá đơn điện tử',
  loyalty: 'Tích điểm',
  corporate: 'Công nợ doanh nghiệp',
  feedback: 'Phản hồi khách',
  report: 'Báo cáo',
}

/**
 * Chú thích cho từng tham số.
 *
 * Tên khoá nói được "cái gì" nhưng không nói được "đổi nó thì cái gì lệch theo".
 * Một dòng `payroll.otRestRate` không tự nói ra rằng hệ số ngày nghỉ áp cho TOÀN
 * BỘ giờ chứ không chỉ phần vượt — và đó đúng là chỗ người ta sửa nhầm.
 */
const NOTE: Record<string, string> = {
  'sales.vatRate': 'Đổi số này là đổi tiền trên mọi hoá đơn — kiểm với kế toán trước.',
  'sales.serviceFeeRate':
    'Phí phục vụ, CHỈ cộng vào bill ăn tại chỗ. Mang về và giao hàng không thu.',
  'sales.roundingUnit':
    'Làm tròn tổng bill tới bội số này. 1000 là quán không phải trả lại tiền lẻ.',

  'kitchen.slaSeconds':
    'Thời gian chuẩn dùng cho món CHƯA khai thời gian riêng. Trạm nào có dòng riêng bên dưới thì lấy dòng đó trước.',
  'kitchen.undoSeconds':
    'Bấm Xong xong, vé còn nán lại K2 ngần này giây để bếp kịp bấm Hoàn tác. Hết giờ là chốt — hoàn tác KHÔNG hoàn kho.',
  'kitchen.grillServiceExtraSeconds':
    'Món nướng cộng thêm ngần này giây so với thời gian chế biến — phục vụ tại bàn nướng chậm hơn bếp.',
  'kitchen.packBufferSeconds':
    'Đệm đóng gói đơn mang về: vé vào bếp sớm hơn giờ hẹn ngần này giây.',
  'kitchen.deliveryBufferSeconds': 'Đệm cho đơn giao — dài hơn đóng gói vì còn quãng đường ship.',

  'auth.pinMaxAttemptsPerMinute': 'Nhập sai PIN quá số lần này trong một phút thì máy bị khoá.',
  'auth.pinLockoutMinutes': 'Khoá bao lâu sau khi vượt ngưỡng nhập sai ở trên.',
  'auth.pairingCodeTtlMinutes': 'Mã ghép thiết bị hết hạn sau ngần này phút kể từ lúc sinh.',
  'auth.staffSessionHours': 'Phiên của nhân viên sống bao lâu trước khi phải nhập PIN lại.',

  'online.openMinute': 'Giờ mở nhận đơn online, tính bằng phút từ 00:00 — 600 nghĩa là 10:00.',
  'online.lastOrderMinute': 'Đơn khách tự tới lấy chốt lúc này — 1260 nghĩa là 21:00.',
  'online.lastOrderMinuteDelivery':
    'Đơn giao chốt sớm hơn để chuyến ship cuối kịp về trước giờ đóng.',
  'online.leadMinutes': 'Bếp cần tối thiểu ngần này phút kể từ lúc khách bấm đặt.',
  'online.slotCapacity': 'Trần đơn mỗi khung 15 phút — thứ che bếp khỏi giờ cao điểm.',

  'reservation.softHoldMinutes': 'Giữ suất trong lúc khách điền tên ở bước 3 của W6.',
  'reservation.tableHoldMinutes': 'Giữ bàn sau giờ hẹn trước khi được đánh no-show.',
  'reservation.slotStepMinutes': 'Bước lưới giờ ở W6 — để 30 thì khách chỉ chọn được :00 và :30.',
  'reservation.mealMinutesSmall': 'Thời lượng bữa của nhóm tới 3 khách.',
  'reservation.mealMinutesLarge': 'Thời lượng bữa của nhóm từ 4 khách.',
  'reservation.turnBufferMinutes': 'Đệm dọn bàn giữa hai lượt khách.',
  'reservation.leadMinutes':
    'Khách phải đặt trước ít nhất ngần này phút; sát giờ hơn thì phải gọi điện.',
  'reservation.horizonDays': 'Tầm nhận đặt — xa hơn ngần này ngày thì lưới W6 không mở.',
  'reservation.maxGuestsOnline': 'Nhóm đông hơn số này không đặt online được, phải gọi điện.',
  'reservation.autoConfirm':
    'Bật: khách đặt xong xác nhận ngay. Tắt: mọi suất nằm chờ người trực duyệt tay.',
  'reservation.remindAheadHours': 'Cữ nhắc hẹn thứ nhất — trước giờ hẹn ngần này tiếng.',
  'reservation.remindSoonHours': 'Cữ nhắc hẹn thứ hai, sát giờ.',
  'reservation.slotCapStandard':
    'Trần suất mỗi khung cho bàn thường. Để 0 là không đặt trần — chặn theo số bàn thật.',
  'reservation.slotCapGrill': 'Trần suất mỗi khung cho bàn nướng. Để 0 là không đặt trần.',
  'reservation.slotCapPrivate': 'Trần suất mỗi khung cho phòng riêng. Để 0 là không đặt trần.',
  'reservation.depositStandardVnd':
    'Cọc bàn thường. Để 0 là không thu; khác 0 thì suất nằm chờ tới lúc thu được cọc.',
  'reservation.depositGrillVnd': 'Cọc bàn nướng. Để 0 là không thu.',
  'reservation.depositPrivateVnd': 'Cọc phòng riêng. Để 0 là không thu.',

  'site.publicUrl':
    'Gốc liên kết trong tin nhắn gửi khách — máy POS không tự biết tên miền của quán.',

  'payroll.standardDailyMinutes': 'Quá mức này ở ngày thường mới tính tăng ca — 480 là 8 tiếng.',
  'payroll.standardMonthlyMinutes': 'Dùng để quy lương tháng ra đơn giá giờ khi tính tăng ca.',
  'payroll.lateGraceMinutes':
    'Chấm 15:02 cho ca 15:00 chưa tính muộn. Chỉ đổi nhãn ở bảng H3, không đụng tới tiền.',
  'payroll.otNormalRate': 'Hệ số tăng ca ngày thường — chỉ áp cho phần vượt giờ chuẩn.',
  'payroll.otRestRate': 'Ngày nghỉ tuần — áp cho TOÀN BỘ giờ, kể cả giờ đầu tiên.',
  'payroll.otHolidayRate': 'Ngày lễ — áp cho TOÀN BỘ giờ, kể cả giờ đầu tiên.',
  'payroll.insuranceEmployeeRate':
    'BHXH 8% + BHYT 1,5% + BHTN 1% phần người lao động. Tính trên LƯƠNG CƠ BẢN, không trên tổng thu nhập.',
  'payroll.pitWithholdRate':
    'Để 0 là CHƯA CẤU HÌNH, không phải miễn thuế — biểu luỹ tiến chưa cài, kế toán phải tự tính ngoài.',

  'expense.pettyCashVnd': 'Từ mức này trở xuống quản lý chi nhánh tự ghi, không cần ai duyệt.',
  'expense.ownerApprovalVnd':
    'Từ mức này trở lên phải chủ chuỗi duyệt. Khoảng giữa là kế toán duyệt.',
  'expense.assetThresholdVnd':
    'Mua thiết bị từ mức này trở lên ghi thành TÀI SẢN để khấu hao, không vào chi phí trong kỳ.',

  'stock.consumptionWindowDays':
    'Nhìn lại ngần này ngày để tính mức tiêu thụ trung bình khi gợi ý đặt hàng.',
  'stock.reorderCoverDays': 'Gợi ý đặt đủ dùng cho ngần này ngày tới.',
  'stock.expiryWarnDays': 'Còn ngần này ngày nữa là tới hạn thì S9 báo động.',

  'einvoice.taxCode': 'Mã số thuế của CHUỖI — một mã dùng chung cho cả ba chi nhánh.',
  'einvoice.provider': 'Nhà cung cấp dịch vụ hoá đơn điện tử đã ký hợp đồng.',
  'einvoice.certificateSerial': 'Serial chứng thư số đang dùng để ký hoá đơn.',
  'einvoice.certificateExpiry':
    'Chứng thư hết hạn là mọi hoá đơn rơi vào hàng đợi lỗi F3 — theo dõi ngày này.',
  'einvoice.enabled':
    'Chỉ bật khi bốn ô trên đã khai đủ. Bật sớm là mỗi bill rơi vào hàng đợi lỗi.',
  'einvoice.serial':
    'Ký hiệu hoá đơn RIÊNG từng địa điểm kinh doanh — không chi nhánh nào dùng chung.',

  'loyalty.vndPerPoint': 'Khách tiêu ngần này đồng thì được 1 điểm.',
  'loyalty.vndPerPointRedeem': '1 điểm đổi được ngần này đồng khi trừ vào bill.',
  'loyalty.redeemCapVndPerOrder': 'Trần tiền điểm được trừ trên một bill.',
  'loyalty.expiryMonths': 'Điểm không dùng tới sẽ hết hạn sau ngần này tháng.',
  'loyalty.tierSilverVnd':
    'Chi tiêu 12 tháng TRƯỢT đạt mức này thì lên hạng Bạc. Dưới ngưỡng là Đồng.',
  'loyalty.tierGoldVnd': 'Ngưỡng hạng Vàng, cũng xét theo chi tiêu 12 tháng trượt.',

  'corporate.defaultCreditLimitVnd':
    'Hạn mức nợ gán cho khách doanh nghiệp mới — từng khách sửa riêng được.',
  'corporate.blockAfterOverdueDays': 'Quá hạn ngần này ngày thì khoá, không cho ghi nợ thêm.',
  'corporate.einvoiceMode':
    'per-bill là xuất hoá đơn từng bill; aggregate là gộp một hoá đơn cuối kỳ.',

  'feedback.complaintStars':
    'Từ mấy sao trở XUỐNG thì một lượt đánh giá thành khiếu nại phải có người xử lý.',
  'feedback.responseHours': 'Hạn trả lời một khiếu nại trước khi B13 đánh dấu trễ.',

  'report.foodCostTarget':
    'Mốc food cost để màn giá vốn & lãi gộp so vào — mục tiêu, không phải số sổ.',
}

/**
 * A6 — Trung tâm tham số.
 *
 * "Một nơi cho mọi thông số lưu động của hệ thống" (§29.1). Mỗi dòng nói rõ con
 * số engine ĐANG đọc và nó đến từ đâu: mặc định cấp chuỗi hay ghi đè của chi
 * nhánh này. Hai thứ đó khác nhau, và sửa nhầm cấp là đổi luôn cho cả ba chi
 * nhánh mà không ai để ý.
 */
export function Parameters() {
  const { can } = useSession()
  const { branchId } = useConfigBranch()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [historyKey, setHistoryKey] = useState<string | null>(null)
  const mayEdit = can('admin.manage-accounts-roles')

  const rows = useQuery({
    queryKey: ['parameters', branchId],
    queryFn: () => api.parameters(branchId!),
    enabled: Boolean(branchId),
  })

  const save = useMutation({
    mutationFn: (input: { key: string; value: unknown; scope: 'chain' | 'branch' }) =>
      api.setParameter(input.key, input.value, input.scope === 'branch' ? branchId! : null),
    onSuccess: (_r, input) => {
      toast(`Đã lưu ${input.key}`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['parameters'] })
    },
    onError: (err: Error) =>
      toast(err instanceof ApiError ? err.message : 'Không lưu được', 'danger'),
  })

  const clear = useMutation({
    mutationFn: (key: string) => api.clearParameterOverride(key, branchId!),
    onSuccess: () => {
      toast('Đã bỏ ghi đè — chi nhánh quay về mặc định của chuỗi', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['parameters'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const filtered = (rows.data ?? []).filter((row) =>
    query.trim() === '' ? true : row.key.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const groups = [...new Set(filtered.map((row) => row.key.split('.')[0]!))]

  return (
    <>
      <PageHeader
        title="Trung tâm tham số"
        subtitle="Mọi con số điều khiển hệ thống nằm ở đây. Engine đọc lúc chạy — sửa xong là có hiệu lực ngay, không cần triển khai lại. Cột phạm vi và nút ghi đè áp theo chi nhánh đang cấu hình."
        action={<ConfigBranchPicker />}
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tham số theo tên khoá"
          className="mb-5 h-11 w-full max-w-[420px] rounded-sm border border-line-1 bg-surface-1 px-3.5 text-[length:var(--fs-b2)] text-ink-hi"
        />

        {rows.isPending ? (
          <p className="text-ink-mute">Đang tải tham số…</p>
        ) : (
          groups.map((group) => (
            <section
              key={group}
              className="mb-4 overflow-hidden rounded-md border border-line-1 bg-surface-1"
            >
              <header className="border-b border-line-1 bg-canvas px-5 py-3.5">
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-accent uppercase">
                  {GROUP_LABEL[group] ?? group}
                </p>
              </header>
              {filtered
                .filter((row) => row.key.startsWith(`${group}.`))
                .map((row) => (
                  <ParameterLine
                    /* Khoá kèm chi nhánh: draft trong dòng không tự đồng bộ khi
                       dữ liệu đổi — đổi chi nhánh phải remount để ô không giữ
                       số đang gõ dở cho chi nhánh cũ. */
                    key={`${branchId}:${row.key}`}
                    row={row}
                    disabled={!mayEdit || save.isPending}
                    onSave={(value, scope) => save.mutate({ key: row.key, value, scope })}
                    onClear={() => clear.mutate(row.key)}
                    onHistory={() => setHistoryKey(row.key)}
                  />
                ))}
            </section>
          ))
        )}
      </div>

      {historyKey ? (
        <HistoryDrawer paramKey={historyKey} onClose={() => setHistoryKey(null)} />
      ) : null}
    </>
  )
}

function ParameterLine({
  row,
  disabled,
  onSave,
  onClear,
  onHistory,
}: {
  row: ParameterRow
  disabled: boolean
  onSave: (value: unknown, scope: 'chain' | 'branch') => void
  onClear: () => void
  onHistory: () => void
}) {
  const [draft, setDraft] = useState(String(row.effectiveValue))
  const isBoolean = typeof row.chainValue === 'boolean'
  const isNumber = typeof row.chainValue === 'number'
  const dirty = draft !== String(row.effectiveValue)

  const parse = (): unknown => (isNumber ? Number(draft) : draft)

  return (
    <div className="grid items-center gap-4 border-b border-line-1 px-5 py-2.5 lg:grid-cols-[1fr_200px_150px_140px_auto]">
      <div className="min-w-0">
        <p className="font-mono text-[length:var(--fs-b2)] text-ink-hi">{row.key}</p>
        {NOTE[row.key] ? (
          <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">{NOTE[row.key]}</p>
        ) : null}
      </div>

      {isBoolean ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSave(!row.effectiveValue, row.scope)}
          className={`h-10 rounded-sm border px-3 text-[length:var(--fs-b2)] ${
            row.effectiveValue ? 'border-ok text-ok' : 'border-line-3 text-ink-mute'
          }`}
        >
          {row.effectiveValue ? 'Đang bật' : 'Đang tắt'}
        </button>
      ) : (
        <input
          value={draft}
          disabled={disabled}
          inputMode={isNumber ? 'numeric' : 'text'}
          onChange={(e) => setDraft(e.target.value)}
          className="h-10 rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
        />
      )}

      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-6 items-center rounded-sm px-2 text-[length:var(--fs-c2)] ${
            row.scope === 'branch' ? 'bg-accent/15 text-accent' : 'bg-surface-3 text-ink-mute'
          }`}
        >
          {row.scope === 'branch' ? 'Riêng chi nhánh' : 'Toàn chuỗi'}
        </span>
        {row.unit ? (
          <span className="text-[length:var(--fs-c1)] text-ink-mute">{row.unit}</span>
        ) : null}
      </div>

      <span className="text-[length:var(--fs-c1)] text-ink-mute">{row.updatedBy ?? '—'}</span>

      <div className="flex items-center gap-2">
        {dirty && !isBoolean ? (
          <>
            <Button variant="primary" disabled={disabled} onClick={() => onSave(parse(), 'chain')}>
              Lưu cho chuỗi
            </Button>
            <Button disabled={disabled} onClick={() => onSave(parse(), 'branch')}>
              Chỉ chi nhánh này
            </Button>
          </>
        ) : null}
        {!dirty && row.scope === 'branch' ? (
          <Button disabled={disabled} onClick={onClear}>
            Bỏ ghi đè
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onHistory}
          aria-label="Lịch sử đổi"
          className="grid size-10 place-items-center rounded-sm border border-line-1 text-ink-mute"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
          >
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function HistoryDrawer({ paramKey, onClose }: { paramKey: string; onClose: () => void }) {
  const history = useQuery({
    queryKey: ['parameter-history', paramKey],
    queryFn: () => api.parameterHistory(paramKey),
  })

  return (
    <div className="fixed inset-0 z-100 flex justify-end bg-canvas/60" onClick={onClose}>
      <aside
        className="flex h-full w-[420px] flex-col border-l border-line-1 bg-surface-1"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex-none border-b border-line-1 p-5">
          <p className="font-mono text-[length:var(--fs-b2)] text-ink-hi">{paramKey}</p>
          <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
            Sổ đổi tham số — ai đổi, từ số nào sang số nào.
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {history.isPending ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : (history.data ?? []).length === 0 ? (
            <p className="text-[length:var(--fs-b2)] text-ink-mute">
              Chưa ai đổi tham số này — giá trị hiện tại là giá trị lúc cài đặt.
            </p>
          ) : (
            <ol className="grid gap-3">
              {history.data!.map((change, i) => (
                <li key={i} className="rounded-sm border border-line-1 p-3">
                  <p className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
                    {String(change.oldValue)} → {String(change.newValue)}
                  </p>
                  <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
                    {change.changedBy ?? 'hệ thống'} ·{' '}
                    {new Date(change.changedAt).toLocaleString('vi-VN')} ·{' '}
                    {change.branchId ? `chi nhánh ${change.branchId}` : 'toàn chuỗi'}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
        <footer className="flex-none border-t border-line-1 p-4">
          <Button block onClick={onClose}>
            Đóng
          </Button>
        </footer>
      </aside>
    </div>
  )
}
