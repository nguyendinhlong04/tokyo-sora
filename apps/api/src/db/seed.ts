/**
 * Nạp dữ liệu nền từ prototype vào CSDL:  pnpm --filter @sora/api db:seed
 *
 * Idempotent — chạy lại không nhân bản, chỉ cập nhật. Nguồn là các file JSON do
 * `pnpm extract-seed` sinh ra từ designs/*.dc.html.
 */
import 'dotenv/config'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Pool } from 'pg'
import { createDb, type Db } from './client'
import { PREP_SECONDS_BY_STATION, routingForSeedDish } from './seed-routing'
import { DISH_STORIES } from './seed-stories'
import * as s from './schema'

const SEED_DIR = join(__dirname, '..', '..', '..', '..', 'scripts', 'extract-seed', 'out')

const readJson = async <T>(name: string): Promise<T> =>
  JSON.parse(await readFile(join(SEED_DIR, name), 'utf8')) as T

/** Trạm bếp — tên và thuộc tính hiển thị lấy từ prototype KDS (bản hi-fi cuối) */
const STATIONS = [
  { id: 'ST-01', name: 'Khai vị lạnh', kanji: '鮮', color: '#4E7FA8', ticketPrefix: 'D', columns: 5, sort: 1 },
  { id: 'ST-02', name: 'Quầy sống', kanji: '生', color: '#C2BCAE', ticketPrefix: 'B', columns: 6, sort: 2 },
  { id: 'ST-03', name: 'Chiên xào hấp', kanji: '揚', color: '#D08A1C', ticketPrefix: 'E', columns: 5, sort: 3 },
  { id: 'ST-04', name: 'Lẩu cơm mì', kanji: '鍋', color: '#4A8F63', ticketPrefix: 'C', columns: 5, sort: 4 },
  { id: 'ST-05', name: 'Quầy đồ uống', kanji: '酒', color: '#C9A85C', ticketPrefix: 'F', columns: 5, sort: 5 },
  { id: 'ST-06', name: 'Bếp nướng', kanji: '焼', color: '#D9721F', ticketPrefix: 'A', columns: 4, sort: 6 },
]

