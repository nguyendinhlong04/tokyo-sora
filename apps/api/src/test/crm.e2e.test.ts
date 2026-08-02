/**
 * Nghiệm thu B11 – B15 · Khuyến mãi · Sổ khách · Phản hồi · Tích điểm · Khách DN.
 *
 * Năm màn này khác nhóm báo cáo ở chỗ chúng GHI, nên bài kiểm không hỏi "gọi có
 * chạy không" mà hỏi năm điều mà một bản dựng sai sẽ vi phạm âm thầm:
 *
 *   1. **Khuyến mãi không cộng dồn** — đơn hưởng đúng một chương trình, và là
 *      chương trình lợi nhất cho khách.
 *   2. **Kích hoạt là đụng giá** — R9 marketing soạn được nhưng bật phải có
 *      R11/R10 duyệt bằng PIN.
 *   3. **Điểm chỉ sinh từ thanh toán** — không có API cộng điểm, thu tiền mới
 *      sinh điểm, huỷ bill thì thu hồi.
 *   4. **SĐT che ba số giữa với vai trò không cần thấy** — marketing thấy Sổ
 *      khách nhưng không thấy đủ số.
 *   5. **Nợ quá hạn tự chặn ghi nợ mới** — chặn ở API, không ở màn hình.
 */
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { eq } from 'drizzle-orm'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from '../db/client'
import {
  corporateCharges,
  corporateCustomers,
  loyaltyEntries,
  orderLines,
  orders,
  parameters,
  payments,
  staff,
  staffRoles,
  tableSessions,
} from '../db/schema'
import { bootTestApp, type Fixtures } from './harness'

let app: NestFastifyApplication
let db: Db
let fx: Fixtures
let close: () => Promise<void>

const OFFICE_PASSWORD = 'sora-dev-2026'

let owner: string
/** R9 — soạn được, kích hoạt phải xin duyệt, SĐT thấy dạng che */
let marketer: string
/** R8 — kế toán, chủ của hồ sơ khách doanh nghiệp */
let accountant: string
/** R11 người duyệt lượt kích hoạt */
let chainLeadId: number
let chainLeadPin: string

const inject = (opts: Parameters<NestFastifyApplication['inject']>[0]) => app.inject(opts)
const bearer = (token: string) => ({ authorization: `Bearer ${token}` })

const TODAY = '2026-08-02'
const at = (date: string, hour: number, minute = 0) =>
  new Date(`${date}T${String(hour - 7).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00Z`)

async function officeLogin(email: string) {
  const res = await inject({
    method: 'POST',
    url: '/api/auth/office/login',
    payload: { branchId: fx.branchId, email, password: OFFICE_PASSWORD },
  })
  expect(res.statusCode, res.payload).toBe(201)
  return res.json<{ token: string }>().token
}

async function makeAccount(code: string, name: string, email: string, roles: string[]) {
  const passwordHash = await hash(OFFICE_PASSWORD)
  const [row] = await db
    .insert(staff)
    .values({ code, fullName: name, email, passwordHash })
    .returning({ id: staff.id })
  for (const role of roles) {
    await db.insert(staffRoles).values({ staffId: row!.id, roleCode: role, branchId: null })
  }
  return row!.id
}

interface OrderSpec {
  code: string
  sub: number
  date?: string
  hour?: number
  phone?: string | null
  name?: string | null
  channel?: 'pos' | 'web'
  paid?: boolean
  lines?: { dishId: string; code: string; name: string; qty: number; unitPrice: number }[]
}

async function makeOrder(spec: OrderSpec) {
  const date = spec.date ?? TODAY
  const hour = spec.hour ?? 12
  const [order] = await db
    .insert(orders)
    .values({
      displayCode: spec.code,
      branchId: fx.branchId,
      channel: spec.channel ?? 'web',
      type: spec.channel === 'pos' ? 'dinein' : 'delivery',
      status: 'done',
      customer: spec.phone ? { name: spec.name ?? 'Khách', phone: spec.phone } : null,
      moneySub: spec.sub,
      moneyTotal: spec.sub,
      paymentState: spec.paid === false ? 'unpaid' : 'paid',
      createdByKind: 'staff',
      createdById: String(fx.waiterId),
      businessDate: date,
      createdAt: at(date, hour),
      doneAt: at(date, hour, 40),
    })
    .returning({ id: orders.id })

  for (const line of spec.lines ?? []) {
    await db.insert(orderLines).values({
      orderId: order!.id,
      dishId: line.dishId,
      dishCode: line.code,
      nameSnapshot: line.name,
      qty: line.qty,
      unitPrice: line.unitPrice,
      priceTotal: line.qty * line.unitPrice,
      state: 'served',
    })
  }
  return order!.id
}

