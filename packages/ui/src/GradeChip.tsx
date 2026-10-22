import type { KpiGrade, KpiRules } from '@sora/contracts'
import { emberColor } from '@sora/core'

/** Hạng → thang than hồng, nghĩa "nóng = cần can thiệp": A tro · B đồng · C than · D lửa */
export const KPI_GRADE_HEAT: Record<KpiGrade, number> = { A: 0.2, B: 0.55, C: 0.85, D: 1.2 }

/**
 * Nhiệt của một % đạt (hay một điểm) theo ngưỡng hạng của kỳ — cùng thước với
 * hạng, để thanh của một chỉ số và chip hạng của cả phiếu nói cùng một ngôn ngữ.
 * Kỳ còn nháp (chưa chụp luật) thì dùng mặc định A6.
 */
export function kpiHeat(
  pct: number,
  rules: Pick<KpiRules, 'gradeA' | 'gradeB' | 'gradeC'> | null,
): number {
  const r = rules ?? { gradeA: 105, gradeB: 95, gradeC: 80 }
  return KPI_GRADE_HEAT[pct >= r.gradeA ? 'A' : pct >= r.gradeB ? 'B' : pct >= r.gradeC ? 'C' : 'D']
}

/**
 * Hạng KPI — Office (N10, N1, H7) và Kênh nhân viên (N14). Màu không bao giờ đứng
 * một mình: luôn có chữ "Hạng B"; chưa xếp loại (độ phủ dữ liệu thấp) thì nói rõ
 * chứ không để trống, kẻo người đọc tưởng là hạng thấp nhất.
 */
export function GradeChip({ grade }: { grade: KpiGrade | null }) {
  if (grade === null) {
    return <span className="text-[length:var(--fs-c1)] text-ink-mute">Chưa xếp loại</span>
  }
  return (
    <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-b2)] font-semibold text-ink-hi">
      <span
        aria-hidden="true"
        className="size-2.5 rounded-pill"
        style={{ backgroundColor: emberColor(KPI_GRADE_HEAT[grade]) }}
      />
      Hạng {grade}
    </span>
  )
}