/** Tham số khởi điểm cho Trung tâm tham số A6 (§29.1) */
const PARAMETERS: {
  key: string
  value: unknown
  unit?: string
  sensitive?: boolean
}[] = [
  { key: 'sales.vatRate', value: 0, unit: 'tỉ lệ', sensitive: true },
  { key: 'sales.serviceFeeRate', value: 0, unit: 'tỉ lệ', sensitive: true },
  { key: 'sales.roundingUnit', value: 1000, unit: 'đồng' },
  /**
   * Thời gian chuẩn khi MÓN chưa khai của riêng nó (§29.1 "Bếp & SLA: thời gian
   * chuẩn mặc định theo trạm"). Khoá gốc là mức của cả chuỗi, sáu khoá theo trạm
   * bên dưới ghi đè cho từng bếp — số lấy giữa khoảng §16.
   *
   * Để 720 (mức trạm nướng, lâu nhất) ở khoá gốc là cố ý: một trạm mới chưa khai
   * mà lấy nhầm mức nhanh thì mọi vé của nó đỏ ngay từ giây đầu.
   */
  { key: 'kitchen.slaSeconds', value: 720, unit: 'giây' },
  // Suy thẳng từ bảng §16 mà seeder dùng để khai thời gian cho từng món — chép
  // tay sáu con số ra đây là tạo một bản sao sẽ lệch ngay lần đầu ai đó sửa bảng
  ...Object.entries(PREP_SECONDS_BY_STATION).map(([stationId, seconds]) => ({
    key: `kitchen.slaSeconds.${stationId}`,
    value: seconds,
    unit: 'giây',
  })),
  { key: 'kitchen.undoSeconds', value: 30, unit: 'giây' },
  { key: 'kitchen.grillServiceExtraSeconds', value: 480, unit: 'giây' },
  { key: 'kitchen.packBufferSeconds', value: 300, unit: 'giây' },
  { key: 'kitchen.deliveryBufferSeconds', value: 1200, unit: 'giây' },
  { key: 'auth.pinMaxAttemptsPerMinute', value: 5, unit: 'lần', sensitive: true },
  { key: 'auth.pinLockoutMinutes', value: 5, unit: 'phút', sensitive: true },
  { key: 'auth.pairingCodeTtlMinutes', value: 10, unit: 'phút' },
  { key: 'auth.staffSessionHours', value: 12, unit: 'giờ' },
  // Kênh online (§23): giờ nhận đơn, thời gian bếp cần, trần đơn mỗi khung 15 phút
  { key: 'online.openMinute', value: 10 * 60, unit: 'phút từ 00:00' },
  { key: 'online.lastOrderMinute', value: 21 * 60, unit: 'phút từ 00:00' },
  // Chuyến ship cuối phải về trước khi quán đóng nên đơn giao chốt sớm hơn
  { key: 'online.lastOrderMinuteDelivery', value: 20 * 60 + 30, unit: 'phút từ 00:00' },
  { key: 'online.leadMinutes', value: 30, unit: 'phút' },
  { key: 'online.slotCapacity', value: 6, unit: 'đơn' },
  { key: 'reservation.softHoldMinutes', value: 10, unit: 'phút' },
  { key: 'reservation.tableHoldMinutes', value: 15, unit: 'phút' },
  // Lưới đặt bàn W6 (§R3): bước lưới, thời lượng bữa theo nhóm, đệm dọn, tầm nhận đặt
  { key: 'reservation.slotStepMinutes', value: 30, unit: 'phút' },
  { key: 'reservation.mealMinutesSmall', value: 90, unit: 'phút' },
  { key: 'reservation.mealMinutesLarge', value: 120, unit: 'phút' },
  { key: 'reservation.turnBufferMinutes', value: 15, unit: 'phút' },
  { key: 'reservation.leadMinutes', value: 60, unit: 'phút' },
  { key: 'reservation.horizonDays', value: 30, unit: 'ngày' },
  { key: 'reservation.maxGuestsOnline', value: 10, unit: 'khách' },
  { key: 'reservation.autoConfirm', value: true },
  // Hai cữ nhắc hẹn của R4 — đúng con số bản thiết kế: trước một ngày và trước hai tiếng
  { key: 'reservation.remindAheadHours', value: 24, unit: 'giờ' },
  { key: 'reservation.remindSoonHours', value: 2, unit: 'giờ' },
  // Trần suất mỗi khung theo kiểu chỗ (R3) — 0 là không đặt trần, sức chứa là số bàn thật
  { key: 'reservation.slotCapStandard', value: 0, unit: 'suất/khung' },
  { key: 'reservation.slotCapGrill', value: 0, unit: 'suất/khung' },
  { key: 'reservation.slotCapPrivate', value: 0, unit: 'suất/khung' },
  // Tiền cọc theo kiểu chỗ (R3) — 0 là không thu; khác 0 thì suất nằm chờ tới lúc thu được
  { key: 'reservation.depositStandardVnd', value: 0, unit: 'đồng' },
  { key: 'reservation.depositGrillVnd', value: 0, unit: 'đồng' },
  { key: 'reservation.depositPrivateVnd', value: 0, unit: 'đồng' },
  // Gốc liên kết khách bấm — máy POS không tự biết tên miền của website
  { key: 'site.publicUrl', value: 'https://tokyosora.vn' },

  // Nhân sự (§26 H6 — H6 là cửa vào theo ngữ cảnh, giá trị sống ở đây)
  { key: 'payroll.standardDailyMinutes', value: 8 * 60, unit: 'phút' },
  { key: 'payroll.standardMonthlyMinutes', value: 26 * 8 * 60, unit: 'phút' },
  // Châm chước đi muộn: chỉ đổi cách H3 gắn nhãn muộn, KHÔNG đụng tới tiền
  { key: 'payroll.lateGraceMinutes', value: 5, unit: 'phút' },
  // Hệ số theo luật lao động VN — kế toán xác nhận lại trước khi chạy kỳ thật
  { key: 'payroll.otNormalRate', value: 1.5, unit: 'hệ số', sensitive: true },
  { key: 'payroll.otRestRate', value: 2, unit: 'hệ số', sensitive: true },
  { key: 'payroll.otHolidayRate', value: 3, unit: 'hệ số', sensitive: true },
  // BHXH 8% + BHYT 1,5% + BHTN 1% phần người lao động
  { key: 'payroll.insuranceEmployeeRate', value: 0.105, unit: 'tỉ lệ', sensitive: true },
  // 0 = CHƯA CẤU HÌNH, không phải miễn thuế: biểu thuế luỹ tiến chưa cài, kế toán
  // phải đặt tỉ lệ tạm khấu trừ hoặc tự tính ngoài cho tới khi có F4
  { key: 'payroll.pitWithholdRate', value: 0, unit: 'tỉ lệ', sensitive: true },

  // Chi phí (§27 — ba ngưỡng quyết định ai được ghi và ai phải duyệt)
  { key: 'expense.pettyCashVnd', value: 2_000_000, unit: 'đồng', sensitive: true },
  { key: 'expense.ownerApprovalVnd', value: 20_000_000, unit: 'đồng', sensitive: true },
  { key: 'expense.assetThresholdVnd', value: 5_000_000, unit: 'đồng', sensitive: true },

  // Kho (§25 S4 · S9)
  { key: 'stock.consumptionWindowDays', value: 14, unit: 'ngày' },
  { key: 'stock.reorderCoverDays', value: 7, unit: 'ngày' },
  { key: 'stock.expiryWarnDays', value: 3, unit: 'ngày' },

  // Hoá đơn điện tử (§30.2 · màn A9 là cửa vào theo ngữ cảnh của những khoá này).
  // MST và hợp đồng là CỦA CHUỖI — một mã số thuế, một hợp đồng HĐĐT; chỉ ký hiệu
  // mới riêng từng địa điểm kinh doanh, và nó nằm ở vòng lặp cấp chi nhánh bên dưới.
  { key: 'einvoice.taxCode', value: '', unit: 'mã số thuế', sensitive: true },
  { key: 'einvoice.provider', value: '', sensitive: true },
  { key: 'einvoice.certificateSerial', value: '', sensitive: true },
  { key: 'einvoice.certificateExpiry', value: '', unit: 'YYYY-MM-DD', sensitive: true },
  // Mặc định TẮT: bật một cấu hình chưa khai xong là mỗi bill rơi vào hàng đợi lỗi F3
  { key: 'einvoice.enabled', value: false, sensitive: true },

  // Tích điểm (§29.1 nhóm "Tích điểm" — B14 là cửa vào theo ngữ cảnh của đúng
  // những khoá này, cùng cách H6 làm với `payroll.*`). Nhạy cảm vì mỗi khoá ở đây
  // đều là tiền: điểm phát ra là nghĩa vụ của quán với khách.
  { key: 'loyalty.vndPerPoint', value: 10_000, unit: 'đồng / 1 điểm', sensitive: true },
  { key: 'loyalty.vndPerPointRedeem', value: 1_000, unit: 'đồng / 1 điểm', sensitive: true },
  { key: 'loyalty.redeemCapVndPerOrder', value: 100_000, unit: 'đồng', sensitive: true },
  { key: 'loyalty.expiryMonths', value: 12, unit: 'tháng' },
  // Ba hạng: dưới ngưỡng Bạc là Đồng. Xét theo chi tiêu 12 tháng TRƯỢT, không theo năm dương lịch
  { key: 'loyalty.tierSilverVnd', value: 5_000_000, unit: 'đồng / 12 tháng' },
  { key: 'loyalty.tierGoldVnd', value: 20_000_000, unit: 'đồng / 12 tháng' },

  // Công nợ khách doanh nghiệp (§29.1 nhóm "Công nợ DN")
  { key: 'corporate.defaultCreditLimitVnd', value: 20_000_000, unit: 'đồng', sensitive: true },
  { key: 'corporate.blockAfterOverdueDays', value: 15, unit: 'ngày', sensitive: true },
  { key: 'corporate.einvoiceMode', value: 'per-bill', unit: 'per-bill | aggregate' },

  // Phản hồi khách (§25 B13) — từ mấy sao trở xuống thì một lượt đánh giá trở
  // thành khiếu nại phải có người xử lý. Ngưỡng nào cũng là một con số lưu động,
  // nên nó có nhà ở đây chứ không nằm rải trong mã nguồn.
  { key: 'feedback.complaintStars', value: 3, unit: 'sao' },
  { key: 'feedback.responseHours', value: 24, unit: 'giờ' },

  // Báo cáo (§28 F2) — mốc food cost mà màn giá vốn & lãi gộp so vào. Chỉ là
  // MỤC TIÊU để tô màu lệch, không phải một con số kế toán tính ra từ sổ.
  { key: 'report.foodCostTarget', value: 0.35, unit: 'tỉ lệ' },
]