const draftPromotion = (over: Record<string, unknown> = {}) => ({
  code: 'KM-TEST',
  name: 'Chương trình thử',
  kind: 'percent',
  percentBp: 1000,
  startsOn: '2026-08-01',
  endsOn: '2026-08-31',
  ...over,
})

beforeAll(async () => {
  const boot = await bootTestApp()
  app = boot.app
  db = boot.db
  fx = boot.fixtures
  close = boot.close

  await makeAccount('CHU01', 'Chủ quán', 'chu@tokyosora.vn', ['R10'])
  await makeAccount('MKT01', 'Thảo', 'thao@tokyosora.vn', ['R9'])
  await makeAccount('KT01', 'Bình', 'binh@tokyosora.vn', ['R8'])

  // R11 duyệt bằng PIN nên phải có PIN, không chỉ có mật khẩu
  const [chain] = await db
    .insert(staff)
    .values({ code: 'CH01', fullName: 'Quản lý chuỗi', pinHash: await hash('2201') })
    .returning({ id: staff.id })
  chainLeadId = chain!.id
  chainLeadPin = '2201'
  await db.insert(staffRoles).values({ staffId: chainLeadId, roleCode: 'R11', branchId: fx.branchId })

  await db.insert(parameters).values([
    { key: 'loyalty.vndPerPoint', value: 10_000, unit: 'đồng / 1 điểm' },
    { key: 'loyalty.vndPerPointRedeem', value: 1_000, unit: 'đồng / 1 điểm' },
    { key: 'loyalty.redeemCapVndPerOrder', value: 100_000, unit: 'đồng' },
    { key: 'loyalty.expiryMonths', value: 12, unit: 'tháng' },
    { key: 'loyalty.tierSilverVnd', value: 5_000_000 },
    { key: 'loyalty.tierGoldVnd', value: 20_000_000 },
    { key: 'corporate.defaultCreditLimitVnd', value: 20_000_000, unit: 'đồng' },
    { key: 'corporate.blockAfterOverdueDays', value: 15, unit: 'ngày' },
    { key: 'corporate.einvoiceMode', value: 'per-bill' },
    { key: 'feedback.complaintStars', value: 3, unit: 'sao' },
    { key: 'feedback.responseHours', value: 24, unit: 'giờ' },
  ])

  owner = await officeLogin('chu@tokyosora.vn')
  marketer = await officeLogin('thao@tokyosora.vn')
  accountant = await officeLogin('binh@tokyosora.vn')
})

afterAll(async () => close?.())

// ============================================================ B11 · Khuyến mãi

describe('B11 — Soạn ≠ kích hoạt', () => {
  let promoId: number

  it('marketing soạn được chương trình', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/crm/promotions',
      headers: bearer(marketer),
      payload: draftPromotion({ code: 'KM-TRUA', name: 'Giảm 10% giờ trưa' }),
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().state).toBe('draft')
    promoId = res.json().id
  })

  it('marketing KHÔNG tự bật được — thiếu PIN người duyệt thì trả 400 requires_approval', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/crm/promotions/${promoId}/state`,
      headers: bearer(marketer),
      payload: { state: 'active' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().code).toBe('requires_approval')
  })

  it('có PIN của R11 thì bật được, và lượt duyệt để lại dấu vết trên chương trình', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/crm/promotions/${promoId}/state`,
      headers: bearer(marketer),
      payload: {
        state: 'active',
        approval: {
          approverStaffId: chainLeadId,
          approverPin: chainLeadPin,
          reason: 'Đã duyệt ngân sách tháng 8',
        },
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().state).toBe('active')
    expect(res.json().approvalId).not.toBeNull()
    // Người BẤM là marketing; người DUYỆT nằm trong bản ghi duyệt — hai vai khác nhau
    expect(res.json().activatedBy).not.toBeNull()
  })

  it('chương trình ĐANG CHẠY thì không sửa được — phải tạm dừng trước', async () => {
    const res = await inject({
      method: 'PUT',
      url: `/api/crm/promotions/${promoId}`,
      headers: bearer(marketer),
      payload: draftPromotion({ code: 'KM-TRUA', name: 'Đổi tên giữa chừng', percentBp: 9000 }),
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('tạm dừng')
  })

  it('tạm dừng thì KHÔNG cần ai duyệt — bắt xin phép để dừng là để chương trình lỗi chạy tiếp', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/crm/promotions/${promoId}/state`,
      headers: bearer(marketer),
      payload: { state: 'paused' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().state).toBe('paused')
  })

  it('chủ (R10) bật thẳng, không sinh bản ghi duyệt nào', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/crm/promotions/${promoId}/state`,
      headers: bearer(owner),
      payload: { state: 'active' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().approvalId).toBeNull()
  })

  it('kế toán không đụng được vào khuyến mãi', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/crm/promotions',
      headers: bearer(accountant),
    })
    expect(res.statusCode).toBe(403)
  })
})

