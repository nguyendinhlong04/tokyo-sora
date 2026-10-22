import { SectionLabel } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { api, type Approval } from '../api'
import { useSession } from '../session-context'

export interface ApprovalDraft {
  approverId: number | null
  pin: string
}

export const EMPTY_APPROVAL: ApprovalDraft = { approverId: null, pin: '' }

/** Đủ để gửi: có người duyệt và PIN 4–6 số */
export function approvalReady(draft: ApprovalDraft): boolean {
  return draft.approverId !== null && draft.pin.length >= 4
}

export function approvalOf(draft: ApprovalDraft, reason: string): Approval | null {
  return approvalReady(draft)
    ? { approverStaffId: draft.approverId!, approverPin: draft.pin, reason }
    : null
}

/** Lỗi 400 `requires_approval` — hiện ô duyệt rồi gửi lại cùng lượt */
export function needsApprovalError(err: unknown): boolean {
  const e = err as { code?: string | null; body?: { code?: string } }
  return e.code === 'requires_approval' || e.body?.code === 'requires_approval'
}

/**
 * Ô duyệt △ (§4.2): quản lý ca chọn tên và gõ PIN ngay trên máy này. Người duyệt
 * phải khác người xin — máy chủ kiểm lần cuối (`approvals_separation_of_duties`).
 */
export function ApprovalFields({
  value,
  onChange,
  note,
}: {
  value: ApprovalDraft
  onChange: (next: ApprovalDraft) => void
  /** Vì sao cần duyệt — một câu, nói bằng việc đang làm */
  note: string
}) {
  const { branchId } = useSession()
  const staff = useQuery({
    queryKey: ['staff', branchId],
    queryFn: () => api.staffList(branchId!),
    enabled: Boolean(branchId),
  })

  return (
    <div className="flex flex-col gap-3 rounded-md border border-warn p-3">
      <SectionLabel>Quản lý duyệt</SectionLabel>
      <p className="text-[length:var(--fs-b2)] text-warn">{note}</p>
      <select
        value={value.approverId ?? ''}
        onChange={(e) =>
          onChange({ ...value, approverId: e.target.value ? Number(e.target.value) : null })
        }
        aria-label="Người duyệt"
        className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 text-ink-hi"
      >
        <option value="">Chọn người duyệt</option>
        {staff.data?.map((p) => (
          <option key={p.id} value={p.id}>
            {p.fullName} ({p.roles.join(' · ')})
          </option>
        ))}
      </select>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        value={value.pin}
        onChange={(e) => onChange({ ...value, pin: e.target.value })}
        placeholder="PIN người duyệt"
        aria-label="PIN người duyệt"
        className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-surface-3 px-3 font-mono text-ink-hi"
      />
    </div>
  )
}
