import {
  INCIDENT_EXTERNAL_CATEGORIES,
  type IncidentCategory,
  type IncidentSeverity,
} from '@sora/contracts'

/**
 * Sự cố — hàm thuần. Ai được đóng, khi nào đóng được: những luật này quyết định
 * số "sự cố khắc phục đúng hạn" của KPI, nên test được không cần CSDL.
 */

type Result = { ok: true } | { ok: false; code: string; message: string }

const fail = (code: string, message: string): Result => ({ ok: false, code, message })

export const isSevere = (severity: IncidentSeverity) =>
  severity === 'nghiem-trong' || severity === 'rat-nghiem-trong'

/** TNLĐ, ATTP, cháy nổ mức nghiêm trọng trở lên phải khai báo ra ngoài */
export const needsExternalReport = (category: IncidentCategory, severity: IncidentSeverity) =>
  INCIDENT_EXTERNAL_CATEGORIES.includes(category) && isSevere(severity)

export interface ClosingCheck {
  severity: IncidentSeverity
  rootCause: string | null
  correctiveAction: string | null
  externalReportRequired: boolean
  externalReportedAt: Date | null
  openTasks: number
  reportedBy: number
  closer: number
  /** Người đóng có khoá `incident.close-severe` */
  closerMaySevere: boolean
}

export function canClose(c: ClosingCheck): Result {
  if (isSevere(c.severity)) {
    if (!c.closerMaySevere) {
      return fail('incident_needs_chain', 'Sự cố nghiêm trọng do quản lý chuỗi hoặc chủ đóng')
    }
    if (c.closer === c.reportedBy) {
      return fail('self_decision', 'Người báo sự cố nghiêm trọng không tự đóng sự cố đó')
    }
  }
  if (!c.rootCause?.trim() || !c.correctiveAction?.trim()) {
    return fail('incident_needs_cause', 'Ghi nguyên nhân gốc và biện pháp khắc phục trước khi đóng')
  }
  if (c.externalReportRequired && !c.externalReportedAt) {
    return fail(
      'incident_external_pending',
      'Sự cố này phải khai báo với cơ quan chức năng — ghi mốc khai báo trước khi đóng',
    )
  }
  if (c.openTasks > 0) {
    return fail('incident_open_tasks', `Còn ${c.openTasks} việc khắc phục chưa xong`)
  }
  return { ok: true }
}