/**
 * Nhà cung cấp S3 và giá thoả thuận.
 *
 * Giá ở đây là MỐC để S5 cảnh báo khi phiếu nhập lệch giá, và để S4 dựng đơn mà
 * không bắt thủ kho nhớ giá. Không có mốc thì hai màn đó không so được với gì.
 *
 * Nguyên liệu thì seeder KHÔNG tạo — chúng được khai tay ở M7, vì định lượng và
 * đơn vị cơ sở là quyết định của bếp chứ không suy được từ bản thiết kế. Nên các
 * dòng `items` dưới đây chỉ gắn được khi mã nguyên liệu đã tồn tại; mã chưa có
 * thì bỏ qua lặng lẽ thay vì làm hỏng cả lượt nạp.
 */
const SUPPLIERS: {
  code: string
  name: string
  taxCode: string | null
  contactName: string | null
  phone: string | null
  paymentTermDays: number
  items: {
    ingredientId: string
    priceVnd: number
    minOrderPurchase: number
    leadTimeDays: number
    preferred: boolean
  }[]
}[] = [
  {
    code: 'NCC-BO',
    name: 'Lò mổ Vissan',
    taxCode: '0301234567',
    contactName: 'Anh Tú',
    phone: '0901234567',
    paymentTermDays: 15,
    items: [
      { ingredientId: 'ba-chi-bo', priceVnd: 285_000, minOrderPurchase: 5, leadTimeDays: 1, preferred: true },
      { ingredientId: 'than-bo', priceVnd: 420_000, minOrderPurchase: 3, leadTimeDays: 1, preferred: true },
    ],
  },
  {
    code: 'NCC-BIA',
    name: 'Nhà phân phối Sapporo',
    taxCode: '0102345678',
    contactName: 'Chị Hà',
    phone: '0912345678',
    paymentTermDays: 30,
    items: [
      { ingredientId: 'keg-sapporo', priceVnd: 1_800_000, minOrderPurchase: 1, leadTimeDays: 3, preferred: true },
    ],
  },
  {
    code: 'NCC-RAU',
    name: 'Chợ đầu mối Long Biên',
    taxCode: null,
    contactName: 'Cô Lan',
    phone: '0923456789',
    paymentTermDays: 0,
    items: [
      { ingredientId: 'hanh-tay', priceVnd: 12_000, minOrderPurchase: 10, leadTimeDays: 1, preferred: true },
    ],
  },
]

/**
 * Máy in A5 mỗi chi nhánh — một máy bill ở quầy, một máy tem ở trạm đóng gói.
 *
 * Địa chỉ 10.0.x.x là dải LAN của quán; cầu in đọc chúng từ bundle cấu hình. Máy
 * tem gắn ST-01 vì đó là trạm ra món lạnh và cũng là nơi đóng gói đơn mang về.
 */
const PRINTERS: { name: string; kind: 'bill' | 'tem'; stationId: string | null; host: string; template: string }[] = [
  { name: 'Quầy thu ngân', kind: 'bill', stationId: null, host: '10.0.0.21', template: 'k80-bill' },
  { name: 'Tem đóng gói', kind: 'tem', stationId: 'ST-01', host: '10.0.0.22', template: 'tem-40x30' },
]

/**
 * Nội dung website A8 — chuyển nguyên từ `apps/web/content/site.ts`.
 *
 * File nội dung đó đã ghi sẵn: "khi A8 lên thì tin tức và tuyển dụng chuyển sang
 * đó". Đây là lượt chuyển ấy; hai mảng bên kia đã bị gỡ để không còn nguồn thứ hai.
 */
const SITE_POSTS: { title: string; category: string; excerpt: string | null; publishedOn: string }[] = [
  {
    title: 'Chúng tôi đổi sang than hoa Bình Định',
    category: 'Bếp',
    publishedOn: '2026-07-12',
    excerpt:
      'Ba tháng thử mười hai loại than. Đây là loại giữ nhiệt lâu nhất mà không để lại vị đắng khói trên miếng thịt.',
  },
  { title: 'Thăn bò về mỗi thứ Ba', category: 'Nguyên liệu', publishedOn: '2026-06-28', excerpt: null },
  { title: 'Mở chi nhánh Thảo Điền', category: 'Chi nhánh', publishedOn: '2026-06-15', excerpt: null },
  { title: 'Lớp học nướng cho mười hai người', category: 'Sự kiện', publishedOn: '2026-06-02', excerpt: null },
  { title: 'Set Kiwami có thêm lõi vai bò', category: 'Thực đơn', publishedOn: '2026-05-21', excerpt: null },
  { title: 'Bếp trưởng Nakamura nói về khói', category: 'Câu chuyện', publishedOn: '2026-05-09', excerpt: null },
  { title: 'Giờ vàng buổi trưa từ tháng Tám', category: 'Ưu đãi', publishedOn: '2026-04-26', excerpt: null },
]

