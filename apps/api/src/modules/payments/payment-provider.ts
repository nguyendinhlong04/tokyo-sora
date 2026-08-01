import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * Cổng thanh toán ngân hàng.
 *
 * Mỗi LƯỢT trả sinh một tài khoản định danh (VA) riêng nhúng vào VietQR — tiền vào
 * VA nào là của lượt đó, không phụ thuộc nội dung chuyển khoản khách gõ (§30.1).
 * Đây là điều khiến việc đối soát không cần người đọc nội dung chuyển khoản.
 *
 * Đổi nhà cung cấp = viết adapter mới, không đụng màn hình nào.
 */
export interface CreateVaInput {
  /** Mã tham chiếu nội bộ của lượt trả */
  reference: string
  amount: number
  branchId: string
  expiresInSeconds: number
}

export interface VaResult {
  vaNumber: string
  /** Chuỗi nhúng vào mã QR theo chuẩn VietQR */
  qrString: string
  expiresAt: Date
}

export interface BankNotification {
  /** Mã giao dịch của ngân hàng — khoá chống xử lý trùng */
  bankRef: string
  vaNumber: string
  amount: number
  raw: Record<string, unknown>
}

export interface PaymentProvider {
  readonly name: string
  createVirtualAccount(input: CreateVaInput): Promise<VaResult>
  /**
   * Kiểm chữ ký webhook. Nhận RAW BODY chứ không nhận object đã parse: chữ ký ký
   * trên chuỗi byte gốc, parse rồi serialize lại là đổi byte và chữ ký sai.
   */
  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): boolean
  parseWebhook(rawBody: string): BankNotification
}

/**
 * Bản giả lập cho dev và test.
 *
 * Có ký chữ ký thật bằng HMAC để đường đi của dữ liệu giống hệt hàng thật — khi
 * đấu nối VietinBank thì chỉ thay adapter, không phải sửa lại controller hay test.
 */
export class MockBankProvider implements PaymentProvider {
  readonly name = 'mock'

  constructor(private readonly secret: string) {}

  async createVirtualAccount(input: CreateVaInput): Promise<VaResult> {
    // VA thật do ngân hàng cấp; ở đây sinh từ mã tham chiếu để tất định
    const suffix = input.reference.replace(/\D/g, '').padStart(8, '0').slice(-8)
    const vaNumber = `9704${suffix}`
    return {
      vaNumber,
      qrString: buildVietQrPayload(vaNumber, input.amount),
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000),
    }
  }

  verifyWebhook(headers: Record<string, string | string[] | undefined>, rawBody: string): boolean {
    const header = headers['x-bank-signature']
    const provided = Array.isArray(header) ? header[0] : header
    if (!provided) return false

    const expected = createHmac('sha256', this.secret).update(rawBody).digest('hex')
    const a = Buffer.from(provided)
    const b = Buffer.from(expected)
    // So sánh thời gian hằng định — so sánh thường rò rỉ độ dài tiền tố khớp
    return a.length === b.length && timingSafeEqual(a, b)
  }

  parseWebhook(rawBody: string): BankNotification {
    const body = JSON.parse(rawBody) as {
      bankRef?: string
      vaNumber?: string
      amount?: number
    }
    if (!body.bankRef || !body.vaNumber || typeof body.amount !== 'number') {
      throw new Error('Webhook thiếu bankRef / vaNumber / amount')
    }
    return {
      bankRef: body.bankRef,
      vaNumber: body.vaNumber,
      amount: body.amount,
      raw: body as Record<string, unknown>,
    }
  }

  /** Chỉ dùng trong test và công cụ dev để tạo webhook hợp lệ */
  sign(rawBody: string): string {
    return createHmac('sha256', this.secret).update(rawBody).digest('hex')
  }
}

/**
 * Dựng payload VietQR (EMVCo). Bản rút gọn đủ để điện thoại quét ra đúng số tài
 * khoản và số tiền; nhà cung cấp thật sẽ trả về chuỗi đầy đủ của họ.
 */
function buildVietQrPayload(vaNumber: string, amount: number): string {
  const field = (id: string, value: string) =>
    `${id}${String(value.length).padStart(2, '0')}${value}`

  const merchant =
    field('00', 'A000000727') + field('01', field('00', '970415') + field('01', vaNumber))

  const payload =
    field('00', '01') +
    field('01', '12') +
    field('38', merchant) +
    field('53', '704') +
    field('54', String(amount)) +
    field('58', 'VN')

  return payload + '6304' + crc16(payload + '6304')
}

/** CRC-16/CCITT-FALSE theo chuẩn EMVCo */
function crc16(input: string): string {
  let crc = 0xffff
  for (const char of Buffer.from(input, 'utf8')) {
    crc ^= char << 8
    for (let i = 0; i < 8; i++) {
      crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

export const PAYMENT_PROVIDER = Symbol('SORA_PAYMENT_PROVIDER')
