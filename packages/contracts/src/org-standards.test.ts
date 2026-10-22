import { describe, expect, it } from 'vitest'
import {
  STANDARD_BRANCH_HEAD,
  STANDARD_BRANCH_UNITS,
  STANDARD_CHAIN_UNITS,
  STANDARD_KPI_SETS,
  STANDARD_REPORT_TEMPLATES,
  STANDARD_SOPS,
  type StandardSeat,
} from './org-standards.js'
import { TASK_CHECKLIST_MAX, TASK_MONTH_DAY_MAX } from './tasks.js'
import { KPI_METRICS } from './kpi.js'
import { REPORT_AUTO_FIELDS } from './work-reports.js'
import type { StandardUnit } from './org-standards.js'

const key = (seat: StandardSeat) => `${seat.unit ?? ''}/${seat.title}`

describe('Bộ SOP chuẩn khớp với cơ cấu chi nhánh mẫu', () => {
  /** Ghế ở cấp bộ phận (Sảnh, Bếp, Kho) và ghế trưởng chi nhánh — SOP không gọi tới tổ */
  const known = new Set([
    ...STANDARD_BRANCH_UNITS.flatMap((u) => u.positions.map((p) => `${u.name}/${p.title}`)),
    `/${STANDARD_BRANCH_HEAD.title}`,
  ])

  it('người làm và người nghiệm thu đều là ghế có thật trong mẫu', () => {
    for (const sop of STANDARD_SOPS) {
      expect(known.has(key(sop.assignee)), `${sop.title} → ${key(sop.assignee)}`).toBe(true)
      if (sop.reviewer) {
        expect(known.has(key(sop.reviewer)), `${sop.title} → ${key(sop.reviewer)}`).toBe(true)
      }
    }
  })

  it('không ai nghiệm thu việc của chính ghế mình', () => {
    for (const sop of STANDARD_SOPS) {
      if (sop.reviewer) expect(key(sop.reviewer), sop.title).not.toBe(key(sop.assignee))
    }
  })

  it('hình dạng lịch hợp lệ — đúng cái CHECK của bảng task_templates sẽ đòi', () => {
    for (const sop of STANDARD_SOPS) {
      expect(sop.checklist.length, sop.title).toBeGreaterThan(0)
      expect(sop.checklist.length, sop.title).toBeLessThanOrEqual(TASK_CHECKLIST_MAX)
      expect(sop.recurrence === 'theo-ca', sop.title).toBe(sop.shift !== undefined)
      expect(sop.recurrence === 'hang-tuan', sop.title).toBe(sop.weekday !== undefined)
      expect(sop.recurrence === 'hang-thang', sop.title).toBe(sop.monthDay !== undefined)
      if (sop.weekday !== undefined) expect(sop.weekday).toBeGreaterThanOrEqual(1)
      if (sop.weekday !== undefined) expect(sop.weekday).toBeLessThanOrEqual(7)
      if (sop.monthDay !== undefined) expect(sop.monthDay).toBeLessThanOrEqual(TASK_MONTH_DAY_MAX)
      expect(sop.dueMinute).toBeGreaterThanOrEqual(0)
      expect(sop.dueMinute).toBeLessThanOrEqual(24 * 60)
    }
  })

  it('tên SOP không trùng — áp lại mẫu nhận ra cái đã có bằng tên', () => {
    const titles = STANDARD_SOPS.map((s) => s.title)
    expect(new Set(titles).size).toBe(titles.length)
  })
})

describe('Mẫu báo cáo chuẩn', () => {
  const known = new Set([
    ...STANDARD_BRANCH_UNITS.flatMap((u) => u.positions.map((p) => `${u.name}/${p.title}`)),
    `/${STANDARD_BRANCH_HEAD.title}`,
  ])

  it('ghế nộp có thật, khoá trường không trùng, trường tự điền có trong danh mục', () => {
    for (const t of STANDARD_REPORT_TEMPLATES) {
      for (const p of t.positions)
        expect(known.has(key(p.seat)), `${t.code} → ${key(p.seat)}`).toBe(true)
      const keys = t.fields.map((f) => f.key)
      expect(new Set(keys).size, t.code).toBe(keys.length)
      for (const f of t.fields) {
        if (f.auto) expect(REPORT_AUTO_FIELDS[f.auto], `${t.code}.${f.key}`).toBeDefined()
        if (f.requiredIf) expect(keys, `${t.code}.${f.key}`).toContain(f.requiredIf.field)
      }
    }
  })

  it('mẫu nộp trên điện thoại không có trường tiền — tiền chỉ ở máy của quán', () => {
    for (const t of STANDARD_REPORT_TEMPLATES.filter((x) => x.kenhNv)) {
      expect(
        t.fields.some((f) => f.type === 'tien'),
        t.code,
      ).toBe(false)
    }
  })
})

describe('Bộ KPI mẫu', () => {
  /** Mọi cặp (đơn vị, chức danh) ở mọi tầng của mẫu chi nhánh và mẫu chuỗi */
  const all = (units: StandardUnit[]): string[] =>
    units.flatMap((u) => [
      ...u.positions.map((p) => `${u.name}/${p.title}`),
      ...all(u.children ?? []),
    ])
  const known = new Set([
    ...all(STANDARD_BRANCH_UNITS),
    ...all(STANDARD_CHAIN_UNITS),
    `/${STANDARD_BRANCH_HEAD.title}`,
  ])

  it('trọng số mỗi bộ cộng đúng 100, 3–6 chỉ số, không trùng chỉ số', () => {
    for (const set of STANDARD_KPI_SETS) {
      const name = set.seats.map((s) => s.title).join(', ')
      expect(
        set.items.reduce((sum, i) => sum + i.weight, 0),
        name,
      ).toBe(100)
      expect(set.items.length, name).toBeGreaterThanOrEqual(3)
      expect(set.items.length, name).toBeLessThanOrEqual(6)
      expect(new Set(set.items.map((i) => i.metric)).size, name).toBe(set.items.length)
      for (const i of set.items)
        expect(KPI_METRICS[i.metric], `${name} → ${i.metric}`).toBeDefined()
    }
  })

  it('ghế của bộ KPI có thật trong mẫu cơ cấu', () => {
    for (const set of STANDARD_KPI_SETS) {
      for (const seat of set.seats) {
        expect(known.has(`${seat.unit ?? ''}/${seat.title}`), `${seat.unit}/${seat.title}`).toBe(
          true,
        )
      }
    }
  })
})
