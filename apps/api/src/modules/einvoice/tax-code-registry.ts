/**
 * Tra mã số thuế tổ chức ở nguồn ngoài — để thu ngân, khách gõ MST là có sẵn tên
 * và địa chỉ đúng như đăng ký, không phải đánh vần tên công ty dài 80 chữ.
 *
 * Kết quả chỉ là gợi ý điền sẵn, không phải xác thực: người nhập vẫn sửa được, và
 * nhà cung cấp hoá đơn mới là nơi kiểm MST với cơ quan thuế lúc phát hành.
 */
export interface RegistryEntry {
  name: string
  address: string | null
  /** Tình trạng theo Cục Thuế, vd "NNT đang hoạt động (đã được cấp GCN ĐKT)" */
  status: string | null
}

export type RegistryResult =
  | { ok: true; entry: RegistryEntry }
  | { ok: false; code: 'not_found' | 'unavailable'; message: string }

export interface TaxCodeRegistry {
  readonly name: string
  lookup(taxCode: string, signal: AbortSignal): Promise<RegistryResult>
}

/**
 * VietQR (`api.vietqr.io/v2/business/{mst}`) — miễn phí, không cần khoá, dữ liệu
 * tổng hợp từ trang của Cục Thuế. `code: '00'` có kết quả, `'51'` là MST không tồn
 * tại. Họ giới hạn lượt gọi theo IP và trả 429 kèm chữ thường, không phải JSON.
 */
export class VietQrTaxCodeRegistry implements TaxCodeRegistry {
  readonly name = 'vietqr'

  async lookup(taxCode: string, signal: AbortSignal): Promise<RegistryResult> {
    const res = await fetch(`https://api.vietqr.io/v2/business/${encodeURIComponent(taxCode)}`, {
      signal,
      headers: { accept: 'application/json' },
    })
    if (!res.ok) {
      return { ok: false, code: 'unavailable', message: `Nguồn tra cứu trả lỗi ${res.status}` }
    }
    const body = (await res.json().catch(() => null)) as {
      code?: string
      desc?: string
      data?: { name?: unknown; address?: unknown; status?: unknown } | null
    } | null
    if (body?.code === '51') {
      return { ok: false, code: 'not_found', message: 'Mã số thuế không tồn tại' }
    }
    const name = typeof body?.data?.name === 'string' ? body.data.name.trim() : ''
    if (body?.code !== '00' || name === '') {
      return { ok: false, code: 'unavailable', message: body?.desc ?? 'Không đọc được kết quả' }
    }
    return {
      ok: true,
      entry: {
        name,
        address: typeof body.data?.address === 'string' ? body.data.address.trim() || null : null,
        status: typeof body.data?.status === 'string' ? body.data.status.trim() || null : null,
      },
    }
  }
}

/** Bản giả lập cho test — không ra mạng; `entries` nạp sẵn, `calls` đếm lượt gọi */
export class MockTaxCodeRegistry implements TaxCodeRegistry {
  readonly name = 'mock'
  readonly entries = new Map<string, RegistryEntry>()
  readonly calls: string[] = []
  down = false

  async lookup(taxCode: string): Promise<RegistryResult> {
    this.calls.push(taxCode)
    if (this.down) return { ok: false, code: 'unavailable', message: 'Nguồn tra cứu đang hỏng' }
    const entry = this.entries.get(taxCode)
    return entry
      ? { ok: true, entry }
      : { ok: false, code: 'not_found', message: 'Mã số thuế không tồn tại' }
  }
}

export const TAX_CODE_REGISTRY = Symbol('SORA_TAX_CODE_REGISTRY')

/**
 * Chọn theo `TAXCODE_LOOKUP`: `vietqr` (mặc định), `mock` (mặc định khi chạy test —
 * test không bao giờ ra mạng), `off` (chỉ còn danh bạ của quán).
 */
export function createTaxCodeRegistry(): TaxCodeRegistry | null {
  const kind = process.env.TAXCODE_LOOKUP ?? (process.env.NODE_ENV === 'test' ? 'mock' : 'vietqr')
  if (kind === 'off') return null
  if (kind === 'mock') return new MockTaxCodeRegistry()
  if (kind === 'vietqr') return new VietQrTaxCodeRegistry()
  throw new Error(`Không có nguồn tra mã số thuế "${kind}"`)
}