/** `branchIndex` null = tuyển cho cả chuỗi (cột `branch_id` để trống) */
const SITE_JOBS: { title: string; branchIndex: number | null; employment: string; slots: number }[] = [
  { title: 'Bếp trưởng trạm nướng', branchIndex: 2, employment: 'Toàn thời gian', slots: 1 },
  { title: 'Phụ bếp trạm chiên', branchIndex: 0, employment: 'Toàn thời gian', slots: 2 },
  { title: 'Phục vụ bàn', branchIndex: null, employment: 'Toàn thời gian · ca tối', slots: 6 },
  { title: 'Thu ngân', branchIndex: 1, employment: 'Toàn thời gian', slots: 1 },
  { title: 'Nhân viên chuẩn bị than', branchIndex: 0, employment: 'Bán thời gian', slots: 2 },
]

/**
 * Cây khoản mục mặc định chuẩn F&B (§27 C6).
 *
 * `automatic` = khoản mục do MÁY tự ghi: giá vốn từ kho, nhân sự từ kỳ lương,
 * khấu hao từ sổ tài sản. Người không nhập tay được vào ba khoản đó — nếu nhập
 * được thì mỗi khoản sẽ vào Lãi/Lỗ hai lần.
 */
const EXPENSE_CATEGORIES: {
  id: string
  parentId?: string
  name: string
  pnlLine: string
  automatic?: boolean
}[] = [
  { id: 'gia-von', name: 'Giá vốn hàng bán', pnlLine: 'cogs', automatic: true },
  { id: 'nhan-su', name: 'Nhân sự', pnlLine: 'labour', automatic: true },
  { id: 'mat-bang', name: 'Mặt bằng', pnlLine: 'rent' },
  { id: 'tien-ich', name: 'Tiện ích', pnlLine: 'utilities' },
  { id: 'tien-ich-dien', parentId: 'tien-ich', name: 'Điện', pnlLine: 'utilities' },
  { id: 'tien-ich-nuoc', parentId: 'tien-ich', name: 'Nước', pnlLine: 'utilities' },
  { id: 'tien-ich-gas', parentId: 'tien-ich', name: 'Gas', pnlLine: 'utilities' },
  { id: 'tien-ich-internet', parentId: 'tien-ich', name: 'Internet & phần mềm', pnlLine: 'utilities' },
  // KHÔNG `automatic`: mua thiết bị DƯỚI ngưỡng tài sản vẫn ghi thẳng ở C2
  // ("sửa chữa nhỏ dưới ngưỡng vào chi phí ngay" §27 C4). Từ ngưỡng trở lên thì
  // `needsAssetRecord` chặn lại và đẩy sang sổ tài sản.
  { id: 'thiet-bi', name: 'Thiết bị & khấu hao', pnlLine: 'depreciation' },
  { id: 'marketing', name: 'Marketing', pnlLine: 'marketing' },
  { id: 'phi-thanh-toan', name: 'Phí thanh toán', pnlLine: 'payment-fee' },
  { id: 'van-hanh-khac', name: 'Vận hành khác', pnlLine: 'other-opex' },
  { id: 'van-hanh-sua-chua', parentId: 'van-hanh-khac', name: 'Sửa chữa & bảo trì', pnlLine: 'other-opex' },
  { id: 'van-hanh-chi-vat', parentId: 'van-hanh-khac', name: 'Chi vặt', pnlLine: 'other-opex' },
  { id: 'van-hanh-tam-ung', parentId: 'van-hanh-khac', name: 'Tạm ứng nhân viên', pnlLine: 'other-opex' },
  { id: 'thue-phi', name: 'Thuế & phí', pnlLine: 'tax' },
]

/**
 * Vùng giao của chi nhánh Cầu Giấy (O10).
 *
 * Ba vòng theo khoảng cách: quanh quán, các phường liền kề, rồi vành ngoài với
 * phí cao hơn và đơn tối thiểu cao hơn — xa hơn thì một chuyến ship phải "cõng"
 * được nhiều tiền món hơn mới đáng đi.
 */
const DELIVERY_ZONES = [
  {
    name: 'Vòng 1 · quanh quán',
    wards: ['Dich Vong', 'Dich Vong Hau', 'Quan Hoa', 'Nghia Do'],
    feeVnd: 15_000,
    minOrderVnd: 150_000,
    etaMinutes: 25,
    sort: 1,
  },
  {
    name: 'Vòng 2 · Cầu Giấy mở rộng',
    wards: ['Mai Dich', 'Yen Hoa', 'Trung Hoa', 'Nghia Tan'],
    feeVnd: 25_000,
    minOrderVnd: 250_000,
    etaMinutes: 35,
    sort: 2,
  },
  {
    name: 'Vòng 3 · lân cận',
    wards: ['Lang Thuong', 'Lang Ha', 'Thanh Cong', 'Ngoc Khanh'],
    feeVnd: 40_000,
    minOrderVnd: 400_000,
    etaMinutes: 50,
    sort: 3,
  },
]

/** Vai trò trong prototype → mã vai trò trong ma trận §4.2 */
const ROLE_BY_TITLE: Record<string, string> = {
  'Thu ngân': 'R2',
  'Phục vụ': 'R1',
  'Trưởng ca': 'R7',
  'Lễ tân': 'R3',
  Bếp: 'R4',
}

