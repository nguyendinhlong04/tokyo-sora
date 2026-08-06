import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  ROLES,
  can,
  checkApproval,
  checkPermission,
  isPermitted,
  needsApproval,
  permissionMatrix,
  type ActionKey,
  type Permission,
  type Role,
} from './permissions'

/**
 * Fixture chép TAY từ bảng §4.2 theo đúng thứ tự cột trong tài liệu
 * (R0 R1 R2 R3 R4 R5 R6 R7 R8 R9 R11 R12 R10) — chép độc lập với bảng cài đặt để
 * bắt lỗi gõ nhầm. '.' = – (không được) · 'x' = ✓ · 'a' = △
 */
const DOC_COLUMN_ORDER: Role[] = [
  'R0', 'R1', 'R2', 'R3', 'R4', 'R5', 'R6', 'R7', 'R8', 'R9', 'R11', 'R12', 'R10',
]

const DOC_ROWS: [ActionKey, string][] = [
  ['menu.view-price', 'xxxxxx.xxxxxx'],
  ['order.create', 'xxx....x....x'],
  ['order.line.edit-unsent', 'xxx....x....x'],
  ['order.line.void-sent', '.aa..x.x....x'],
  ['table.move-merge-split', '.xxx...x....x'],
  ['bill.discount-upto-10', '..a....x....x'],
  ['bill.discount-over-10', '.......a....x'],
  ['bill.void-printed', '..a....x....x'],
  ['payment.self-serve', 'x............'],
  ['payment.reconcile-self-serve', '.xx....xx...x'],
  ['table.close-after-paid', '.xx....x....x'],
  ['shift.drawer-close-count', '..x....xx...x'],
  ['kds.change-item-state', '....xx.x....x'],
  ['menu.mark-sold-out', '.a..ax.x....x'],
  ['online-order.confirm', '..x....x...xx'],
  ['online-order.assign-shipper-or-cancel', '..x....x...xx'],
  ['reservation.confirm-or-noshow', '.x.x...x...xx'],
  ['cost.view-recipe', '....xxxxx.x.x'],
  ['recipe.edit', '.....x.a..x.x'],
  ['menu.edit-price', '.......a..x.x'],
  ['stock.receive', '......xx....x'],
  ['stock.write-off', '.....aax....x'],
  ['stock.close-count', '......axx...x'],
  ['report.branch-revenue', '.......xx.x.x'],
  ['report.margin-foodcost', '.....x.xx.x.x'],
  ['report.compare-branches', '........x.x.x'],
  ['accounting.ledger-close-period', '........x...x'],
  ['einvoice.void-replace-adjust', '.......ax...x'],
  ['cms.edit', '.........x..x'],
  ['admin.manage-accounts-roles', '............x'],
  ['audit.view-log', '.......xx.x.x'],
]

/**
 * Bảng §4.2b (Nhân sự) có BỘ CỘT KHÁC: `NV` gộp R1–R6, rồi R7 R8 R13 R11 R10.
 * Chép riêng thay vì nhồi vào bảng trên, đúng như tài liệu trình bày.
 */
const HR_COLUMN_ORDER: (Role | 'NV')[] = ['NV', 'R7', 'R8', 'R13', 'R11', 'R10']
const NV_ROLES: Role[] = ['R1', 'R2', 'R3', 'R4', 'R5', 'R6']

const HR_ROWS: [ActionKey, string][] = [
  ['staff.view-own-record', 'xxxxxx'],
  ['schedule.publish', '.x.x.x'],
  ['timesheet.edit-manual', '.a.x.x'],
  ['timesheet.close-period', '...x.x'],
  ['payroll.view-others', '..xx.x'],
  ['payroll.configure', '...x.x'],
  ['payroll.compute-draft', '...x.x'],
  // Dòng "Duyệt & phát lương | – | – | kiểm | trình | – | ✓" tách làm ba bước
  ['payroll.submit', '...x.x'],
  ['payroll.check', '..x..x'],
  ['payroll.approve-pay', '.....x'],
  // Chi phí & tài sản
  ['expense.record-petty', '.xx..x'],
  ['expense.record-over-limit', '.ax..x'],
  ['expense.approve', '..x..x'],
  ['asset.ledger', '..x..x'],
  ['report.pnl-full', '..x.xx'],
  ['report.pnl-branch-summary', '.xx.xx'],
]

