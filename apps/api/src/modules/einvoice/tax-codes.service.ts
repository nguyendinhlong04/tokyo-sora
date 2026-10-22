import {
  BadRequestException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from '@nestjs/common'
import { isOrgTaxCode, normalizeTaxCode, type TaxCodeLookupView } from '@sora/contracts'
import { and, desc, eq } from 'drizzle-orm'
import { DB } from '../../common/db.module'
import type { Db } from '../../db/client'
import { corporateCustomers, invoiceBuyers } from '../../db/schema'
import { TAX_CODE_REGISTRY, type RegistryResult, type TaxCodeRegistry } from './tax-code-registry'

/** Mỗi người tra (nhân viên, bàn, IP khách web) trong một phút */
const PER_MINUTE = 10
/**
 * Lượt ra nguồn ngoài của cả instance trong một phút. Nguồn ngoài chặn theo IP máy
 * chủ: một người dò hàng loạt MST qua cửa công khai mà bị chặn là cả quán mất tra cứu.
 */
const REGISTRY_PER_MINUTE = 30
const TIMEOUT_MS = 5_000

/** Ai đang tra — controller dựng từ actor hoặc từ IP của khách web */
export interface TaxCodeViewer {
  key: string
  /** Nhân viên mới thấy email và hồ sơ B15 */
  staff: boolean
}

/** Cửa sổ 60 giây trượt, đếm trong bộ nhớ tiến trình — cùng cách chống dò PIN */
class MinuteWindow {
  private hits = new Map<string, number[]>()

  allow(key: string, limit: number, now = Date.now()): boolean {
    if (this.hits.size > 2_000) this.sweep(now)
    const recent = (this.hits.get(key) ?? []).filter((t) => now - t < 60_000)
    const ok = recent.length < limit
    if (ok) recent.push(now)
    this.hits.set(key, recent)
    return ok
  }

  private sweep(now: number) {
    for (const [key, times] of this.hits) {
      if (times.every((t) => now - t >= 60_000)) this.hits.delete(key)
    }
  }
}

/**
 * Tra mã số thuế tổ chức để điền sẵn người mua: hồ sơ khách doanh nghiệp B15 →
 * danh bạ công ty quán đã xuất hoá đơn → nguồn ngoài (VietQR). Kết quả nguồn ngoài
 * được nhớ vào danh bạ, lần sau không ra mạng nữa.
 *
 * Số định danh cá nhân 12 số KHÔNG bao giờ đem đi tra: đó là dữ liệu cá nhân của
 * khách, không có lý do gửi cho bên thứ ba.
 */
@Injectable()
export class TaxCodesService {
  private readonly window = new MinuteWindow()

  constructor(
    @Inject(DB) private readonly db: Db,
    @Inject(TAX_CODE_REGISTRY) private readonly registry: TaxCodeRegistry | null,
  ) {}

  async lookup(raw: string, viewer: TaxCodeViewer): Promise<TaxCodeLookupView> {
    const taxCode = normalizeTaxCode(raw.trim())
    if (/^\d{12}$/.test(taxCode)) {
      throw new BadRequestException({
        code: 'personal_id',
        message: 'Số định danh cá nhân không đem đi tra — nhập tay họ tên, địa chỉ',
      })
    }
    if (!isOrgTaxCode(taxCode)) {
      throw new BadRequestException({
        code: 'bad_tax_code',
        message: 'Mã số thuế doanh nghiệp gồm 10 số; chi nhánh thêm "-" và 3 số',
      })
    }
    if (!this.window.allow(viewer.key, PER_MINUTE)) {
      throw new HttpException(
        {
          code: 'too_many_lookups',
          message: 'Tra quá nhiều lần trong một phút — đợi chút hoặc nhập tay',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      )
    }

    const [corporate] = await this.db
      .select({
        id: corporateCustomers.id,
        name: corporateCustomers.name,
        address: corporateCustomers.address,
        email: corporateCustomers.contactEmail,
      })
      .from(corporateCustomers)
      .where(and(eq(corporateCustomers.taxCode, taxCode), eq(corporateCustomers.active, true)))
      .orderBy(desc(corporateCustomers.updatedAt))
      .limit(1)
    const [known] = await this.db
      .select()
      .from(invoiceBuyers)
      .where(eq(invoiceBuyers.taxCode, taxCode))

    // Đã có tên và địa chỉ ở nhà thì không ra mạng
    const found = corporate?.address || known?.address ? null : await this.fromRegistry(taxCode)
    const entry = found?.ok ? found.entry : null

    const name = corporate?.name ?? known?.name ?? entry?.name
    if (!name) {
      if (found?.ok === false && found.code === 'not_found') {
        throw new NotFoundException({
          code: 'tax_code_not_found',
          message: 'Không tìm thấy mã số thuế này — kiểm lại từng số, hoặc nhập tay',
        })
      }
      throw new ServiceUnavailableException({
        code: 'lookup_unavailable',
        message: 'Chưa tra được lúc này — nhập tay tên và địa chỉ công ty',
      })
    }

    return {
      taxCode,
      name,
      address: corporate?.address ?? known?.address ?? entry?.address ?? null,
      status: known?.status ?? entry?.status ?? null,
      source: corporate ? 'corporate' : known ? 'directory' : 'registry',
      ...(viewer.staff
        ? { email: corporate?.email ?? known?.email ?? null, corporateId: corporate?.id ?? null }
        : {}),
    }
  }

  private async fromRegistry(taxCode: string): Promise<RegistryResult | null> {
    if (!this.registry || !this.window.allow('registry', REGISTRY_PER_MINUTE)) return null

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    let result: RegistryResult
    try {
      result = await this.registry.lookup(taxCode, controller.signal)
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }

    if (result.ok) {
      const now = new Date()
      await this.db
        .insert(invoiceBuyers)
        .values({
          taxCode,
          name: result.entry.name,
          address: result.entry.address,
          status: result.entry.status,
          source: 'lookup',
          lookedUpAt: now,
          updatedAt: now,
        })
        .onConflictDoNothing()
    }
    return result
  }
}