/**
 * Tài khoản Sora Office cho môi trường dev.
 *
 * Bộ nhân viên trong prototype dừng ở cấp chi nhánh (thu ngân, phục vụ, trưởng
 * ca) nên không ai mở được màn quản trị. Thêm một tài khoản chủ chuỗi — vai trò
 * gán ở phạm vi TOÀN CHUỖI (branch_id NULL) đúng như §5.
 */
const DEV_OFFICE_PASSWORD = 'sora-dev-2026'
/**
 * Tài khoản Office cho máy dev.
 *
 * Có kế toán và quản lý nhân sự vì hai luồng mới ĐÒI HỎI nhiều người: phiếu chi
 * trên hạn mức phải người khác duyệt (§4.3.1 không ai tự duyệt việc của mình), và
 * kỳ lương đi qua ba vai — R13 trình, R8 kiểm, R10 duyệt. Chỉ có một tài khoản
 * chủ thì hai luồng đó không chạy thử được trên máy dev.
 */
const OFFICE_ACCOUNTS: { code: string; fullName: string; email: string; roles: string[] }[] = [
  { code: 'CHU01', fullName: 'Chủ quán', email: 'chu@tokyosora.vn', roles: ['R10'] },
  { code: 'CHUOI01', fullName: 'Quản lý chuỗi', email: 'chuoi@tokyosora.vn', roles: ['R11'] },
  { code: 'KETOAN01', fullName: 'Kế toán', email: 'ketoan@tokyosora.vn', roles: ['R8'] },
  { code: 'NHANSU01', fullName: 'Quản lý nhân sự', email: 'nhansu@tokyosora.vn', roles: ['R13'] },
  // R9 chỉ mở được đúng một màn — A8 nội dung website. Có tài khoản này thì thử
  // được ranh giới đó thật, thay vì tin rằng nó hẹp.
  { code: 'MARKETING01', fullName: 'Marketing', email: 'marketing@tokyosora.vn', roles: ['R9'] },
]

/** PIN dev — mọi nhân viên dùng 4 số khác nhau, chỉ dành cho môi trường phát triển */
const DEV_PINS: Record<string, string> = {
  hoa: '1101',
  minh: '1102',
  tuan: '1103',
  lan: '1104',
  duc: '1105',
}

interface SeedBranch {
  id: string
  name: string
  addr?: string
  phone?: string
  hours?: string
  /** '18 bàn · 6 bàn có bếp' — nguồn để dựng sơ đồ bàn của chi nhánh chưa vẽ */
  tables?: string
  /** ['Khu bếp than tại bàn', '3 phòng riêng'] */
  zones?: string[]
}
interface SeedDishRow {
  id: string
  code: string | null
  nameVi: string
  nameJa: string | null
  kana: string | null
  group: string | null
  subGroup: string | null
  priceVnd: number | null
  costVnd: number | null
  allergens: string | null
  descShort: string | null
  descLong: string | null
  isVegetarian: boolean
  isSpicy: boolean
  hasSeafood: boolean
  isSignature: boolean
  active: boolean
  stationsFromKitchen: string[]
}
interface SeedTable {
  n: string
  z: string
  grill: number
  /** Vắng ở vài bàn trong prototype — mặc định 4 chỗ */
  cap?: number
}

/**
 * Nhóm tuỳ chọn áp cho nhóm món nào (luật `modsFor` của prototype Table).
 * Rượu KHÔNG hỏi đá — rượu Nhật uống theo cách của nó, hỏi đá là hỏi sai.
 */
const MODIFIER_SCOPE_CATEGORIES: Record<string, string[]> = {
  modYaki: ['yaki'],
  modLau: ['lau'],
  modDrink: ['bia', 'tra'],
}

/** Cờ ăn kiêng đưa vào `tags` — nguồn cho bộ lọc T5 */
function dietTags(d: SeedDishRow): string[] | null {
  const tags = [
    d.isVegetarian ? 'chay' : null,
    d.isSpicy ? 'cay' : null,
    d.hasSeafood ? 'hai-san' : null,
  ].filter((t): t is string => t !== null)
  return tags.length > 0 ? tags : null
}
interface SeedStaff {
  id: string
  name: string
  role: string
}
interface SeedModifierGroup {
  gid: string
  title: string
  req: boolean
  opts: { id: string; n: string; p: number }[]
}

interface SeedSetDetail {
  courses?: {
    k?: string
    label: string
    items?: { id?: string; n?: string; q?: string }[]
  }[]
}

/**
 * Định lượng trong prototype là chuỗi hiển thị: '2 bát' · '100g' · '3 con' · '1 phần'.
 * Số phần là con số đứng đầu nếu có, còn '100g' thì vẫn là MỘT phần nặng 100g —
 * chuỗi gốc được giữ nguyên ở `portionLabel` để in lên vé bếp.
 */
function parseQty(display: string | undefined): number {
  if (!display) return 1
  const match = /^(\d+)\s*(phần|bát|con|xiên|cái|suất)/i.exec(display.trim())
  return match ? Number(match[1]) : 1
}

const AREA_NAMES: Record<string, string> = {
  sakura: 'Khu Sakura',
  momiji: 'Khu Momiji',
  sumi: 'Khu Sumi',
  rieng: 'Phòng riêng',
  private: 'Phòng riêng',
}
/** Zone nào là phòng riêng — quyết định `kind` của bàn, và W6 lọc chỗ theo cột đó */
const PRIVATE_ZONES = new Set(['private', 'rieng'])

