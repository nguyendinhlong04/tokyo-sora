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

const SYMBOL: Record<string, Permission> = { '.': 'deny', x: 'allow', a: 'approve' }

describe('Ma trận khớp 1:1 với bảng §4.2 trong tài liệu', () => {
  it('mã hoá đủ 31 hành động của bảng', () => {
    expect(Object.keys(ACTIONS)).toHaveLength(31)
    expect(DOC_ROWS).toHaveLength(31)
  })

  it.each(DOC_ROWS)('%s khớp từng ô', (action, row) => {
    expect(row).toHaveLength(DOC_COLUMN_ORDER.length)
    DOC_COLUMN_ORDER.forEach((role, i) => {
      expect(checkPermission(action, [role]), `${action} × ${role}`).toBe(SYMBOL[row[i]!])
    })
  })

  it('R13 (quản lý nhân sự) chưa có quyền vận hành nào — bảng §4.2b để GĐ5', () => {
    for (const action of Object.keys(ACTIONS) as ActionKey[]) {
      expect(checkPermission(action, ['R13'])).toBe('deny')
    }
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

  it('marketing chỉ sửa được nội dung website, không đụng vận hành', () => {
    const allowed = (Object.keys(ACTIONS) as ActionKey[]).filter((a) => isPermitted(a, ['R9']))
    expect(allowed).toEqual(['menu.view-price', 'cms.edit'])
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
  it('trả đủ 31 dòng × 14 vai trò', () => {
    const matrix = permissionMatrix()
    expect(matrix).toHaveLength(31)
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