describe('B11 — Không cộng dồn, tự áp mức lợi nhất', () => {
  let orderId: number
  let percentId: number
  let amountId: number

  beforeAll(async () => {
    orderId = await makeOrder({
      code: 'KM-ORDER-1',
      sub: 1_000_000,
      channel: 'pos',
      lines: [
        { dishId: 'bachibo', code: 'SORA-BO-001', name: 'Ba chỉ bò', qty: 2, unitPrice: 500_000 },
      ],
    })

    const create = async (body: Record<string, unknown>) => {
      const res = await inject({
        method: 'POST',
        url: '/api/crm/promotions',
        headers: bearer(owner),
        payload: draftPromotion(body),
      })
      expect(res.statusCode, res.payload).toBe(201)
      const id = res.json().id as number
      const on = await inject({
        method: 'POST',
        url: `/api/crm/promotions/${id}/state`,
        headers: bearer(owner),
        payload: { state: 'active' },
      })
      expect(on.statusCode, on.payload).toBe(201)
      return id
    }

    // 15% để hơn hẳn chương trình 10% của nhóm trên — bài này kiểm phép CHỌN,
    // và hai chương trình hoà nhau thì nó không kiểm được gì
    percentId = await create({ code: 'KM-15PT', name: 'Giảm 15%', percentBp: 1500 })
    amountId = await create({
      code: 'KM-50K',
      name: 'Giảm 50k',
      kind: 'amount',
      percentBp: null,
      amountVnd: 50_000,
    })
  })

  it('chấm được mọi chương trình đủ điều kiện và chọn cái giảm nhiều tiền nhất', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/crm/promotions/quote?order=${orderId}`,
      headers: bearer(owner),
    })
    expect(res.statusCode, res.payload).toBe(200)
    const body = res.json()
    expect(body.eligible.length).toBeGreaterThanOrEqual(2)
    expect(body.best.promotionId).toBe(percentId)
    expect(body.best.discountVnd).toBe(150_000)
  })

  it('đơn đã hưởng một chương trình thì chương trình thứ hai bị chặn ở CSDL', async () => {
    const first = await inject({
      method: 'POST',
      url: '/api/crm/promotions/redeem',
      headers: bearer(owner),
      payload: { orderId, promotionId: percentId },
    })
    expect(first.statusCode, first.payload).toBe(201)
    expect(first.json().discountVnd).toBe(150_000)

    const second = await inject({
      method: 'POST',
      url: '/api/crm/promotions/redeem',
      headers: bearer(owner),
      payload: { orderId, promotionId: amountId },
    })
    expect(second.statusCode).toBe(409)
    expect(second.json().message).toContain('không cộng dồn')
  })

  it('lượt hưởng chảy thẳng vào khối chương trình của B8', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/reports/sets?branch=${fx.branchId}&kind=tuy-chon&from=${TODAY}&to=${TODAY}`,
      headers: bearer(owner),
    })
    expect(res.statusCode, res.payload).toBe(200)
    const row = res.json().promotions.find((p: { code: string }) => p.code === 'KM-15PT')
    expect(row.uses).toBe(1)
    expect(row.discountVnd).toBe(150_000)
  })
})