/**
 * Hai đoạn VĂN XUÔI cuối §4.2b — "Quyền marketing (R9)" và "Quyền tích điểm &
 * công nợ". Tài liệu không kẻ bảng cho chúng, nên fixture này chép lại kèm
 * nguyên văn mệnh đề để đối chiếu được bằng mắt: cột thứ ba là câu trong tài
 * liệu, cột thứ hai là ô tương ứng.
 *
 * Bộ cột riêng — chỉ tám vai trò mà hai đoạn đó nhắc tới:
 */
const CRM_COLUMN_ORDER: Role[] = ['R2', 'R3', 'R7', 'R8', 'R9', 'R11', 'R12', 'R10']

const CRM_ROWS: [ActionKey, string, string][] = [
  ['promo.compose', '....xx.x', 'soạn khuyến mãi/voucher … được phép'],
  ['promo.activate', '....ax.x', 'kích hoạt khuyến mãi cần R11/R10 duyệt (vì đụng giá)'],
  ['feedback.respond', '..x.xx.x', 'trả lời phản hồi khách được phép'],
  ['customer.view-book', 'xxxxxxxx', 'xem Sổ khách được nhưng SĐT che 3 số giữa'],
  ['customer.view-phone-full', 'xxxx.xxx', '… "vai trò không cần thấy" thì bị che'],
  ['loyalty.redeem-at-pos', 'x.x....x', 'đổi điểm tại quầy — R2 được, trong trần mỗi giao dịch'],
  ['loyalty.adjust-manual', '.....x.x', 'điều chỉnh điểm tay — chỉ R11/R10, kèm lý do, ghi A7'],
  ['corporate.charge-at-pos', 'a.x....x', 'ghi nợ công ty tại P10 — R2 thao tác nhưng cần R7 duyệt'],
  ['corporate.edit-profile', '...x.x.x', 'hồ sơ khách doanh nghiệp — R8/R11 sửa'],
  ['corporate.settle-writeoff', '...x...x', 'gạch nợ / xoá nợ — R8, mức lớn R10'],
]

const SYMBOL: Record<string, Permission> = { '.': 'deny', x: 'allow', a: 'approve' }

describe('Ma trận khớp 1:1 với bảng §4.2 trong tài liệu', () => {
  it('mã hoá đủ 31 hành động của §4.2 và 16 + 10 của §4.2b, cộng phần bổ sung', () => {
    expect(DOC_ROWS).toHaveLength(31)
    expect(HR_ROWS).toHaveLength(16)
    expect(CRM_ROWS).toHaveLength(10)

    /**
     * 57 dòng của tài liệu + `order.mark-served`.
     *
     * Tài liệu §4.2 KHÔNG có dòng nào cho việc mang món ra bàn — thiếu sót lộ ra
     * khi dựng nút "Đã mang ra": không có khoá quyền nào đúng, nên nó phải mượn
     * tạm khoá của bếp và hoá ra phục vụ lại không bấm được. Thêm dòng này vào
     * tài liệu khi có dịp; con số dưới đây là chỗ nhắc.
     */
    expect(Object.keys(ACTIONS)).toHaveLength(58)
  })

  it.each(DOC_ROWS)('%s khớp từng ô', (action, row) => {
    expect(row).toHaveLength(DOC_COLUMN_ORDER.length)
    DOC_COLUMN_ORDER.forEach((role, i) => {
      expect(checkPermission(action, [role]), `${action} × ${role}`).toBe(SYMBOL[row[i]!])
    })
  })

  it('R13 (quản lý nhân sự) KHÔNG có quyền vận hành nào — chỉ nhân sự', () => {
    const hrKeys = new Set(HR_ROWS.map(([action]) => action))
    for (const [action] of DOC_ROWS) {
      expect(checkPermission(action, ['R13']), action).toBe('deny')
    }
    const allowed = (Object.keys(ACTIONS) as ActionKey[]).filter((a) => isPermitted(a, ['R13']))
    expect(allowed.every((a) => hrKeys.has(a))).toBe(true)
  })
})