/** Dựng khu vực + bàn của một chi nhánh, gọi lại được nhiều lần; trả về số bàn */
async function seedFloorplan(db: Db, branchId: string, rows: SeedTable[]): Promise<number> {
  const areaIdByZone = new Map<string, number>()
  for (const zone of new Set(rows.map((t) => t.z))) {
    const name = AREA_NAMES[zone] ?? zone
    const existing = await db.query.areas.findFirst({
      where: (a, { and, eq }) => and(eq(a.branchId, branchId), eq(a.name, name)),
    })
    if (existing) {
      areaIdByZone.set(zone, existing.id)
      continue
    }
    const [created] = await db
      .insert(s.areas)
      .values({ branchId, name })
      .returning({ id: s.areas.id })
    areaIdByZone.set(zone, created!.id)
  }

  for (const t of rows) {
    const hasGrill = t.grill === 1
    const row = {
      branchId,
      areaId: areaIdByZone.get(t.z)!,
      code: t.n,
      kind: PRIVATE_ZONES.has(t.z) ? 'private' : hasGrill ? 'grill' : 'standard',
      hasGrill,
      // Bàn khai có bếp buộc phải nói loại bếp (ràng buộc tables_grill_consistency)
      grillType: hasGrill ? 'than' : null,
      seatMin: 2,
      seatMax: t.cap ?? 4,
    }
    await db
      .insert(s.tables)
      .values(row)
      .onConflictDoUpdate({ target: [s.tables.branchId, s.tables.code], set: row })
  }
  return rows.length
}

/**
 * Sơ đồ bàn suy từ dòng mô tả của chi nhánh: '14 bàn · 8 bàn có bếp' + '2 phòng riêng'.
 *
 * Chỉ chi nhánh Cầu Giấy có bản vẽ thật trong bộ thiết kế. Hai chi nhánh còn lại
 * mà không có bàn nào thì W5 hiện "0 bàn" và W6 báo kín chỗ mọi khung — nên seed
 * dựng đúng số lượng đã công bố ở A10 để cả ba chi nhánh chạy được. Bản vẽ thật
 * sẽ đè lên khi vẽ ở A3.
 */
function layoutFromDescription(branch: SeedBranch): SeedTable[] {
  const total = Number(/(\d+)\s*bàn/.exec(branch.tables ?? '')?.[1] ?? 0)
  const grill = Number(/(\d+)\s*bàn có bếp/.exec(branch.tables ?? '')?.[1] ?? 0)
  const privateRooms = Number(
    /(\d+)\s*phòng riêng/.exec((branch.zones ?? []).join(' '))?.[1] ?? 0,
  )

  const rows: SeedTable[] = []
  for (let i = 0; i < total; i++) {
    const hasGrill = i < grill
    rows.push({
      n: String(i + 1).padStart(2, '0'),
      z: hasGrill ? 'sakura' : 'momiji',
      grill: hasGrill ? 1 : 0,
      cap: 4,
    })
  }
  for (let i = 0; i < privateRooms; i++) {
    rows.push({ n: `P${i + 1}`, z: 'rieng', grill: 1, cap: 8 })
  }
  return rows
}

