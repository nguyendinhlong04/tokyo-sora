/**
 * Khung giờ nhận đơn online (O4).
 *
 * Bếp không nở ra được: mỗi khung 15 phút chỉ nhận được một số đơn nhất định
 * (§23.3 "trần đơn mỗi khung 15 phút"). Nhận quá trần thì mọi đơn trong khung
 * đều trễ, và khách trễ vì quán tham đơn là khách không quay lại.
 *
 * Hàm thuần: không DB, không Nest, không đọc đồng hồ ngầm. Mọi mốc giờ trong
 * ngày đếm bằng PHÚT KỂ TỪ ĐẦU NGÀY LÀM VIỆC, còn `dayStart` là mốc tuyệt đối
 * của 00:00 theo múi giờ chi nhánh — nhờ vậy máy chủ chạy ở múi giờ nào cũng ra
 * cùng một khung giờ cho quán ở Hà Nội.
 */

export const SLOT_MINUTES = 15

export interface SlotWindow {
  /** Mốc bắt đầu khung */
  at: Date
  /** Số đơn đã nhận trong khung */
  taken: number
  capacity: number
  open: boolean
  /** Vì sao đóng — để màn O4 nói rõ thay vì chỉ tô xám */
  closedReason: 'full' | 'too-soon' | null
}

export interface SlotOptions {
  /** Giờ mở nhận đơn, phút kể từ đầu ngày (10:00 → 600) */
  openMinute: number
  /** Giờ ngừng nhận đơn, phút kể từ đầu ngày */
  lastOrderMinute: number
  /** Bếp cần tối thiểu bao nhiêu phút kể từ bây giờ */
  leadMinutes: number
  /** Trần đơn mỗi khung */
  capacity: number
}

const MINUTE = 60_000

/** Đầu khung 15 phút chứa `at`, tính theo mốc đầu ngày của chi nhánh */
export function slotStart(at: Date, dayStart: Date): Date {
  const minutes = Math.floor((at.getTime() - dayStart.getTime()) / MINUTE)
  const aligned = Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES
  return new Date(dayStart.getTime() + aligned * MINUTE)
}

/**
 * Các khung của một ngày kèm trạng thái còn nhận hay không.
 *
 * `takenBySlot` khoá theo ISO của đầu khung — đúng thứ truy vấn đếm đơn trả về.
 */
export function buildSlots(input: {
  now: Date
  dayStart: Date
  takenBySlot: ReadonlyMap<string, number>
  options: SlotOptions
}): SlotWindow[] {
  const { now, dayStart, takenBySlot, options } = input
  const earliest = now.getTime() + options.leadMinutes * MINUTE
  const slots: SlotWindow[] = []

  for (let minute = options.openMinute; minute <= options.lastOrderMinute; minute += SLOT_MINUTES) {
    const at = new Date(dayStart.getTime() + minute * MINUTE)
    const taken = takenBySlot.get(at.toISOString()) ?? 0
    const closedReason: SlotWindow['closedReason'] =
      at.getTime() < earliest ? 'too-soon' : taken >= options.capacity ? 'full' : null

    slots.push({ at, taken, capacity: options.capacity, open: closedReason === null, closedReason })
  }

  return slots
}

export type SlotRejection = 'outside-hours' | 'too-soon' | 'full' | 'not-a-slot'

/**
 * Kiểm mốc hẹn giờ khách chọn.
 *
 * Kiểm lại ở máy chủ dù màn O4 đã tô xám khung đầy: giữa lúc khách chọn và lúc
 * bấm đặt có thể có người khác đặt trước, và không gì ngăn ai đó gọi thẳng API
 * với mốc giờ tự chế.
 */
export function checkSlot(input: {
  slotAt: Date
  now: Date
  dayStart: Date
  taken: number
  options: SlotOptions
}): { ok: true } | { ok: false; code: SlotRejection; message: string } {
  const { slotAt, now, dayStart, taken, options } = input
  const minute = Math.round((slotAt.getTime() - dayStart.getTime()) / MINUTE)

  if (minute % SLOT_MINUTES !== 0 || slotAt.getTime() % MINUTE !== 0) {
    return {
      ok: false,
      code: 'not-a-slot',
      message: `Giờ hẹn phải rơi vào khung ${SLOT_MINUTES} phút`,
    }
  }

  if (minute < options.openMinute || minute > options.lastOrderMinute) {
    return { ok: false, code: 'outside-hours', message: 'Ngoài giờ nhận đơn của chi nhánh' }
  }

  if (slotAt.getTime() < now.getTime() + options.leadMinutes * MINUTE) {
    return {
      ok: false,
      code: 'too-soon',
      message: `Bếp cần ít nhất ${options.leadMinutes} phút để chuẩn bị`,
    }
  }

  if (taken >= options.capacity) {
    return { ok: false, code: 'full', message: 'Khung giờ này đã kín, chọn giúp bạn khung khác' }
  }

  return { ok: true }
}

/** Khung sớm nhất còn nhận được — dùng cho đơn "nhận ngay" */
export function earliestOpenSlot(slots: readonly SlotWindow[]): SlotWindow | null {
  return slots.find((s) => s.open) ?? null
}
