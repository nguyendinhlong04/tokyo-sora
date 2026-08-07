import { describe, expect, it } from 'vitest'
import {
  ORDER_STATUSES,
  applyTransition,
  deriveStatusFromTickets,
  isTerminal,
  nextStatuses,
  type ActorRole,
  type OrderStatus,
  type OrderType,
  type TransitionContext,
} from './order-state'

const ctx = (orderType: OrderType, ...roles: ActorRole[]): TransitionContext => ({
  orderType,
  roles,
})

const CASHIER = ctx('delivery', 'R2')
const KITCHEN = ctx('delivery', 'R4')
const OWNER = (t: OrderType = 'delivery') => ctx(t, 'R10')

describe('Đường đi hạnh phúc — đơn giao hàng đủ 6 bước', () => {
  it('new → confirmed → cooking → ready → delivering → done', () => {
    const path: [OrderStatus, OrderStatus, TransitionContext][] = [
      ['new', 'confirmed', CASHIER],
      ['confirmed', 'cooking', KITCHEN],
      ['cooking', 'ready', KITCHEN],
      ['ready', 'delivering', CASHIER],
      ['delivering', 'done', CASHIER],
    ]
    for (const [from, to, c] of path) {
      expect(applyTransition(from, to, c)).toEqual({ ok: true, changed: true, status: to })
    }
  })

  it('đơn tại bàn và mang về bỏ qua bước giao: ready → done', () => {
    for (const type of ['dinein', 'takeaway'] as const) {
      expect(applyTransition('ready', 'done', OWNER(type)).ok).toBe(true)
      const r = applyTransition('ready', 'delivering', OWNER(type))
      expect(r).toMatchObject({ ok: false, code: 'not-applicable' })
    }
  })

  it('đơn giao hàng không được nhảy thẳng ready → done, phải qua bước giao', () => {
    expect(applyTransition('ready', 'done', OWNER('delivery'))).toMatchObject({
      ok: false,
      code: 'not-applicable',
    })
  })
})

describe('Chuyển trùng = no-op thành công (an toàn cho replay hàng đợi offline)', () => {
  it.each(ORDER_STATUSES)('%s → %s không đổi gì nhưng vẫn ok', (status) => {
    expect(applyTransition(status, status, OWNER())).toEqual({
      ok: true,
      changed: false,
      status,
    })
  })

  it('kể cả trạng thái kết thúc — POS gửi lại "done" lần hai vẫn ok', () => {
    expect(applyTransition('done', 'done', CASHIER).ok).toBe(true)
  })
})

describe('Quy tắc chặn huỷ — "Không thể huỷ, món đã lên bếp"', () => {
  it.each(['new', 'confirmed'] as const)('huỷ được khi đơn còn ở %s', (from) => {
    expect(applyTransition(from, 'cancelled', OWNER()).ok).toBe(true)
  })

  it.each(['cooking', 'ready', 'delivering'] as const)('KHÔNG huỷ được khi đơn đã %s', (from) => {
    const r = applyTransition(from, 'cancelled', OWNER())
    expect(r).toEqual({
      ok: false,
      code: 'cancel-locked',
      message: 'Không thể huỷ, món đã lên bếp',
    })
  })

  it('khách tự huỷ được trước khi lên bếp, và bị chặn sau đó', () => {
    const guest = ctx('delivery', 'CUSTOMER')
    expect(applyTransition('confirmed', 'cancelled', guest).ok).toBe(true)
    expect(applyTransition('cooking', 'cancelled', guest)).toMatchObject({ code: 'cancel-locked' })
  })
})

describe('Trạng thái kết thúc là bất biến', () => {
  it.each(['done', 'cancelled'] as const)('%s không đi tiếp đâu được', (from) => {
    for (const to of ORDER_STATUSES) {
      if (to === from) continue
      expect(applyTransition(from, to, OWNER()).ok).toBe(false)
    }
    expect(isTerminal(from)).toBe(true)
  })
})

describe('Không nhảy cóc bước', () => {
  it('new không nhảy thẳng sang cooking / ready / done', () => {
    for (const to of ['cooking', 'ready', 'delivering', 'done'] as const) {
      expect(applyTransition('new', to, OWNER())).toMatchObject({ code: 'invalid-transition' })
    }
  })

  it('không lùi trạng thái', () => {
    expect(applyTransition('ready', 'cooking', OWNER())).toMatchObject({
      code: 'invalid-transition',
    })
    expect(applyTransition('cooking', 'confirmed', OWNER())).toMatchObject({
      code: 'invalid-transition',
    })
  })
})