describe('Ma trận khớp 1:1 với bảng §4.2b — Nhân sự & Chi phí', () => {
  it.each(HR_ROWS)('%s khớp từng ô', (action, row) => {
    expect(row).toHaveLength(HR_COLUMN_ORDER.length)
    HR_COLUMN_ORDER.forEach((column, i) => {
      const expected = SYMBOL[row[i]!]
      if (column === 'NV') {
        // Cột gộp: MỌI vai trò vận hành R1–R6 phải ra cùng một mức
        for (const role of NV_ROLES) {
          expect(checkPermission(action, [role]), `${action} × ${role}`).toBe(expected)
        }
      } else {
        expect(checkPermission(action, [column]), `${action} × ${column}`).toBe(expected)
      }
    })
  })

  it('NGUYÊN TẮC CỨNG 4: quản lý ca thấy CÔNG nhưng không thấy LƯƠNG', () => {
    // R7 xếp lịch được, sửa công được (có duyệt)…
    expect(can('schedule.publish', ['R7'])).toBe(true)
    expect(needsApproval('timesheet.edit-manual', ['R7'])).toBe(true)
    // …nhưng không chạm được con số lương của bất kỳ ai
    expect(isPermitted('payroll.view-others', ['R7'])).toBe(false)
    expect(isPermitted('payroll.compute-draft', ['R7'])).toBe(false)
    expect(isPermitted('payroll.approve-pay', ['R7'])).toBe(false)
  })

  it('chỉ R8, R13, R10 chạm được số lương cá nhân', () => {
    const seers = ROLES.filter((r) => isPermitted('payroll.view-others', [r]))
    expect(seers).toEqual(['R8', 'R10', 'R13'])
  })

  it('quản lý ca đọc được Lãi/Lỗ chi nhánh nhưng KHÔNG có bản chi tiết lương', () => {
    expect(can('report.pnl-branch-summary', ['R7'])).toBe(true)
    expect(isPermitted('report.pnl-full', ['R7'])).toBe(false)
    // Quản lý chuỗi thì ngược lại với dòng kế toán của §4.2: đọc được bản đầy đủ
    expect(can('report.pnl-full', ['R11'])).toBe(true)
  })

  it('phát lương là việc của chủ: R13 trình, R8 kiểm, không ai trong hai người đó duyệt', () => {
    expect(can('payroll.submit', ['R13'])).toBe(true)
    expect(can('payroll.check', ['R8'])).toBe(true)
    expect(isPermitted('payroll.approve-pay', ['R13'])).toBe(false)
    expect(isPermitted('payroll.approve-pay', ['R8'])).toBe(false)
    expect(can('payroll.approve-pay', ['R10'])).toBe(true)
  })
})

