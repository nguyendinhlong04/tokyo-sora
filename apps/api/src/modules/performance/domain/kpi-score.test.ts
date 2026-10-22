import type { KpiRules } from '@sora/contracts'
import { describe, expect, it } from 'vitest'
import { achievementOf, bonusOf, checkWeights, gradeOf, scoreOf, type ScoreItem } from './kpi-score'

const rules: KpiRules = {
  gradeA: 105,
  gradeB: 95,
  gradeC: 80,
  achievementCapPct: 120,
  zeroTargetPenaltyPct: 50,
  minCoveragePct: 70,
  minSample: { tickets: 30, ratings: 10, events: 10, tasks: 3 },
  bonusVnd: { A: 1_000_000, B: 600_000, C: 200_000, D: 0 },
  prorateByHours: true,
  standardMonthlyMinutes: 26 * 8 * 60,
  cashToleranceVnd: 20_000,
}

const item = (patch: Partial<ScoreItem>): ScoreItem => ({
  weightPct: 25,
  direction: 'cao',
  targetMilli: 100_000,
  actualMilli: 100_000,
  sampleCount: null,
  minSample: null,
  excluded: false,
  countMetric: false,
  ...patch,
})

describe('Tỉ lệ đạt', () => {
  it('cao là tốt: thực ÷ chỉ tiêu, kẹp trần 120%', () => {
    expect(achievementOf(item({ actualMilli: 90_000 }), rules)).toBe(900)
    expect(achievementOf(item({ actualMilli: 200_000 }), rules)).toBe(1200)
  })

  it('thấp là tốt: 2 − thực ÷ chỉ tiêu, không âm', () => {
    // Food cost 38% so với chỉ tiêu 35% ⇒ 2 − 1,0857 = 91,4%
    expect(
      achievementOf(item({ direction: 'thap', targetMilli: 35_000, actualMilli: 38_000 }), rules),
    ).toBe(914)
    expect(
      achievementOf(item({ direction: 'thap', targetMilli: 10_000, actualMilli: 30_000 }), rules),
    ).toBe(0)
  })

  it('không có dữ liệu, mẫu quá nhỏ, bị loại thì là null — không phải 0', () => {
    expect(achievementOf(item({ actualMilli: null }), rules)).toBeNull()
    expect(achievementOf(item({ sampleCount: 12, minSample: 30 }), rules)).toBeNull()
    expect(achievementOf(item({ excluded: true }), rules)).toBeNull()
  })

  it('chỉ tiêu 0 cho chỉ số đếm: không vi phạm là 100%, mỗi lần trừ 50%', () => {
    const zero = { direction: 'thap' as const, targetMilli: 0, countMetric: true }
    expect(achievementOf(item({ ...zero, actualMilli: 0 }), rules)).toBe(1000)
    expect(achievementOf(item({ ...zero, actualMilli: 1000 }), rules)).toBe(500)
    expect(achievementOf(item({ ...zero, actualMilli: 3000 }), rules)).toBe(0)
    // Chỉ tiêu 0 cho chỉ số tỉ lệ thì không chia được
    expect(achievementOf(item({ targetMilli: 0 }), rules)).toBeNull()
  })
})

describe('Điểm, hạng, độ phủ', () => {
  it('điểm là tổng các phần đóng góp đã làm tròn; chỉ số thiếu dữ liệu không kéo điểm xuống', () => {
    const result = scoreOf(
      [
        item({ weightPct: 40, actualMilli: 110_000 }),
        item({ weightPct: 30, actualMilli: 95_000 }),
        item({ weightPct: 30, actualMilli: null }),
      ],
      rules,
    )
    expect(result.coverageMilli).toBe(700)
    // (40×110% + 30×95%) ÷ 70 = 103,571…
    expect(result.contributions[2]).toBeNull()
    expect(result.scoreMilli).toBe((result.contributions[0] ?? 0) + (result.contributions[1] ?? 0))
    expect(result.grade).toBe('B')
  })

  it('độ phủ dưới 70% thì không xếp loại', () => {
    const result = scoreOf(
      [item({ weightPct: 60, actualMilli: null }), item({ weightPct: 40, actualMilli: 120_000 })],
      rules,
    )
    expect(result.coverageMilli).toBe(400)
    expect(result.scoreMilli).toBe(120_000)
    expect(result.grade).toBeNull()
  })

  it('không chỉ số nào có dữ liệu thì không có điểm', () => {
    expect(scoreOf([item({ actualMilli: null })], rules)).toMatchObject({
      scoreMilli: null,
      grade: null,
    })
  })

  it('ngưỡng hạng A ≥ 105 · B ≥ 95 · C ≥ 80 · D dưới 80', () => {
    expect(gradeOf(105_000, rules)).toBe('A')
    expect(gradeOf(104_999, rules)).toBe('B')
    expect(gradeOf(80_000, rules)).toBe('C')
    expect(gradeOf(79_999, rules)).toBe('D')
  })
})

describe('Thưởng gợi ý', () => {
  it('theo hạng, người lương giờ nhân hệ số giờ công, làm tròn nghìn, không âm', () => {
    expect(bonusOf('A', rules, { kind: 'monthly', workedMinutes: 0 })).toBe(1_000_000)
    expect(bonusOf('B', rules, { kind: 'hourly', workedMinutes: (26 * 8 * 60) / 2 })).toBe(300_000)
    expect(bonusOf('D', rules, { kind: 'monthly', workedMinutes: 0 })).toBe(0)
    expect(bonusOf(null, rules, { kind: 'monthly', workedMinutes: 0 })).toBe(0)
  })
})

describe('Bộ KPI', () => {
  it('3–6 chỉ số, trọng số cộng đúng 100', () => {
    expect(checkWeights([30, 30, 40])).toEqual({ ok: true })
    expect(checkWeights([50, 50])).toMatchObject({ ok: false })
    expect(checkWeights([30, 30, 30])).toMatchObject({
      ok: false,
      message: expect.stringContaining('90%'),
    })
  })
})