describe('B11 — Lô voucher và giới hạn lượt', () => {
  let promoId: number
  let code: string

  beforeAll(async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/crm/promotions',
      headers: bearer(owner),
      payload: draftPromotion({
        code: 'KM-VOUCHER',
        name: 'Voucher 30k',
        kind: 'amount',
        percentBp: null,
        amountVnd: 30_000,
        requiresVoucher: true,
      }),
    })
    promoId = res.json().id
  })

  it('chương trình cần mã mà chưa phát mã nào thì KHÔNG bật được', async () => {
    const res = await inject({
      method: 'POST',
      url: `/api/crm/promotions/${promoId}/state`,
      headers: bearer(owner),
      payload: { state: 'active' },
    })
    expect(res.statusCode).toBe(400)
    expect(res.json().message).toContain('chưa phát mã nào')
  })

  it('phát lô mã rồi bật được', async () => {
    const batch = await inject({
      method: 'POST',
      url: '/api/crm/promotions/vouchers',
      headers: bearer(owner),
      payload: { promotionId: promoId, prefix: 'SORA8', count: 3, maxUses: 1 },
    })
    expect(batch.statusCode, batch.payload).toBe(201)
    expect(batch.json()).toHaveLength(3)
    code = batch.json()[0].code
    expect(code).toBe('SORA8-0001')

    const on = await inject({
      method: 'POST',
      url: `/api/crm/promotions/${promoId}/state`,
      headers: bearer(owner),
      payload: { state: 'active' },
    })
    expect(on.statusCode, on.payload).toBe(201)
  })

  it('không có mã thì chương trình cần mã không ăn', async () => {
    const orderId = await makeOrder({ code: 'KM-ORDER-2', sub: 500_000, channel: 'pos' })
    const res = await inject({
      method: 'GET',
      url: `/api/crm/promotions/quote?order=${orderId}`,
      headers: bearer(owner),
    })
    const rejected = res
      .json()
      .rejected.find((r: { code: string }) => r.code === 'KM-VOUCHER')
    expect(rejected.reason).toBe('thieu-ma-voucher')
  })

  it('một mã một lượt: đơn thứ hai dùng lại mã đó bị từ chối', async () => {
    const first = await makeOrder({ code: 'KM-ORDER-3', sub: 500_000, channel: 'pos' })
    const ok = await inject({
      method: 'POST',
      url: '/api/crm/promotions/redeem',
      headers: bearer(owner),
      payload: { orderId: first, promotionId: promoId, voucherCode: code },
    })
    expect(ok.statusCode, ok.payload).toBe(201)

    const second = await makeOrder({ code: 'KM-ORDER-4', sub: 500_000, channel: 'pos' })
    const denied = await inject({
      method: 'POST',
      url: '/api/crm/promotions/redeem',
      headers: bearer(owner),
      payload: { orderId: second, promotionId: promoId, voucherCode: code },
    })
    expect(denied.statusCode).toBe(409)
    expect(denied.json().message).toContain('hết lượt')
  })
})

// ============================================================== B12 · Sổ khách

describe('B12 — Gom theo số điện thoại, che ba số giữa', () => {
  beforeAll(async () => {
    await makeOrder({ code: 'SK-001', sub: 900_000, phone: '0912345678', name: 'Anh Tuấn' })
    // Cùng người, số viết khác định dạng — vẫn phải là MỘT hồ sơ
    await makeOrder({ code: 'SK-002', sub: 600_000, phone: '0912.345.678', hour: 19 })
    /**
     * Hồ sơ sinh TỰ ĐỘNG ở ba cửa: đặt bàn, đơn online, và lượt thu tiền (bài
     * "thu tiền mặt…" bên dưới kiểm đúng cửa thứ ba). Hai đơn trên nạp thẳng vào
     * CSDL nên không đi qua cửa nào, vì vậy ở đây khai hồ sơ bằng đúng cửa tay
     * của Office — phần cần kiểm ở nhóm này là GOM và CHE, không phải cửa vào.
     */
    await inject({
      method: 'PUT',
      url: '/api/crm/customers',
      headers: bearer(owner),
      payload: { phone: '0912 345 678', name: 'Anh Tuấn', allergies: null, note: null },
    })
  })

  it('hai đơn cùng số ở hai định dạng gom về một hồ sơ', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/crm/customers?search=0912345678',
      headers: bearer(owner),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json()).toHaveLength(1)
    expect(res.json()[0]).toMatchObject({
      phone: '0912345678',
      phoneMasked: false,
      visits: 2,
      spendTotalVnd: 1_500_000,
    })
  })

  it('marketing thấy Sổ khách nhưng SĐT che ba số giữa', async () => {
    const res = await inject({
      method: 'GET',
      url: '/api/crm/customers?search=Tu',
      headers: bearer(marketer),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json()[0]).toMatchObject({ phone: '091***5678', phoneMasked: true })
  })

  it('marketing KHÔNG sửa được hồ sơ — sửa cần thấy đủ số', async () => {
    const res = await inject({
      method: 'PUT',
      url: '/api/crm/customers',
      headers: bearer(marketer),
      payload: { phone: '0912345678', name: 'Tuấn', allergies: 'Hải sản', note: null },
    })
    expect(res.statusCode).toBe(403)
  })

  it('dị ứng lưu được và hiện trong hồ sơ đầy đủ', async () => {
    const saved = await inject({
      method: 'PUT',
      url: '/api/crm/customers',
      headers: bearer(owner),
      payload: { phone: '0912345678', name: 'Anh Tuấn', allergies: 'Dị ứng hải sản', note: null },
    })
    expect(saved.statusCode, saved.payload).toBe(200)

    const profile = await inject({
      method: 'GET',
      url: `/api/crm/customers/${saved.json().id}`,
      headers: bearer(owner),
    })
    expect(profile.json().allergies).toBe('Dị ứng hải sản')
    expect(profile.json().visits).toHaveLength(2)
  })
})

