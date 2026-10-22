import type { TaskRecurrence, TaskState } from '@sora/contracts'

/**
 * Việc và việc định kỳ — hàm thuần, không đụng Nest hay Drizzle.
 *
 * Service hỏi ở đây: mẫu có rơi vào ngày này không, hạn là mấy giờ, nộp được
 * chưa, chuyển trạng thái nào hợp lệ. Những câu trả lời này quyết định con số
 * "việc đúng hạn" của KPI, nên phải test được mà không cần CSDL.
 */

export type Result<T = object> = ({ ok: true } & T) | { ok: false; code: string; message: string }

const fail = (code: string, message: string) => ({ ok: false as const, code, message })

// ------------------------------------------------------------------ Lịch

/** Thứ theo ISO của một ngày `YYYY-MM-DD`: 1 = Thứ Hai … 7 = Chủ nhật */
export function isoWeekday(date: string): number {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay()
  return day === 0 ? 7 : day
}

export function addDays(date: string, days: number): string {
  const at = new Date(`${date}T00:00:00Z`)
  at.setUTCDate(at.getUTCDate() + days)
  return at.toISOString().slice(0, 10)
}

/** Các ngày từ `from` tới `to`, gồm cả hai đầu */
export function datesBetween(from: string, to: string): string[] {
  const out: string[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d)
  return out
}

export interface TemplateRule {
  recurrence: TaskRecurrence
  weekday: number | null
  monthDay: number | null
  startsOn: string
}

/**
 * Mẫu có rơi vào ngày này không. Việc theo ca còn một điều kiện nữa — ngày đó
 * có ca đã công bố — mà chỉ CSDL trả lời được; service kiểm phần ấy.
 */
export function occursOn(rule: TemplateRule, date: string): boolean {
  if (date < rule.startsOn) return false
  switch (rule.recurrence) {
    case 'hang-ngay':
    case 'theo-ca':
      return true
    case 'hang-tuan':
      return rule.weekday === isoWeekday(date)
    case 'hang-thang':
      return rule.monthDay === Number(date.slice(8, 10))
  }
}

/**
 * Phút hạn kể từ 00:00 của ngày việc. Theo ca mà để trống = giờ kết ca: checklist
 * đóng ca phải xong trước khi người đứng ca ra về.
 */
export function dueMinuteOf(
  rule: { recurrence: TaskRecurrence; dueMinute: number | null },
  shift: { endMinute: number } | null,
): number | null {
  if (rule.dueMinute !== null) return rule.dueMinute
  if (rule.recurrence === 'theo-ca' && shift) return shift.endMinute
  return null
}

// ------------------------------------------------------------------ Trạng thái

export type TaskAction = 'submit' | 'accept' | 'return' | 'cancel'

/**
 * Bước chuyển hợp lệ. Nộp việc không có người nghiệm thu là xong luôn; trả lại
 * đưa việc về "đang làm" để làm tiếp, không mở việc mới — lịch sử nằm trên một
 * dòng.
 */
export function nextState(
  state: TaskState,
  action: TaskAction,
  hasReviewer: boolean,
): Result<{ state: TaskState }> {
  switch (action) {
    case 'submit':
      if (state !== 'open') return fail('task_not_open', 'Việc không còn ở trạng thái đang làm')
      return { ok: true, state: hasReviewer ? 'submitted' : 'done' }
    case 'accept':
    case 'return':
      if (state !== 'submitted') {
        return fail('task_not_submitted', 'Việc chưa nộp hoặc đã được nghiệm thu')
      }
      return { ok: true, state: action === 'accept' ? 'done' : 'open' }
    case 'cancel':
      if (state !== 'open' && state !== 'submitted') {
        return fail('task_closed', 'Việc đã đóng — không huỷ được')
      }
      return { ok: true, state: 'cancelled' }
  }
}

/** Còn mục chưa tích thì phải nói vì sao — "đã kiểm" mà bỏ trống là kiểm cho có */
export function checkSubmit(unchecked: number, note: string | null): Result {
  if (unchecked > 0 && !note?.trim()) {
    return fail('checklist_incomplete', `Còn ${unchecked} mục chưa tích — ghi lý do trước khi nộp`)
  }
  return { ok: true }
}

/** Quá hạn: còn đang làm mà đã qua hạn. Đã nộp chờ nghiệm thu thì không tính */
export function isOverdue(task: { state: TaskState; dueAt: Date }, now: Date): boolean {
  return task.state === 'open' && task.dueAt.getTime() < now.getTime()
}

/**
 * Đổi hạn: việc đã quá hạn thì KHÔNG dời hạn — dời được thì "quá hạn" không còn
 * nghĩa gì với KPI. Muốn làm lại thì huỷ kèm lý do rồi giao việc mới.
 */
export function canChangeDue(
  task: { state: TaskState; dueAt: Date },
  nextDue: Date,
  now: Date,
): Result {
  if (nextDue.getTime() === task.dueAt.getTime()) return { ok: true }
  if (isOverdue(task, now)) {
    return fail(
      'task_overdue_due_locked',
      'Việc đã quá hạn — không dời hạn được. Huỷ kèm lý do rồi giao lại nếu cần',
    )
  }
  if (nextDue.getTime() <= now.getTime()) {
    return fail('task_due_past', 'Hạn mới phải ở tương lai')
  }
  return { ok: true }
}

// ------------------------------------------------------------------ Sắp xếp

export type DueBucket = 'qua-han' | 'hom-nay' | 'sap-toi'

/** Nhóm của việc trên màn "Việc của tôi": quá hạn → hôm nay → sắp tới */
export function bucketOf(
  task: { state: TaskState; dueAt: Date },
  now: Date,
  endOfToday: Date,
): DueBucket {
  if (isOverdue(task, now)) return 'qua-han'
  return task.dueAt.getTime() < endOfToday.getTime() ? 'hom-nay' : 'sap-toi'
}

const BUCKET_ORDER: Record<DueBucket, number> = { 'qua-han': 0, 'hom-nay': 1, 'sap-toi': 2 }

/** Cùng nhóm: gấp trước, rồi hạn sớm trước */
export function sortMine<T extends { state: TaskState; dueAt: Date; priority: string }>(
  tasks: T[],
  now: Date,
  endOfToday: Date,
): T[] {
  return [...tasks].sort((a, b) => {
    const bucket =
      BUCKET_ORDER[bucketOf(a, now, endOfToday)] - BUCKET_ORDER[bucketOf(b, now, endOfToday)]
    if (bucket !== 0) return bucket
    const urgent = Number(b.priority === 'gap') - Number(a.priority === 'gap')
    if (urgent !== 0) return urgent
    return a.dueAt.getTime() - b.dueAt.getTime()
  })
}