describe('Hai đoạn văn xuôi §4.2b — Marketing · Tích điểm · Công nợ khách DN', () => {
  it.each(CRM_ROWS)('%s khớp từng ô — "%s"', (action, row) => {
    expect(row).toHaveLength(CRM_COLUMN_ORDER.length)
    CRM_COLUMN_ORDER.forEach((role, i) => {
      expect(checkPermission(action, [role]), `${action} × ${role}`).toBe(SYMBOL[row[i]!])
    })
  })

  it('kích hoạt khuyến mãi là đụng giá: R9 xin, chỉ R11 hoặc R10 duyệt được', () => {
    const marketer = { id: 'nv-20', roles: ['R9'] as Role[] }
    expect(needsApproval('promo.activate', marketer.roles)).toBe(true)
    expect(checkApproval('promo.activate', marketer, { id: 'nv-21', roles: ['R11'] })).toEqual({
      ok: true,
    })
    expect(checkApproval('promo.activate', marketer, { id: 'nv-22', roles: ['R10'] })).toEqual({
      ok: true,
    })
    // Quản lý ca không đụng được giá bán nên cũng không mở được khuyến mãi
    expect(checkApproval('promo.activate', marketer, { id: 'nv-09', roles: ['R7'] })).toEqual({
      ok: false,
      code: 'nguoi-duyet-khong-du-quyen',
    })
  })

  it('ghi nợ công ty: thu ngân thao tác, quản lý ca duyệt — thu ngân khác không duyệt được', () => {
    const cashier = { id: 'nv-02', roles: ['R2'] as Role[] }
    expect(
      checkApproval('corporate.charge-at-pos', cashier, { id: 'nv-09', roles: ['R7'] }),
    ).toEqual({ ok: true })
    expect(
      checkApproval('corporate.charge-at-pos', cashier, { id: 'nv-03', roles: ['R2'] }),
    ).toEqual({ ok: false, code: 'nguoi-duyet-khong-du-quyen' })
  })

  it('điểm không cộng tay được bởi ai ngoài R11 · R10', () => {
    const adjusters = ROLES.filter((r) => isPermitted('loyalty.adjust-manual', [r]))
    expect(adjusters).toEqual(['R10', 'R11'])
  })

  it('marketing thấy Sổ khách nhưng KHÔNG thấy đủ số điện thoại', () => {
    expect(can('customer.view-book', ['R9'])).toBe(true)
    expect(isPermitted('customer.view-phone-full', ['R9'])).toBe(false)
    // Lễ tân thì ngược lại — họ là người gọi cho khách
    expect(can('customer.view-phone-full', ['R3'])).toBe(true)
  })
})

describe('Bất biến của mô hình quyền', () => {
  it('chủ (R10) làm được mọi việc quản trị, không việc nào phải xin duyệt', () => {
    // `payment.self-serve` là NGOẠI LỆ duy nhất và đúng theo tài liệu: đó không
    // phải đặc quyền mà là luồng "khách tự thanh toán tại bàn" — chỉ R0 đi được.
    for (const action of Object.keys(ACTIONS) as ActionKey[]) {
      if (action === 'payment.self-serve') continue
      expect(can(action, ['R10']), action).toBe(true)
    }
    expect(isPermitted('payment.self-serve', ['R10'])).toBe(false)
  })

  it('khách (R0) chỉ chạm được đúng 4 việc của mình', () => {
    const allowed = (Object.keys(ACTIONS) as ActionKey[]).filter((a) => isPermitted(a, ['R0']))
    expect(allowed).toEqual([
      'menu.view-price',
      'order.create',
      'order.line.edit-unsent',
      'payment.self-serve',
    ])
  })

  it('quyền xem giá vốn TÁCH khỏi quyền xem doanh thu (quy tắc cứng thứ 3)', () => {
    // Thủ kho thấy giá vốn nhưng không thấy doanh thu
    expect(can('cost.view-recipe', ['R6'])).toBe(true)
    expect(isPermitted('report.branch-revenue', ['R6'])).toBe(false)
    // Bếp trưởng thấy giá vốn và lãi gộp nhưng không thấy doanh thu chi nhánh
    expect(can('cost.view-recipe', ['R5'])).toBe(true)
    expect(isPermitted('report.branch-revenue', ['R5'])).toBe(false)
  })

  it('không vai trò vận hành nào tự quản lý được tài khoản & quyền ngoài chủ', () => {
    for (const role of ROLES) {
      if (role === 'R10') continue
      expect(isPermitted('admin.manage-accounts-roles', [role]), role).toBe(false)
    }
  })

  it('marketing chỉ chạm nội dung, khuyến mãi và phản hồi — không đụng vận hành', () => {
    const allowed = (Object.keys(ACTIONS) as ActionKey[]).filter((a) => isPermitted(a, ['R9']))
    expect(allowed).toEqual([
      'menu.view-price',
      'cms.edit',
      'promo.compose',
      'promo.activate',
      'feedback.respond',
      'customer.view-book',
    ])
    // Không một đồng nào, không một dòng tồn kho nào đi qua tay marketing
    expect(isPermitted('bill.discount-upto-10', ['R9'])).toBe(false)
    expect(isPermitted('menu.edit-price', ['R9'])).toBe(false)
    expect(isPermitted('report.branch-revenue', ['R9'])).toBe(false)
  })

  it('kiêm nhiệm nhiều vai trò thì lấy mức cao nhất', () => {
    expect(checkPermission('order.line.void-sent', ['R2'])).toBe('approve')
    expect(checkPermission('order.line.void-sent', ['R2', 'R5'])).toBe('allow')
  })

  it('vai trò rỗng không làm được gì', () => {
    for (const action of Object.keys(ACTIONS) as ActionKey[]) {
      expect(checkPermission(action, [])).toBe('deny')
    }
  })
})