// ============================================================ B14 · Tích điểm

describe('B14 — Điểm chỉ sinh từ sự kiện thanh toán', () => {
  it('KHÔNG có route nào cộng điểm ngoài luồng: R10 phải đi qua cửa điều chỉnh có lý do', async () => {
    const list = await inject({
      method: 'GET',
      url: '/api/crm/customers?search=0912345678',
      headers: bearer(owner),
    })
    const customerId = list.json()[0].id

    const noReason = await inject({
      method: 'POST',
      url: '/api/crm/loyalty/adjust',
      headers: bearer(owner),
      payload: { customerId, points: 100, reason: '' },
    })
    expect(noReason.statusCode).toBe(400)
  })

  it('marketing và kế toán không điều chỉnh điểm được — chỉ R11/R10', async () => {
    for (const token of [marketer, accountant]) {
      const res = await inject({
        method: 'POST',
        url: '/api/crm/loyalty/adjust',
        headers: bearer(token),
        payload: { customerId: 1, points: 100, reason: 'Bù cho khách' },
      })
      expect(res.statusCode).toBe(403)
    }
  })

  it('thu tiền mặt một bàn có số điện thoại thì điểm sinh ngay trong lượt thu', async () => {
    // Mở ca để P10 thu được tiền
    const shift = await inject({
      method: 'POST',
      url: `/api/shifts`,
      headers: bearer(owner),
      payload: { branchId: fx.branchId, openingCash: 0 },
    })
    expect(shift.statusCode, shift.payload).toBe(201)

    const [session] = await db
      .insert(tableSessions)
      .values({
        branchId: fx.branchId,
        tableId: fx.spareTableId,
        status: 'open',
        guestCount: 2,
        businessDate: TODAY,
      })
      .returning({ id: tableSessions.id })

    const [order] = await db
      .insert(orders)
      .values({
        displayCode: 'TD-001',
        branchId: fx.branchId,
        channel: 'pos',
        type: 'dinein',
        status: 'done',
        tableSessionId: session!.id,
        customer: { name: 'Chị Mai', phone: '0987654321' },
        moneySub: 950_000,
        moneyTotal: 950_000,
        createdByKind: 'staff',
        createdById: String(fx.waiterId),
        businessDate: TODAY,
      })
      .returning({ id: orders.id })

    const pay = await inject({
      method: 'POST',
      url: `/api/table-sessions/${session!.id}/pay/cash`,
      headers: bearer(owner),
      payload: { amount: 950_000 },
    })
    expect(pay.statusCode, pay.payload).toBe(201)

    const entries = await db
      .select()
      .from(loyaltyEntries)
      .where(eq(loyaltyEntries.orderId, order!.id))
    expect(entries).toHaveLength(1)
    // 950.000đ ÷ 10.000đ/điểm, làm tròn XUỐNG
    expect(entries[0]).toMatchObject({ kind: 'earn', points: 95, baseVnd: 950_000 })
  })

  it('hồ sơ khách hiện số dư, hạng và mốc lên hạng tiếp theo', async () => {
    const list = await inject({
      method: 'GET',
      url: '/api/crm/customers?search=0987654321',
      headers: bearer(owner),
    })
    const row = list.json()[0]
    expect(row.pointsBalance).toBe(95)
    expect(row.tier).toBe('dong')

    const profile = await inject({
      method: 'GET',
      url: `/api/crm/customers/${row.id}`,
      headers: bearer(owner),
    })
    expect(profile.json().loyalty.next).toMatchObject({ tier: 'bac' })
    expect(profile.json().loyalty.entries[0].expiresOn).toBe('2027-08-02')
  })

  it('trần đổi mỗi giao dịch cắt trước cả khi khách còn thừa điểm', async () => {
    const list = await inject({
      method: 'GET',
      url: '/api/crm/customers?search=0987654321',
      headers: bearer(owner),
    })
    const customerId = list.json()[0].id

    const res = await inject({
      method: 'GET',
      url: `/api/crm/loyalty/quote?customerId=${customerId}&points=95&payableVnd=5000000&branchId=${fx.branchId}`,
      headers: bearer(owner),
    })
    expect(res.statusCode, res.payload).toBe(200)
    // Trần 100.000đ ÷ 1.000đ/điểm = 100 điểm ⇒ 95 điểm của khách vẫn đổi hết được
    expect(res.json()).toMatchObject({ points: 95, discountVnd: 95_000, limitedBy: null })
  })

  it('huỷ đơn đã tích điểm thì điểm bị thu hồi', async () => {
    const orderId = await makeOrder({
      code: 'TD-HUY',
      sub: 500_000,
      phone: '0911222333',
      channel: 'web',
    })
    // Đơn online tích điểm qua luồng thu tiền; ở đây nạp thẳng dòng earn để kiểm
    // đúng phần THU HỒI, không kiểm lại phần tích
    const created = await inject({
      method: 'PUT',
      url: '/api/crm/customers',
      headers: bearer(owner),
      payload: { phone: '0911222333', name: 'Khách huỷ', allergies: null, note: null },
    })
    await db.insert(loyaltyEntries).values({
      customerId: created.json().id,
      kind: 'earn',
      points: 50,
      orderId,
      branchId: fx.branchId,
      baseVnd: 500_000,
      businessDate: TODAY,
    })
    await db.update(orders).set({ status: 'confirmed' }).where(eq(orders.id, orderId))

    const cancel = await inject({
      method: 'POST',
      url: `/api/orders/${orderId}/cancel`,
      headers: bearer(owner),
      payload: { reason: 'Khách đổi ý' },
    })
    expect(cancel.statusCode, cancel.payload).toBe(201)

    const after = await inject({
      method: 'GET',
      url: '/api/crm/customers?search=0911222333',
      headers: bearer(owner),
    })
    expect(after.json()[0].pointsBalance).toBe(0)
  })
})

