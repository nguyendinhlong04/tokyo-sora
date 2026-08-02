/**
 * Lưới khung giờ đặt bàn (W6 bước 2 · R1 trên POS).
 *
 * "Lưới khung giờ hiển thị còn nhận hay hết chỗ theo sức chứa THẬT — khung hết
 * thì mờ đi, không cho chọn rồi báo lỗi sau" (§19 W6). Nên mọi thứ quyết định
 * một khung còn nhận hay không nằm ở đây, dưới dạng hàm thuần: không DB, không
 * Nest, không đọc đồng hồ ngầm.
 *
 * Quy ước giờ giống hệt khung giờ đơn online: đếm bằng PHÚT KỂ TỪ ĐẦU NGÀY LÀM
 * VIỆC của chi nhánh, còn mốc tuyệt đối do nơi gọi quy đổi.
 */

/** Một ca mở cửa trong ngày: 11:00–14:00 là { open: 660, close: 840 } */
export interface OpenWindow {
  openMinute: number
  closeMinute: number
}

/** Suất đã có (đặt chỗ thật hoặc suất đang giữ mềm) */
export interface Booking {
  startMinute: number
  endMinute: number
}

export type SlotClosedReason = 'full' | 'too-soon' | 'past'

export interface SeatSlot {
  /** Phút kể từ đầu ngày làm việc */
  minute: number
  /** Nhãn 'HH:MM' — web hiện đúng chuỗi này, không tự định dạng lại */
  label: string
  taken: number
  capacity: number
  open: boolean
  closedReason: SlotClosedReason | null
}

export interface SlotRules {
  /** Bước lưới, phút (30 = mỗi nửa tiếng) */
  stepMinutes: number
  /** Thời lượng bữa của nhóm ≤ 3 khách */
  mealMinutesSmall: number
  /** Thời lượng bữa của nhóm ≥ 4 khách */
  mealMinutesLarge: number
  /** Đệm dọn bàn giữa hai lượt khách */
  turnBufferMinutes: number
  /** Đặt trước tối thiểu bao nhiêu phút kể từ bây giờ */
  leadMinutes: number
}

const MINUTE = 60_000

/**
 * "Thời lượng bữa theo số khách (2 khách 90 phút · 4+ 120 phút)" (§R3).
 *
 * Nhóm 3 xếp cùng nhóm nhỏ: ba người ăn không lâu hơn hai người đáng kể, mà
 * tính dư 30 phút cho mỗi nhóm ba là mất một suất mỗi tối ở mỗi bàn.
 */
export function mealMinutesFor(guestCount: number, rules: SlotRules): number {
  return guestCount >= 4 ? rules.mealMinutesLarge : rules.mealMinutesSmall
}

/** Bàn bị chiếm từ lúc khách ngồi tới lúc dọn xong — đây mới là thứ chặn suất sau */
export function occupancyMinutes(guestCount: number, rules: SlotRules): number {
  return mealMinutesFor(guestCount, rules) + rules.turnBufferMinutes
}

