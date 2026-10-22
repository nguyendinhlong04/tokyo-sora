/**
 * Ký hiệu và số hoá đơn điện tử (TT 91/2026/TT-BTC Phụ lục I; NĐ 254/2026 Phụ lục
 * mục 2). Hàm thuần — không Nest, không Drizzle.
 *
 * Ký hiệu 6 ký tự, ví dụ `C26MAA`:
 *   · ký tự 1: C = có mã của cơ quan thuế, K = không mã
 *   · ký tự 2–3: hai số cuối của NĂM lập hoá đơn
 *   · ký tự 4: M = hoá đơn khởi tạo từ máy tính tiền
 *   · ký tự 5–6: chữ do người bán tự đặt (mỗi địa điểm kinh doanh một cặp)
 * Ký hiệu mẫu số (1 = hoá đơn GTGT) đứng trước, lưu riêng ở `invoices.form_no`.
 */

const SERIAL_RE = /^[CK]\d{2}M[A-Z]{2}$/

/**
 * Chuẩn hoá và kiểm ký hiệu khai ở A9. Lỗi nói rõ sai ở ký tự nào: người sửa
 * được là kế toán, và họ chỉ sửa được nếu biết sai ở đâu.
 */
export function assertInvoiceSerial(serial: string): string {
  const value = serial.trim().toUpperCase()
  if (!/^[0-9A-Z]{6}$/.test(value)) {
    throw new RangeError(`Ký hiệu hoá đơn phải là 6 ký tự chữ in hoa hoặc số, nhận "${serial}"`)
  }
  if (value[3] !== 'M') {
    throw new RangeError(
      `Ký hiệu "${value}" thiếu chữ M ở ký tự thứ 4 — hoá đơn khởi tạo từ máy tính tiền bắt buộc có ký tự này`,
    )
  }
  if (!SERIAL_RE.test(value)) {
    throw new RangeError(
      `Ký hiệu "${value}" chưa đúng mẫu: C hoặc K, hai số của năm, chữ M, rồi hai chữ cái — ví dụ C26MAA`,
    )
  }
  return value
}

/**
 * Ký hiệu dùng cho một ngày lập hoá đơn: thay hai số năm của mẫu khai ở A9 bằng
 * năm của ngày lập. Sang 01/01 là ký hiệu mới và số đếm lại từ 1 — không ai phải
 * nhớ vào A9 sửa đúng nửa đêm.
 */
export function serialForDate(template: string, invoiceDate: string): string {
  const serial = assertInvoiceSerial(template)
  const yy = invoiceDate.slice(2, 4)
  if (!/^\d{2}$/.test(yy)) throw new RangeError(`Ngày lập hoá đơn không hợp lệ: ${invoiceDate}`)
  return `${serial[0]}${yy}${serial.slice(3)}`
}

/** Số hoá đơn tối đa 8 chữ số (NĐ 254 Phụ lục mục 2) */
export const MAX_INVOICE_NO = 99_999_999

export function formatInvoiceNo(n: number): string {
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_INVOICE_NO) {
    throw new RangeError(`Số hoá đơn ngoài khoảng 1–${MAX_INVOICE_NO}: ${n}`)
  }
  return String(n).padStart(8, '0')
}

/**
 * Lượt thử lại kế tiếp của một hoá đơn chưa lên được: 30 giây, gấp đôi mỗi lần,
 * tối đa một giờ. Chỉ lượt quét tự động đợi; người bấm "Phát hành lại" thì không.
 */
export function retryDelayMs(attempts: number): number {
  if (attempts <= 0) return 0
  return Math.min(30_000 * 2 ** (attempts - 1), 3_600_000)
}