describe('Duyệt △ — phân tách nhiệm vụ (PHẦN G)', () => {
  const waiter = { id: 'nv-01', roles: ['R1'] as Role[] }
  const manager = { id: 'nv-09', roles: ['R7'] as Role[] }

  it('phục vụ xin huỷ món đã gửi bếp, quản lý ca duyệt → hợp lệ', () => {
    expect(checkApproval('order.line.void-sent', waiter, manager)).toEqual({ ok: true })
  })

  it('KHÔNG AI TỰ DUYỆT VIỆC CỦA MÌNH — kể cả khi đủ quyền duyệt', () => {
    const chef = { id: 'nv-05', roles: ['R1', 'R5'] as Role[] }
    // Bản thân chef đã 'allow' nhờ R5 nên không rơi vào luồng duyệt
    expect(checkApproval('order.line.void-sent', chef, chef)).toEqual({
      ok: false,
      code: 'khong-can-duyet',
    })
    // Trường hợp thật sự cần duyệt mà tự duyệt thì bị chặn
    expect(checkApproval('order.line.void-sent', waiter, { ...manager, id: waiter.id })).toEqual({
      ok: false,
      code: 'tu-duyet',
    })
  })

  it('người duyệt không đủ quyền thì lượt duyệt vô hiệu', () => {
    const otherWaiter = { id: 'nv-02', roles: ['R1'] as Role[] }
    expect(checkApproval('order.line.void-sent', waiter, otherWaiter)).toEqual({
      ok: false,
      code: 'nguoi-duyet-khong-du-quyen',
    })
  })

  it('việc vốn đã được phép thì không sinh luồng duyệt', () => {
    expect(needsApproval('table.move-merge-split', ['R1'])).toBe(false)
    expect(checkApproval('table.move-merge-split', waiter, manager)).toEqual({
      ok: false,
      code: 'khong-can-duyet',
    })
  })

  it('việc bị cấm hoàn toàn cũng không mở được bằng duyệt', () => {
    const guest = { id: 'khach', roles: ['R0'] as Role[] }
    expect(checkApproval('order.line.void-sent', guest, manager)).toEqual({
      ok: false,
      code: 'khong-can-duyet',
    })
  })
})

describe('permissionMatrix — nguồn render màn A2', () => {
  it('trả đủ 58 dòng (§4.2, §4.2b và phần bổ sung) × 14 vai trò', () => {
    const matrix = permissionMatrix()
    expect(matrix).toHaveLength(58)
    for (const row of matrix) {
      expect(Object.keys(row.byRole)).toHaveLength(ROLES.length)
    }
  })

  it('giữ nhãn tiếng Việt và ghi chú của tài liệu', () => {
    const row = permissionMatrix().find((r) => r.action === 'order.line.void-sent')!
    expect(row.label).toBe('Huỷ món đã gửi bếp')
    const noted = permissionMatrix().find((r) => r.action === 'cost.view-recipe')!
    expect(noted.note).toContain('trạm mình')
  })
})