export function formatMinute(minute: number): string {
  const m = ((minute % 1440) + 1440) % 1440
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/**
 * Giờ mở cửa của chi nhánh: '11:00–14:00 · 17:00–23:00' → hai ca.
 *
 * Nguồn là ô giờ mở ở A10 — nhân viên gõ chuỗi cho người đọc, nên hàm này chấp
 * cả gạch ngang thường lẫn gạch ngang dài, và cả dấu `·` lẫn dấu phẩy. Ca vắt
 * qua nửa đêm (17:00–00:30) được cộng thêm một ngày để phép so vẫn tuyến tính.
 */
export function parseOpenHours(raw: string | null | undefined): OpenWindow[] {
  if (!raw) return []
  return raw
    .split(/[·,;]/)
    .map((part) => /(\d{1,2}):(\d{2})\s*[–—-]\s*(\d{1,2}):(\d{2})/.exec(part.trim()))
    .filter((m): m is RegExpExecArray => m !== null)
    .map((m) => {
      const openMinute = Number(m[1]) * 60 + Number(m[2])
      let closeMinute = Number(m[3]) * 60 + Number(m[4])
      if (closeMinute <= openMinute) closeMinute += 1440
      return { openMinute, closeMinute }
    })
}

/** Hai khoảng chồng lấn nhau — chạm mép không tính là chồng */
function overlaps(a: Booking, b: Booking): boolean {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute
}

/**
 * Lưới khung giờ của một ngày cho một kiểu chỗ và một cỡ nhóm.
 *
 * `capacity` là số bàn của kiểu chỗ đó CÓ THỂ CHỨA nhóm này; `existing` là mọi
 * suất cùng kiểu chỗ còn hiệu lực trong ngày. Đếm mọi suất cùng kiểu chỗ chứ
 * không cố đoán suất nào ngồi bàn nào: xếp bàn là việc của R2 lúc khách tới, và
 * ở đây thà hụt một suất còn hơn hứa một suất không có bàn.
 *
 * Suất cuối phải KẾT THÚC trước giờ đóng cửa — không nhận nhóm 4 người lúc
 * 22:30 rồi đuổi khách lúc 23:00.
 */
export function buildReservationSlots(input: {
  windows: readonly OpenWindow[]
  /** Phút hiện tại kể từ đầu ngày; null nếu đang xem ngày tương lai */
  nowMinute: number | null
  guestCount: number
  capacity: number
  existing: readonly Booking[]
  rules: SlotRules
}): SeatSlot[] {
  const { windows, nowMinute, guestCount, capacity, existing, rules } = input
  const meal = mealMinutesFor(guestCount, rules)
  const occupancy = meal + rules.turnBufferMinutes
  const earliest = nowMinute === null ? -Infinity : nowMinute + rules.leadMinutes
  const slots: SeatSlot[] = []

  for (const window of windows) {
    const lastSeating = window.closeMinute - meal
    for (let minute = window.openMinute; minute <= lastSeating; minute += rules.stepMinutes) {
      const candidate: Booking = { startMinute: minute, endMinute: minute + occupancy }
      const taken = existing.filter((b) => overlaps(b, candidate)).length

      const closedReason: SlotClosedReason | null =
        nowMinute !== null && minute < nowMinute
          ? 'past'
          : minute < earliest
            ? 'too-soon'
            : taken >= capacity
              ? 'full'
              : null

      slots.push({
        minute,
        label: formatMinute(minute),
        taken,
        capacity,
        open: closedReason === null,
        closedReason,
      })
    }
  }

  return slots
}

export type ReservationRejection = 'outside-hours' | 'too-soon' | 'full' | 'no-seat'

/**
 * Kiểm lại khung khách chọn ngay trước khi ghi.
 *
 * Giữa lúc lưới hiện ra và lúc khách bấm xác nhận có thể có người khác lấy mất
 * suất — và không gì ngăn ai đó gọi thẳng API với một mốc giờ tự chế.
 */
export function checkReservationSlot(input: {
  minute: number
  slots: readonly SeatSlot[]
}): { ok: true } | { ok: false; code: ReservationRejection; message: string } {
  const slot = input.slots.find((s) => s.minute === input.minute)
  if (!slot) {
    return {
      ok: false,
      code: 'outside-hours',
      message: 'Giờ này chi nhánh không nhận đặt bàn',
    }
  }
  if (slot.capacity === 0) {
    return {
      ok: false,
      code: 'no-seat',
      message: 'Chi nhánh không có chỗ nào đủ sức chứa cho nhóm này — nhờ bạn gọi trực tiếp',
    }
  }
  if (slot.closedReason === 'past' || slot.closedReason === 'too-soon') {
    return { ok: false, code: 'too-soon', message: 'Giờ này đã quá gần, chọn giúp bạn khung sau' }
  }
  if (!slot.open) {
    return { ok: false, code: 'full', message: 'Khung giờ này vừa hết chỗ, chọn giúp bạn khung khác' }
  }
  return { ok: true }
}

/** Đổi mốc tuyệt đối thành phút kể từ đầu ngày làm việc */
export function minuteOf(at: Date, dayStart: Date): number {
  return Math.round((at.getTime() - dayStart.getTime()) / MINUTE)
}

/** Chiều ngược lại — dùng khi ghi `slot_at` xuống CSDL */
export function dateOfMinute(minute: number, dayStart: Date): Date {
  return new Date(dayStart.getTime() + minute * MINUTE)
}
