import type { KpiDirection, KpiGrade, KpiRules } from '@sora/contracts'

/**
 * Chấm KPI — hàm thuần. Mọi con số trên phiếu (tỉ lệ đạt, phần đóng góp, điểm,
 * hạng, thưởng gợi ý) ra từ đây, test được không cần CSDL.
 *
 * Đơn vị: `*_milli` = giá trị × 1000. Tỉ lệ đạt 1000 = 100%; điểm 100000 = 100 điểm.
 */

export interface ScoreItem {
  weightPct: number
  direction: KpiDirection
  targetMilli: number
  /** null = không có dữ liệu — KHÔNG phải 0 */
  actualMilli: number | null
  sampleCount: number | null
  /** Ngưỡng mẫu tối thiểu (đã tra tham số); null = không áp */
  minSample: number | null
  excluded: boolean
  /** Chỉ số đếm (số lần): chỉ tiêu 0 thì mỗi lần vi phạm trừ một khoản cố định */
  countMetric: boolean
}

/**
 * Tỉ lệ đạt, milli. Cao là tốt: thực ÷ chỉ tiêu. Thấp là tốt: 2 − thực ÷ chỉ tiêu.
 * Kẹp trong [0, trần]. Chỉ tiêu 0 chỉ dùng được cho chỉ số đếm hướng thấp: không vi
 * phạm là 100%, mỗi lần trừ `zeroTargetPenaltyPct`.
 */
export function achievementOf(item: ScoreItem, rules: KpiRules): number | null {
  if (item.excluded || item.actualMilli === null) return null
  if (item.minSample !== null && item.sampleCount !== null && item.sampleCount < item.minSample) {
    return null
  }
  const cap = rules.achievementCapPct * 10
  if (item.targetMilli === 0) {
    if (item.direction !== 'thap' || !item.countMetric) return null
    const violations = Math.round(item.actualMilli / 1000)
    return Math.max(0, 1000 - violations * rules.zeroTargetPenaltyPct * 10)
  }
  const ratio = item.actualMilli / item.targetMilli
  const raw = item.direction === 'cao' ? ratio : 2 - ratio
  return Math.min(cap, Math.max(0, Math.round(raw * 1000)))
}

export interface ScoreResult {
  /** Điểm milli (100000 = 100 điểm); null khi không chỉ số nào có dữ liệu */
  scoreMilli: number | null
  /** Tỉ trọng trọng số có dữ liệu, milli (1000 = 100%) */
  coverageMilli: number
  achievements: (number | null)[]
  /** Phần đóng góp milli điểm, đã làm tròn — cộng lại ĐÚNG bằng điểm */
  contributions: (number | null)[]
  /** null khi độ phủ dưới ngưỡng — không xếp loại, không sinh thưởng */
  grade: KpiGrade | null
}

export function scoreOf(items: readonly ScoreItem[], rules: KpiRules): ScoreResult {
  const achievements = items.map((i) => achievementOf(i, rules))
  const total = items.reduce((sum, i) => sum + i.weightPct, 0)
  const covered = items.reduce(
    (sum, i, idx) => sum + (achievements[idx] !== null ? i.weightPct : 0),
    0,
  )
  const coverageMilli = total > 0 ? Math.round((covered / total) * 1000) : 0
  if (covered === 0) {
    return {
      scoreMilli: null,
      coverageMilli,
      achievements,
      contributions: items.map(() => null),
      grade: null,
    }
  }
  // Mỗi phần đóng góp làm tròn trước, điểm là tổng các phần — phiếu cộng tay vẫn khớp
  const contributions = items.map((i, idx) => {
    const a = achievements[idx] ?? null
    return a === null ? null : Math.round((i.weightPct * a * 100) / covered)
  })
  const scoreMilli = contributions.reduce<number>((sum, c) => sum + (c ?? 0), 0)
  const grade = coverageMilli < rules.minCoveragePct * 10 ? null : gradeOf(scoreMilli, rules)
  return { scoreMilli, coverageMilli, achievements, contributions, grade }
}

export function gradeOf(scoreMilli: number, rules: KpiRules): KpiGrade {
  const points = scoreMilli / 1000
  if (points >= rules.gradeA) return 'A'
  if (points >= rules.gradeB) return 'B'
  if (points >= rules.gradeC) return 'C'
  return 'D'
}

/**
 * Thưởng gợi ý: mức theo hạng × hệ số giờ (người lương giờ, nếu bật), làm tròn
 * tới 1.000₫, không bao giờ âm. Không có hạng thì 0 — và nơi gọi phải nói vì sao.
 * KPI chỉ quyết định THƯỞNG; không phạt, không khấu trừ (Điều 127).
 */
export function bonusOf(
  grade: KpiGrade | null,
  rules: KpiRules,
  pay: { kind: 'hourly' | 'monthly'; workedMinutes: number },
): number {
  if (grade === null) return 0
  let amount = rules.bonusVnd[grade]
  if (rules.prorateByHours && pay.kind === 'hourly' && rules.standardMonthlyMinutes > 0) {
    amount *= Math.min(1, pay.workedMinutes / rules.standardMonthlyMinutes)
  }
  return Math.max(0, Math.round(amount / 1000) * 1000)
}

/** Bộ KPI hợp lệ: 3–6 chỉ số, trọng số nguyên dương cộng đúng 100 */
export function checkWeights(
  weights: readonly number[],
): { ok: true } | { ok: false; message: string } {
  if (weights.length < 3 || weights.length > 6) {
    return { ok: false, message: 'Bộ KPI có từ 3 tới 6 chỉ số' }
  }
  if (weights.some((w) => !Number.isInteger(w) || w < 1 || w > 100)) {
    return { ok: false, message: 'Trọng số là số nguyên từ 1 tới 100' }
  }
  const sum = weights.reduce((a, b) => a + b, 0)
  if (sum !== 100) return { ok: false, message: `Tổng trọng số đang là ${sum}% — phải đúng 100%` }
  return { ok: true }
}