async function seed(db: Db) {
  // ---- Chi nhánh ----
  const branchRows = await readJson<SeedBranch[]>('branches.json')
  for (const b of branchRows) {
    await db
      .insert(s.branches)
      .values({
        id: b.id,
        name: b.name,
        address: b.addr ?? null,
        phone: b.phone ?? null,
        openHours: b.hours ? { raw: b.hours } : null,
      })
      .onConflictDoUpdate({
        target: s.branches.id,
        set: { name: b.name, address: b.addr ?? null, phone: b.phone ?? null },
      })
  }

  // ---- Trạm bếp ----
  for (const st of STATIONS) {
    await db.insert(s.stations).values(st).onConflictDoUpdate({ target: s.stations.id, set: st })
  }

  // ---- Nhóm thực đơn ----
  const cats = await readJson<[string, string, string][]>('categories.json')
  await Promise.all(
    cats.map((c, i) => {
      const row = { id: c[0], nameVi: c[1], kanji: c[2], sort: i }
      return db.insert(s.categories).values(row).onConflictDoUpdate({ target: s.categories.id, set: row })
    }),
  )

  // ---- Món ----
  const { dishes } = await readJson<{ dishes: SeedDishRow[] }>('dishes.json')
  const unroutable: string[] = []
  for (const d of dishes) {
    const isSet = d.group === 'set'
    const routing = isSet ? null : routingForSeedDish(d)
    if (!isSet && !routing) {
      unroutable.push(d.id)
      continue
    }
    const row = {
      id: d.id,
      code: d.code ?? `SORA-${d.id.toUpperCase()}`,
      kind: isSet ? 'set' : d.group && ['bia', 'ruou', 'tra'].includes(d.group) ? 'drink' : 'dish',
      categoryId: d.group,
      subCategory: d.subGroup || null,
      nameVi: d.nameVi,
      nameJa: d.nameJa,
      kana: d.kana,
      shortDesc: d.descShort,
      longDesc: d.descLong,
      allergens: d.allergens ? d.allergens.split(',').map((a) => a.trim()) : null,
      tags: dietTags(d),
      routingMethod: routing?.method ?? null,
      stationGrill: routing?.stationGrill ?? null,
      stationNoGrill: routing?.stationNoGrill ?? null,
      stationTakeaway: routing?.stationTakeaway ?? null,
      stationDelivery: routing?.stationDelivery ?? null,
      secondaryStation: routing?.secondaryStation ?? null,
      primaryLabel: routing?.primaryLabel ?? null,
      secondaryLabel: routing?.secondaryLabel ?? null,
      prepSeconds: routing?.prepSeconds ?? 300,
      basePrice: d.priceVnd ?? 0,
      /**
       * Bán online hay không, theo đúng mẫu O11 của bản thiết kế: set và lẩu tắt,
       * còn lại bật. Nồi lẩu mang về là nước sánh ra hộp, còn set là mâm dọn theo
       * nhịp tại bàn — hai thứ đó bán online là bán một trải nghiệm hỏng.
       */
      onlineVisible: !isSet && d.group !== 'lau',
      /** Huy hiệu 名物 trên W1/W2/W3 — cờ của bếp, không phải của người viết web */
      signature: d.isSignature,
      active: d.active,
    }
    await db.insert(s.dishes).values(row).onConflictDoUpdate({ target: s.dishes.id, set: row })
  }
  if (unroutable.length) {
    throw new Error(
      `Không suy được trạm cho món: ${unroutable.join(', ')} — bổ sung vào seed-routing.ts`,
    )
  }

  // ---- Chặng của set ----
  // Prototype mô tả set theo CHẶNG (Mở bữa · Bò trên than · Chốt bữa…) và "set nấu
  // theo nhịp, mang từng chặng" — nên mỗi chặng lệch một đợt ra món.
  const setData = await readJson<{ setDetails: Record<string, SeedSetDetail> | null }>('sets.json')
  const knownDishIds = new Set(dishes.map((d) => d.id))
  const skippedSetItems: string[] = []

  for (const [key, detail] of Object.entries(setData.setDetails ?? {})) {
    // Khoá trong setDetails là 'set' + id (setsora → sora)
    const setDishId = key.startsWith('set') ? key.slice(3) : key
    if (!knownDishIds.has(setDishId)) continue

    for (const [index, course] of (detail.courses ?? []).entries()) {
      const groupId = `${setDishId}-${index}`
      const group = {
        id: groupId,
        setDishId,
        label: course.label,
        kanji: course.k ?? null,
        // Nhóm cố định (lấy hết). Nhóm "chọn N trong M" của Set Kiwami sẽ khai ở
        // Office M11 khi có dữ liệu thật — prototype chưa mô tả lựa chọn cụ thể.
        pickCount: null,
        batchOffset: index,
        sort: index,
      }
      await db.insert(s.setGroups).values(group).onConflictDoUpdate({ target: s.setGroups.id, set: group })

      for (const [itemIndex, item] of (course.items ?? []).entries()) {
        // Món chỉ có trong set (cơm trắng kèm…) chưa có bản ghi trong danh mục —
        // ghi nhận để nhập ở Office M1 thay vì bịa ra món mới ở đây.
        if (!item.id || !knownDishIds.has(item.id)) {
          skippedSetItems.push(`${setDishId}/${course.label}: ${item.id ?? item.n ?? '?'}`)
          continue
        }
        const row = {
          groupId,
          dishId: item.id,
          qty: parseQty(item.q),
          portionLabel: item.q ?? null,
          sort: itemIndex,
        }
        await db
          .insert(s.setGroupItems)
          .values(row)
          .onConflictDoUpdate({ target: [s.setGroupItems.groupId, s.setGroupItems.dishId], set: row })
      }
    }
  }

  // ---- Nội dung trang chi tiết món (W3) ----
  // Chỉ nạp cho món ĐÃ CÓ trong danh mục: bộ chữ nghĩa này gắn với món chủ lực,
  // còn danh mục thì thay đổi theo mùa.
  for (const story of DISH_STORIES) {
    if (!knownDishIds.has(story.dishId)) continue
    const { dishId: _dishId, ...rest } = story
    await db
      .insert(s.dishStories)
      .values(story)
      .onConflictDoUpdate({ target: s.dishStories.dishId, set: rest })
  }

  // ---- Nhóm tuỳ chọn (modifier) ----
  const mods = await readJson<Record<string, SeedModifierGroup[]>>('modifiers.json')
  for (const [scope, groups] of Object.entries(mods)) {
    for (const [gi, g] of groups.entries()) {
      const gid = `${scope}-${g.gid}`
      const grow = { id: gid, name: g.title, required: g.req, multi: !g.req, pickMin: g.req ? 1 : 0, pickMax: g.req ? 1 : null }
      await db.insert(s.modifierGroups).values(grow).onConflictDoUpdate({ target: s.modifierGroups.id, set: grow })
      for (const [i, o] of g.opts.entries()) {
        const orow = { id: `${gid}-${o.id}`, groupId: gid, name: o.n, priceDelta: o.p, sort: i }
        await db.insert(s.modifierOptions).values(orow).onConflictDoUpdate({ target: s.modifierOptions.id, set: orow })
      }

      // Gắn nhóm vào món theo NHÓM MÓN, đúng luật của prototype: món nướng phải
      // chọn vị, lẩu phải chọn số người, đồ uống thì hỏi đá. Gắn tay từng món sẽ
      // sai ngay lần thêm món mới — quy tắc mới là thứ cần giữ, không phải bảng.
      const categories = MODIFIER_SCOPE_CATEGORIES[scope] ?? []
      for (const dish of dishes.filter((d) => d.group && categories.includes(d.group))) {
        const link = { dishId: dish.id, groupId: gid, sort: gi }
        await db
          .insert(s.dishModifierGroups)
          .values(link)
          .onConflictDoUpdate({
            target: [s.dishModifierGroups.dishId, s.dishModifierGroups.groupId],
            set: link,
          })
      }
    }
  }

  // ---- Khu vực & bàn ----
  const branchId = branchRows[0]!.id
  const tableRows = await readJson<{ tables: SeedTable[] }>('tables.json')
  // Chi nhánh đầu có sơ đồ thật; hai chi nhánh còn lại suy từ dòng mô tả ở A10
  let tableCount = await seedFloorplan(db, branchId, tableRows.tables)
  for (const b of branchRows.slice(1)) {
    tableCount += await seedFloorplan(db, b.id, layoutFromDescription(b))
  }

  // ---- Vùng giao hàng (O10) ----
  for (const zone of DELIVERY_ZONES) {
    const existing = await db.query.deliveryZones.findFirst({
      where: (z, { and, eq }) => and(eq(z.branchId, branchId), eq(z.name, zone.name)),
    })
    const row = { branchId, ...zone }
    if (existing) {
      await db.update(s.deliveryZones).set(row).where(eq(s.deliveryZones.id, existing.id))
    } else {
      await db.insert(s.deliveryZones).values(row)
    }
  }

  // ---- Nhân viên + vai trò ----
  const { staff: staffRows } = await readJson<{ staff: SeedStaff[] }>('staff.json')
  for (const st of staffRows) {
    const pin = DEV_PINS[st.id] ?? '1100'
    const row = { code: st.id.toUpperCase(), fullName: st.name, pinHash: await hash(pin) }
    const [created] = await db
      .insert(s.staff)
      .values(row)
      .onConflictDoUpdate({ target: s.staff.code, set: { fullName: row.fullName, pinHash: row.pinHash } })
      .returning({ id: s.staff.id })
    const roleCode = ROLE_BY_TITLE[st.role] ?? 'R1'
    await db
      .insert(s.staffRoles)
      .values({ staffId: created!.id, roleCode, branchId })
      .onConflictDoNothing()
  }

  // ---- Tài khoản Office ----
  for (const account of OFFICE_ACCOUNTS) {
    const row = {
      code: account.code,
      fullName: account.fullName,
      email: account.email,
      passwordHash: await hash(DEV_OFFICE_PASSWORD),
    }
    const [created] = await db
      .insert(s.staff)
      .values(row)
      .onConflictDoUpdate({ target: s.staff.code, set: row })
      .returning({ id: s.staff.id })
    for (const roleCode of account.roles) {
      await db
        .insert(s.staffRoles)
        // branchId NULL = phạm vi toàn chuỗi
        .values({ staffId: created!.id, roleCode, branchId: null })
        .onConflictDoNothing()
    }
  }

  // ---- Tham số A6 ----
  for (const p of PARAMETERS) {
    await db
      .insert(s.parameters)
      .values({ key: p.key, branchId: null, value: p.value, unit: p.unit, sensitive: p.sensitive ?? false })
      .onConflictDoNothing()
  }

  /**
   * Ký hiệu hoá đơn điện tử — RIÊNG từng chi nhánh (§30.2: một mã số thuế, một
   * hợp đồng HĐĐT, mỗi địa điểm kinh doanh một ký hiệu M). Nên đây là tham số
   * cấp chi nhánh, không phải mặc định cấp chuỗi như mọi tham số khác.
   */
  for (const [index, branch] of branchRows.entries()) {
    await db
      .insert(s.parameters)
      .values({
        key: 'einvoice.serial',
        branchId: branch.id,
        value: `C26M${String.fromCharCode(65 + index)}A`,
        unit: 'ký hiệu',
        sensitive: true,
      })
      .onConflictDoNothing()
  }

  // ---- Nhà cung cấp S3 ----
  for (const supplier of SUPPLIERS) {
    const { items, ...row } = supplier
    const [created] = await db
      .insert(s.suppliers)
      .values(row)
      .onConflictDoUpdate({ target: s.suppliers.code, set: row })
      .returning({ id: s.suppliers.id })
    for (const item of items) {
      // Nguyên liệu có thể chưa khai — bỏ qua thay vì làm hỏng cả lượt nạp
      const [ing] = await db
        .select({ id: s.ingredients.id })
        .from(s.ingredients)
        .where(eq(s.ingredients.id, item.ingredientId))
      if (!ing) continue
      await db
        .insert(s.supplierItems)
        .values({ supplierId: created!.id, ...item })
        .onConflictDoNothing()
    }
  }

  // ---- Máy in A5 ----
  for (const branch of branchRows) {
    for (const p of PRINTERS) {
      await db
        .insert(s.printers)
        .values({ branchId: branch.id, ...p })
        .onConflictDoNothing()
    }
  }

  // ---- Nội dung website A8 ----
  for (const post of SITE_POSTS) {
    const [existing] = await db
      .select({ id: s.sitePosts.id })
      .from(s.sitePosts)
      .where(eq(s.sitePosts.title, post.title))
    if (!existing) await db.insert(s.sitePosts).values({ ...post, published: true })
  }
  for (const [index, job] of SITE_JOBS.entries()) {
    const [existing] = await db
      .select({ id: s.siteJobs.id })
      .from(s.siteJobs)
      .where(eq(s.siteJobs.title, job.title))
    if (existing) continue
    const { branchIndex, ...rest } = job
    await db.insert(s.siteJobs).values({
      ...rest,
      branchId: branchIndex === null ? null : (branchRows[branchIndex]?.id ?? null),
      published: true,
      sort: index,
    })
  }

  // ---- Cây khoản mục C6 ----
  for (const c of EXPENSE_CATEGORIES) {
    await db
      .insert(s.expenseCategories)
      .values({
        id: c.id,
        parentId: c.parentId ?? null,
        name: c.name,
        pnlLine: c.pnlLine,
        automatic: c.automatic ?? false,
        sort: EXPENSE_CATEGORIES.indexOf(c),
      })
      .onConflictDoNothing()
  }

  return {
    branches: branchRows.length,
    stations: STATIONS.length,
    categories: cats.length,
    dishes: dishes.length,
    tables: tableCount,
    staff: staffRows.length,
    parameters: PARAMETERS.length,
    printers: branchRows.length * PRINTERS.length,
    baiViet: SITE_POSTS.length,
    tinTuyenDung: SITE_JOBS.length,
    // Món chỉ xuất hiện trong set mà chưa có trong danh mục — nhập ở Office M1
    setItemsChuaCoTrongDanhMuc: skippedSetItems,
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const summary = await seed(createDb(pool))
    console.log('Đã nạp:', JSON.stringify(summary))
    console.log(`Thời gian chuẩn theo trạm: ${JSON.stringify(PREP_SECONDS_BY_STATION)}`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