describe('Phân quyền theo §4.2', () => {
  it('phục vụ (R1) không được xác nhận đơn online', () => {
    expect(applyTransition('new', 'confirmed', ctx('delivery', 'R1'))).toMatchObject({
      ok: false,
      code: 'forbidden',
    })
  })

  it('thu ngân không bấm thay bếp được', () => {
    expect(applyTransition('confirmed', 'cooking', CASHIER)).toMatchObject({ code: 'forbidden' })
  })

  it('bếp không tự gán shipper', () => {
    expect(applyTransition('ready', 'delivering', KITCHEN)).toMatchObject({ code: 'forbidden' })
  })

  it('khách không được xác nhận đơn của chính mình', () => {
    expect(applyTransition('new', 'confirmed', ctx('delivery', 'CUSTOMER'))).toMatchObject({
      code: 'forbidden',
    })
  })

  it('chủ (R10) làm được mọi bước', () => {
    expect(applyTransition('new', 'confirmed', OWNER()).ok).toBe(true)
    expect(applyTransition('confirmed', 'cooking', OWNER()).ok).toBe(true)
    expect(applyTransition('ready', 'delivering', OWNER()).ok).toBe(true)
  })
})

describe('nextStatuses — nguồn để UI chỉ hiện nút bấm được', () => {
  it('thu ngân ở bước ready của đơn giao chỉ thấy "delivering"', () => {
    expect(nextStatuses('ready', CASHIER)).toEqual(['delivering'])
  })

  it('bếp ở bước confirmed chỉ thấy "cooking"', () => {
    expect(nextStatuses('confirmed', KITCHEN)).toEqual(['cooking'])
  })

  it('trạng thái kết thúc không còn nút nào', () => {
    expect(nextStatuses('done', OWNER())).toEqual([])
    expect(nextStatuses('cancelled', OWNER())).toEqual([])
  })
})

/**
 * Ba nút mà dải điều phối P16 và ngăn kéo O9 từng tự dựng lấy, mỗi cái đều bấm
 * vào là báo lỗi. Luật ở đây vốn đã đúng — cái sai là màn hình đoán lại nó. Giữ
 * mấy bài này để lần sau ai định dựng nút từ `status` thì thấy ngay vì sao không.
 */
describe('Nút bấm được — nguồn cho dải điều phối, không cho UI đoán lại', () => {
  it('không có đường "Đóng gói xong" đi thẳng từ confirmed sang ready', () => {
    expect(applyTransition('confirmed', 'ready', OWNER())).toMatchObject({
      ok: false,
      code: 'invalid-transition',
    })
  })

  it('thu ngân ở bước confirmed KHÔNG thấy nút nào ngoài huỷ — đóng gói là việc bếp', () => {
    expect(nextStatuses('confirmed', CASHIER)).toEqual(['cancelled'])
  })

  it('thu ngân ở bước cooking không còn nút nào: hết huỷ, mà đóng gói cũng không phải việc mình', () => {
    expect(nextStatuses('cooking', CASHIER)).toEqual([])
  })

  it('đơn GIAO đang ready chỉ có "Đi giao", tuyệt đối không có "Đã giao"', () => {
    expect(nextStatuses('ready', ctx('delivery', 'R2'))).toEqual(['delivering'])
  })

  it('đơn MANG VỀ đang ready thì ngược lại: chỉ có "Khách đã lấy"', () => {
    expect(nextStatuses('ready', ctx('takeaway', 'R2'))).toEqual(['done'])
  })
})

describe('Suy trạng thái đơn từ vé bếp — bếp bấm là đơn tự đổi bước', () => {
  it('vé đầu tiên bắt đầu nấu ⇒ đơn sang cooking', () => {
    expect(deriveStatusFromTickets('confirmed', ['cooking', 'queued'])).toBe('cooking')
  })

  it('mọi vé xong ⇒ đơn sang ready', () => {
    expect(deriveStatusFromTickets('cooking', ['ready', 'ready', 'closed'])).toBe('ready')
  })

  it('còn một vé chưa xong thì chưa ready', () => {
    expect(deriveStatusFromTickets('cooking', ['ready', 'cooking'])).toBe('cooking')
  })

  it('vé đã huỷ không tính — đơn còn lại xong hết vẫn là ready', () => {
    expect(deriveStatusFromTickets('cooking', ['ready', 'voided'])).toBe('ready')
  })

  it('vé đợt sau còn waiting thì đơn chưa ready', () => {
    expect(deriveStatusFromTickets('cooking', ['ready', 'waiting'])).toBe('cooking')
  })

  it('chưa vé nào động tới ⇒ giữ nguyên confirmed', () => {
    expect(deriveStatusFromTickets('confirmed', ['queued', 'waiting'])).toBe('confirmed')
  })

  it('không kéo lùi đơn đã sang bước giao hàng dù vé thế nào', () => {
    expect(deriveStatusFromTickets('delivering', ['cooking'])).toBe('delivering')
    expect(deriveStatusFromTickets('done', ['queued'])).toBe('done')
    expect(deriveStatusFromTickets('cancelled', ['ready'])).toBe('cancelled')
  })

  it('đơn chưa có vé nào (tất cả đã huỷ) giữ nguyên trạng thái', () => {
    expect(deriveStatusFromTickets('confirmed', ['voided'])).toBe('confirmed')
    expect(deriveStatusFromTickets('confirmed', [])).toBe('confirmed')
  })
})
