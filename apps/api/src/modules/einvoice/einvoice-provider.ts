import { createHash } from 'node:crypto'
import type { InvoiceDocument } from '@sora/contracts'

/**
 * Nhà cung cấp hoá đơn điện tử (Viettel S-Invoice, MISA meInvoice… — chưa ký hợp
 * đồng). Họ nhận hoá đơn khởi tạo từ máy tính tiền, cấp mã cơ quan thuế, gửi email
 * cho người mua và chuyển dữ liệu về cơ quan thuế cuối ngày (NĐ 254/2026 Điều 15).
 *
 * Đổi nhà cung cấp = viết adapter mới ở đây, không màn hình nào phải sửa — cùng
 * cách với cổng ngân hàng (`payments/payment-provider.ts`). Thông tin đăng nhập của
 * nhà cung cấp nằm trong biến môi trường, KHÔNG trong bảng tham số: bảng tham số
 * từng xuống tới iPad bàn qua bundle cấu hình.
 *
 * Số hoá đơn do hệ thống của quán cấp (`einvoice_counters`) rồi gửi kèm; nhà cung
 * cấp nào tự cấp số thì adapter của họ trả số về và lúc đó mới cần mở rộng ở đây.
 */
export interface EinvoiceIssueInput {
  /**
   * Cố định cho một hoá đơn qua mọi lượt thử. Lượt trước chết giữa chừng mà lượt
   * sau gửi lại thì nhà cung cấp nhận ra là một — không thành hai hoá đơn thật.
   */
  requestKey: string
  formNo: string
  serial: string
  invoiceNo: string
  invoiceDate: string
  document: InvoiceDocument
  /** Hoá đơn bị thay thế (TT 91/2026 Điều 10) — hoá đơn mới ghi "Thay thế cho hoá đơn…" */
  replaces: {
    formNo: string
    serial: string
    invoiceNo: string
    invoiceDate: string
    authorityCode: string | null
  } | null
}

export type EinvoiceIssueResult =
  | {
      ok: true
      /** Mã của cơ quan thuế */
      authorityCode: string
      lookupCode: string
      lookupUrl: string
      providerRef: string
    }
  | {
      ok: false
      code: string
      message: string
      /** true = lỗi tạm (mạng, hệ thống thuế bận) — thử lại được; false = phải sửa dữ liệu */
      retryable: boolean
    }

export interface EinvoiceProvider {
  readonly name: string
  /** false = bản giả lập: hoá đơn không có giá trị, bill và iPad in "HOÁ ĐƠN THỬ" */
  readonly live: boolean
  issue(input: EinvoiceIssueInput, signal: AbortSignal): Promise<EinvoiceIssueResult>
}

/**
 * Bản giả lập cho dev và test: phát hành ngay, mã tất định theo khoá gửi.
 *
 * Gửi lại cùng khoá thì trả đúng kết quả cũ — y như nhà cung cấp thật phải làm,
 * để luồng thử lại được kiểm bằng đúng hành vi đó.
 */
export class MockEinvoiceProvider implements EinvoiceProvider {
  readonly name = 'mock'
  readonly live = false

  /** Mọi lượt gọi đã nhận — test đếm để chứng minh không gửi trùng */
  readonly calls: EinvoiceIssueInput[] = []
  private readonly issued = new Map<string, EinvoiceIssueResult>()
  private failures: { code: string; message: string; retryable: boolean }[] = []

  async issue(input: EinvoiceIssueInput): Promise<EinvoiceIssueResult> {
    this.calls.push(input)
    const failure = this.failures.shift()
    if (failure) return { ok: false, ...failure }

    const known = this.issued.get(input.requestKey)
    if (known) return known

    const lookupCode = createHash('sha256')
      .update(input.requestKey)
      .digest('hex')
      .slice(0, 10)
      .toUpperCase()
    const result: EinvoiceIssueResult = {
      ok: true,
      authorityCode: `M1-${input.invoiceDate.slice(2, 4)}-THU-${input.serial}${input.invoiceNo}`,
      lookupCode,
      // Tên miền .invalid: mã QR của hoá đơn thử không bao giờ dẫn tới đâu thật
      lookupUrl: `https://hoadon-thu.invalid/tra-cuu/${lookupCode}`,
      providerRef: `mock-${input.requestKey}`,
    }
    this.issued.set(input.requestKey, result)
    return result
  }

  /** Chỉ dùng trong test: lượt gọi kế tiếp thất bại như nhà cung cấp thật trả lỗi */
  failNext(code: string, message: string, retryable = true) {
    this.failures.push({ code, message, retryable })
  }
}

export const EINVOICE_PROVIDER = Symbol('SORA_EINVOICE_PROVIDER')

/**
 * Chọn theo `EINVOICE_PROVIDER`. Production mặc định `off` chứ không `mock`: bản
 * giả lập ở production là phát hành ra những tờ hoá đơn không hề lên cơ quan thuế
 * mà ai cũng tưởng là thật. `off` thì A9 không cho bật hoá đơn điện tử.
 */
export function createEinvoiceProvider(): EinvoiceProvider | null {
  const kind =
    process.env.EINVOICE_PROVIDER ?? (process.env.NODE_ENV === 'production' ? 'off' : 'mock')
  if (kind === 'off') return null
  if (kind === 'mock') return new MockEinvoiceProvider()
  throw new Error(`Chưa có adapter cho nhà cung cấp hoá đơn điện tử "${kind}"`)
}
