import type { ReportField } from '@sora/contracts'
import { describe, expect, it } from 'vitest'
import { canClose, needsExternalReport } from './incident'
import { hasMoney, validateTemplateFields, validateValues } from './report-fields'
import {
  dueMinuteOf,
  isoWeekKey,
  mondayOf,
  onTimeOf,
  periodKeyOf,
  periodStartOf,
  recentPeriodStarts,
} from './report-slots'

describe('Suất báo cáo', () => {
  it('kỳ tuần theo ISO, kỳ tháng theo ngày 1', () => {
    expect(mondayOf('2026-10-22')).toBe('2026-10-19')
    expect(isoWeekKey('2026-10-22')).toBe('2026-W43')
    // 01/01/2027 là thứ Sáu — vẫn thuộc tuần 53 của 2026
    expect(isoWeekKey('2027-01-01')).toBe('2026-W53')
    expect(periodStartOf('thang', '2026-10-22')).toBe('2026-10-01')
    expect(periodKeyOf('thang', '2026-10-22')).toBe('2026-10')
    expect(periodKeyOf('ca', '2026-10-22')).toBe('2026-10-22')
  })

  it('hạn: ca = giờ kết ca + độ lệch; ngày = độ lệch; tuần/tháng = đầu kỳ sau + độ lệch', () => {
    expect(dueMinuteOf('ca', '2026-10-22', 30, 15 * 60)).toBe(15 * 60 + 30)
    expect(dueMinuteOf('ngay', '2026-10-22', 33 * 60, null)).toBe(33 * 60)
    expect(dueMinuteOf('tuan', '2026-10-19', 9 * 60, null)).toBe(7 * 1440 + 9 * 60)
    expect(dueMinuteOf('thang', '2026-02-01', 0, null)).toBe(28 * 1440)
  })

  it('kỳ gần đây: 7 ngày, 4 tuần, 2 tháng — không có kỳ tương lai', () => {
    expect(recentPeriodStarts('ngay', '2026-10-22')).toHaveLength(7)
    expect(recentPeriodStarts('tuan', '2026-10-22')[0]).toBe('2026-10-19')
    expect(recentPeriodStarts('thang', '2026-01-15')).toEqual(['2026-01-01', '2025-12-01'])
  })

  it('đúng hạn tính cả thời gian ân hạn', () => {
    const due = new Date('2026-10-22T02:00:00Z')
    expect(onTimeOf(new Date('2026-10-22T02:14:00Z'), due, 15)).toBe(true)
    expect(onTimeOf(new Date('2026-10-22T02:16:00Z'), due, 15)).toBe(false)
  })
})

describe('Trường báo cáo', () => {
  const fields: ReportField[] = [
    { key: 'chenh-lech-ket', label: 'Chênh lệch két', type: 'tien', auto: 'chenh-lech-ket' },
    {
      key: 'giai-trinh',
      label: 'Giải trình',
      type: 'doan',
      requiredIf: { field: 'chenh-lech-ket', absGreaterThan: 20_000 },
    },
    { key: 'nhan-xet', label: 'Nhận xét', type: 'doan', required: true },
    { key: 'dong-cua', label: 'Đã khoá cửa', type: 'co-khong', required: true },
    { key: 'ca', label: 'Ca', type: 'chon', options: ['Sáng', 'Tối'] },
  ]

  it('mẫu có trường tiền (kể cả tự điền) là mẫu đụng tiền', () => {
    expect(hasMoney(fields)).toBe(true)
    expect(hasMoney(fields.slice(1))).toBe(false)
  })

  it('kiểm mẫu: khoá trùng, trường chọn thiếu lựa chọn, điều kiện trỏ sai đều bị chặn', () => {
    expect(validateTemplateFields(fields)).toEqual({ ok: true })
    expect(validateTemplateFields([...fields, fields[2]!])).toMatchObject({
      code: 'report_field_duplicate',
    })
    expect(validateTemplateFields([{ key: 'x', label: 'X', type: 'chon' }])).toMatchObject({
      code: 'report_field_options',
    })
    expect(
      validateTemplateFields([
        {
          key: 'x',
          label: 'X',
          type: 'doan',
          requiredIf: { field: 'khong-co', absGreaterThan: 0 },
        },
      ]),
    ).toMatchObject({ code: 'report_field_condition' })
  })

  it('két lệch quá ngưỡng thì giải trình bắt buộc; lệch ít thì không', () => {
    const base = { 'nhan-xet': 'Ổn', 'dong-cua': true }
    expect(validateValues(fields, base, { 'chenh-lech-ket': { value: -50_000 } })).toMatchObject({
      code: 'report_field_required',
    })
    expect(validateValues(fields, base, { 'chenh-lech-ket': { value: -5_000 } })).toEqual({
      ok: true,
    })
    expect(
      validateValues(
        fields,
        { ...base, 'giai-trinh': 'Thối nhầm' },
        {
          'chenh-lech-ket': { value: -50_000 },
        },
      ),
    ).toEqual({ ok: true })
  })

  it('"có/không" bắt buộc nghĩa là phải xác nhận CÓ; chọn ngoài danh sách bị chặn', () => {
    expect(validateValues(fields, { 'nhan-xet': 'Ổn', 'dong-cua': false }, {})).toMatchObject({
      code: 'report_field_required',
    })
    expect(
      validateValues(fields, { 'nhan-xet': 'Ổn', 'dong-cua': true, ca: 'Đêm' }, {}),
    ).toMatchObject({ code: 'report_field_invalid' })
  })
})

describe('Sự cố', () => {
  it('khai báo ra ngoài: TNLĐ, ATTP, cháy nổ từ mức nghiêm trọng', () => {
    expect(needsExternalReport('an-toan-thuc-pham', 'nghiem-trong')).toBe(true)
    expect(needsExternalReport('an-toan-thuc-pham', 'trung-binh')).toBe(false)
    expect(needsExternalReport('hong-thiet-bi', 'rat-nghiem-trong')).toBe(false)
  })

  const ready = {
    severity: 'nghiem-trong' as const,
    rootCause: 'Tủ mát hỏng rơ-le',
    correctiveAction: 'Thay rơ-le, kiểm nhiệt độ mỗi ca',
    externalReportRequired: true,
    externalReportedAt: new Date(),
    openTasks: 0,
    reportedBy: 7,
    closer: 1,
    closerMaySevere: true,
  }

  it('sự cố nghiêm trọng: quản lý chuỗi đóng, người báo không tự đóng', () => {
    expect(canClose(ready)).toEqual({ ok: true })
    expect(canClose({ ...ready, closerMaySevere: false })).toMatchObject({
      code: 'incident_needs_chain',
    })
    expect(canClose({ ...ready, closer: 7 })).toMatchObject({ code: 'self_decision' })
  })

  it('chưa khai báo ra ngoài, còn việc khắc phục, thiếu nguyên nhân thì chưa đóng được', () => {
    expect(canClose({ ...ready, externalReportedAt: null })).toMatchObject({
      code: 'incident_external_pending',
    })
    expect(canClose({ ...ready, openTasks: 2 })).toMatchObject({ code: 'incident_open_tasks' })
    expect(canClose({ ...ready, rootCause: ' ' })).toMatchObject({ code: 'incident_needs_cause' })
  })
})