// ============================================================= B13 · Phản hồi

describe('B13 — Khối đánh giá 1 chạm và hàng đợi khiếu nại', () => {
  let orderId: number
  let feedbackId: number

  beforeAll(async () => {
    orderId = await makeOrder({ code: 'PH-001', sub: 700_000, phone: '0900111222' })
  })

  it('khách gửi đánh giá KHÔNG cần đăng nhập — họ đang cầm mã đơn', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/crm/feedback',
      payload: { orderId, stars: 2, comment: 'Nầm bò dai', source: 'online' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json()).toMatchObject({ stars: 2, isComplaint: true })
    feedbackId = res.json().id
  })

  it('bấm lại thì SỬA lượt cũ, không sinh lượt thứ hai', async () => {
    const again = await inject({
      method: 'POST',
      url: '/api/crm/feedback',
      payload: { orderId, stars: 1, comment: 'Đổi ý, tệ hơn', source: 'online' },
    })
    expect(again.statusCode, again.payload).toBe(201)
    expect(again.json().id).toBe(feedbackId)
  })

  it('hàng đợi nêu được món trong bill và cờ quá hạn', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/crm/feedback?branch=${fx.branchId}`,
      headers: bearer(marketer),
    })
    expect(res.statusCode, res.payload).toBe(200)
    const item = res.json().items.find((i: { id: number }) => i.id === feedbackId)
    expect(item).toMatchObject({ stars: 1, state: 'new', overdue: false })
    expect(item.dueAt).not.toBeNull()
  })

  it('đóng khiếu nại phải ghi đã làm gì', async () => {
    const empty = await inject({
      method: 'POST',
      url: `/api/crm/feedback/${feedbackId}/resolve`,
      headers: bearer(marketer),
      payload: { resolution: '   ' },
    })
    expect(empty.statusCode).toBe(400)

    const done = await inject({
      method: 'POST',
      url: `/api/crm/feedback/${feedbackId}/resolve`,
      headers: bearer(marketer),
      payload: { resolution: 'Đã gọi xin lỗi, tặng phiếu 100k' },
    })
    expect(done.statusCode, done.payload).toBe(201)
    expect(done.json().state).toBe('resolved')
  })

  it('điểm trung bình gom được theo chi nhánh — con số B1 đọc', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/crm/feedback/summary?branch=${fx.branchId}&from=${TODAY}&to=${TODAY}`,
      headers: bearer(marketer),
    })
    expect(res.statusCode, res.payload).toBe(200)
    expect(res.json().overall).toMatchObject({ count: 1, average: 1, oneStar: 1, open: 0 })
  })

  it('kế toán không vào hàng đợi phản hồi', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/crm/feedback?branch=${fx.branchId}`,
      headers: bearer(accountant),
    })
    expect(res.statusCode).toBe(403)
  })
})

// ==================================================== B15 · Khách doanh nghiệp

describe('B15 — Hạn mức, tuổi nợ và cái chặn', () => {
  let companyId: number

  it('kế toán khai hồ sơ; marketing thì không', async () => {
    const denied = await inject({
      method: 'POST',
      url: '/api/crm/corporate',
      headers: bearer(marketer),
      payload: { code: 'CT-A', name: 'Công ty A', taxCode: '0101234567', creditLimitVnd: 1 },
    })
    expect(denied.statusCode).toBe(403)

    const res = await inject({
      method: 'POST',
      url: '/api/crm/corporate',
      headers: bearer(accountant),
      payload: {
        code: 'CT-FPT',
        name: 'Công ty FPT Cầu Giấy',
        taxCode: '0101234567',
        contactName: 'Chị Hà',
        creditLimitVnd: 3_000_000,
        paymentTermDays: 30,
      },
    })
    expect(res.statusCode, res.payload).toBe(201)
    companyId = res.json().id
  })

  it('mã số thuế sai định dạng bị chặn ngay ở cửa', async () => {
    const res = await inject({
      method: 'POST',
      url: '/api/crm/corporate',
      headers: bearer(accountant),
      payload: { code: 'CT-X', name: 'Sai MST', taxCode: '123', creditLimitVnd: 0 },
    })
    expect(res.statusCode).toBe(400)
  })

  /**
   * §4.2b: ghi nợ tại P10 là việc của R2 (có R7 duyệt) — kế toán KHÔNG đứng quầy.
   * Họ khai hồ sơ và gạch nợ, hai việc khác hẳn việc bấm bill.
   */
  it('kế toán khai hồ sơ được nhưng KHÔNG ghi nợ tại quầy được', async () => {
    const orderId = await makeOrder({ code: 'DN-000', sub: 100_000, channel: 'pos', paid: false })
    const res = await inject({
      method: 'POST',
      url: '/api/crm/corporate/charges',
      headers: bearer(accountant),
      payload: { corporateId: companyId, orderId },
    })
    expect(res.statusCode).toBe(403)
  })

  it('ghi nợ một bill: doanh thu vào ngay, sổ quỹ KHÔNG thấy đồng nào', async () => {
    const orderId = await makeOrder({
      code: 'DN-001',
      sub: 2_000_000,
      channel: 'pos',
      paid: false,
    })
    const res = await inject({
      method: 'POST',
      url: '/api/crm/corporate/charges',
      headers: bearer(owner),
      payload: { corporateId: companyId, orderId, signer: 'Chị Hà' },
    })
    expect(res.statusCode, res.payload).toBe(201)
    expect(res.json().amountVnd).toBe(2_000_000)

    // Bill xong với khách…
    const [order] = await db.select().from(orders).where(eq(orders.id, orderId))
    expect(order!.paymentState).toBe('paid')
    // …nhưng không có lượt trả nào: tiền chưa về thì F1 không được thấy gì
    const paid = await db.select().from(payments).where(eq(payments.orderId, orderId))
    expect(paid).toHaveLength(0)
  })

  it('bill thứ hai vượt hạn mức bị chặn', async () => {
    const orderId = await makeOrder({
      code: 'DN-002',
      sub: 2_000_000,
      channel: 'pos',
      paid: false,
    })
    const res = await inject({
      method: 'POST',
      url: '/api/crm/corporate/charges',
      headers: bearer(owner),
      payload: { corporateId: companyId, orderId },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('Vượt hạn mức nợ')
  })

  it('quá hạn quá N ngày thì chặn ghi nợ mới, kể cả khi còn hạn mức', async () => {
    await db
      .update(corporateCustomers)
      .set({ creditLimitVnd: 50_000_000 })
      .where(eq(corporateCustomers.id, companyId))
    // Đẩy dòng nợ hiện có thành quá hạn 40 ngày
    await db
      .update(corporateCharges)
      .set({ dueOn: '2026-06-01', chargedOn: '2026-05-01' })
      .where(eq(corporateCharges.corporateId, companyId))

    const orderId = await makeOrder({
      code: 'DN-003',
      sub: 500_000,
      channel: 'pos',
      paid: false,
    })
    const res = await inject({
      method: 'POST',
      url: '/api/crm/corporate/charges',
      headers: bearer(owner),
      payload: { corporateId: companyId, orderId },
    })
    expect(res.statusCode).toBe(409)
    expect(res.json().message).toContain('quá hạn')
  })

  it('bảng kê chia đúng khoang tuổi nợ và nêu số ngày quá hạn từng dòng', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/crm/corporate/${companyId}/statement?from=2026-05-01&to=2026-08-31`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(200)
    const body = res.json()
    expect(body.charges).toHaveLength(1)
    expect(body.charges[0].remainingVnd).toBe(2_000_000)
    expect(body.charges[0].overdueDays).toBeGreaterThan(30)
    expect(body.aging.over60Vnd + body.aging.d31to60Vnd).toBe(2_000_000)
  })

  it('gạch nợ quá số còn nợ bị chặn; gạch đúng thì mở lại cửa ghi nợ', async () => {
    const statement = await inject({
      method: 'GET',
      url: `/api/crm/corporate/${companyId}/statement?from=2026-05-01&to=2026-08-31`,
      headers: bearer(accountant),
    })
    const chargeId = statement.json().charges[0].id

    const tooMuch = await inject({
      method: 'POST',
      url: '/api/crm/corporate/settlements',
      headers: bearer(accountant),
      payload: { chargeId, amountVnd: 3_000_000, paidOn: TODAY },
    })
    expect(tooMuch.statusCode).toBe(400)
    expect(tooMuch.json().message).toContain('Vượt số còn nợ')

    const ok = await inject({
      method: 'POST',
      url: '/api/crm/corporate/settlements',
      headers: bearer(accountant),
      payload: { chargeId, amountVnd: 2_000_000, paidOn: TODAY },
    })
    expect(ok.statusCode, ok.payload).toBe(201)

    const orderId = await makeOrder({ code: 'DN-004', sub: 400_000, channel: 'pos', paid: false })
    const again = await inject({
      method: 'POST',
      url: '/api/crm/corporate/charges',
      headers: bearer(owner),
      payload: { corporateId: companyId, orderId },
    })
    expect(again.statusCode, again.payload).toBe(201)
  })

  it('xoá nợ phải ghi lý do', async () => {
    const statement = await inject({
      method: 'GET',
      url: `/api/crm/corporate/${companyId}/statement?from=2026-05-01&to=2026-08-31`,
      headers: bearer(accountant),
    })
    const open = statement
      .json()
      .charges.find((c: { remainingVnd: number }) => c.remainingVnd > 0)

    const noReason = await inject({
      method: 'POST',
      url: '/api/crm/corporate/settlements',
      headers: bearer(accountant),
      payload: { chargeId: open.id, kind: 'write-off', amountVnd: 100_000, paidOn: TODAY },
    })
    expect(noReason.statusCode).toBe(400)
  })

  it('tab Phải thu của F5 đọc đúng con số này, không tính lại', async () => {
    const res = await inject({
      method: 'GET',
      url: `/api/accounting/debts?branch=${fx.branchId}&from=2026-08-01&to=2026-08-31`,
      headers: bearer(accountant),
    })
    expect(res.statusCode, res.payload).toBe(200)
    const companies = res.json().receivable.companies
    expect(companies, res.payload).toHaveLength(1)
    expect(companies[0].code).toBe('CT-FPT')
    expect(companies[0].aging.totalVnd).toBe(400_000)
  })
})
