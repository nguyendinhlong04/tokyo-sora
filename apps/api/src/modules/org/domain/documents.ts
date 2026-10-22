import type { DecisionType, DocTarget, PersonnelChange } from '@sora/contracts'
import { branchUnitId, inScope, subtreeIds, type OrgSnapshot, type Scope } from './org'

/**
 * Văn bản nội bộ — hàm thuần: tới tay ai, người ký có đủ phạm vi không, quyết
 * định nhân sự đổi sơ đồ ra sao.
 */

type Fail = { ok: false; code: string; message: string }

/** Một người có khớp một quy tắc người nhận không — đọc trên ảnh chụp ĐÃ áp quyết định */
export function matchesTarget(target: DocTarget, staffId: number, snap: OrgSnapshot): boolean {
  const person = snap.people.get(staffId)
  if (!person || !person.active || person.roles.length === 0) return false
  const held = snap.holdings.filter((h) => h.staffId === staffId)
  const heldUnits = held
    .map((h) => snap.positions.get(h.positionId)?.unitId)
    .filter((id): id is number => id !== undefined)

  switch (target.kind) {
    case 'toan-chuoi':
      return true
    case 'chi-nhanh': {
      if (person.employeeBranchId === target.branchId) return true
      if (person.roles.some((g) => g.branchId === target.branchId)) return true
      const unit = branchUnitId(target.branchId, snap.units)
      if (unit === null) return false
      const tree = subtreeIds(unit, snap.children)
      return heldUnits.some((id) => tree.has(id))
    }
    case 'don-vi': {
      const tree = target.includeChildren
        ? subtreeIds(target.unitId, snap.children)
        : new Set([target.unitId])
      if (heldUnits.some((id) => tree.has(id))) return true
      // Gửi cả đơn vị chi nhánh thì người chưa xếp ghế ở chi nhánh đó cũng nhận
      const branchId = snap.units.get(target.unitId)?.branchId ?? null
      return (
        target.includeChildren &&
        branchId !== null &&
        held.length === 0 &&
        person.employeeBranchId === branchId
      )
    }
    case 'chuc-danh':
      return held.some((h) => h.positionId === target.positionId)
    case 'vai-tro':
      return person.roles.some(
        (g) =>
          g.role === target.role &&
          (target.branchId === null || g.branchId === null || g.branchId === target.branchId),
      )
    case 'ca-nhan':
      return staffId === target.staffId
  }
}

/** Danh sách người nhận cụ thể — bỏ trùng, bỏ người ngừng hoạt động, bỏ người soạn/ký */
export function resolveRecipients(
  targets: DocTarget[],
  snap: OrgSnapshot,
  exclude: number[] = [],
): number[] {
  const skip = new Set(exclude)
  const out: number[] = []
  for (const person of snap.people.values()) {
    if (skip.has(person.staffId)) continue
    if (targets.some((t) => matchesTarget(t, person.staffId, snap))) out.push(person.staffId)
  }
  return out.sort((a, b) => a - b)
}

/**
 * Người ký có đủ phạm vi cho mọi quy tắc nhận không. Quản lý ca ký thông báo cho
 * chi nhánh mình, không ký được thông báo "toàn chuỗi" hay gửi sang chi nhánh khác.
 */
export function targetsWithinScope(scope: Scope, targets: DocTarget[], snap: OrgSnapshot): boolean {
  if (scope.chain) return true
  return targets.every((t) => {
    switch (t.kind) {
      case 'toan-chuoi':
        return false
      case 'chi-nhanh':
        return scope.branchIds.has(t.branchId)
      case 'don-vi':
        return scope.unitIds.has(t.unitId)
      case 'chuc-danh': {
        const position = snap.positions.get(t.positionId)
        return position !== undefined && scope.unitIds.has(position.unitId)
      }
      case 'vai-tro':
        return t.branchId !== null && scope.branchIds.has(t.branchId)
      case 'ca-nhan':
        return inScope(scope, t.staffId, snap)
    }
  })
}

export interface OpenAssignment {
  id: number
  staffId: number
  positionId: number
  kind: 'chinh' | 'kiem-nhiem'
  fromDate: string
}

export interface PersonnelPlan {
  ok: true
  close: { assignmentId: number; toDate: string }[]
  insert: { staffId: number; positionId: number; kind: 'chinh' | 'kiem-nhiem'; fromDate: string }[]
}

/**
 * Quyết định nhân sự → các dòng lịch sử chức danh phải đóng và phải mở.
 *
 * Bổ nhiệm / điều chuyển chức CHÍNH: đóng chức chính đang giữ đúng ngày hiệu lực
 * (khoảng nửa mở nên không có ngày nào hai ghế), mở ghế mới. Kiêm nhiệm: chỉ mở
 * thêm. Miễn nhiệm: đóng đúng ghế ghi trong quyết định.
 */
export function planPersonnelChanges(input: {
  decisionType: DecisionType
  effectiveFrom: string
  changes: PersonnelChange[]
  open: OpenAssignment[]
}): PersonnelPlan | Fail {
  const plan: PersonnelPlan = { ok: true, close: [], insert: [] }
  const closed = new Set<number>()
  const close = (a: OpenAssignment): Fail | null => {
    if (a.fromDate > input.effectiveFrom) {
      return {
        ok: false,
        code: 'assignment_overlap',
        message: 'Ngày hiệu lực sớm hơn ngày người này nhận chức đang giữ',
      }
    }
    if (!closed.has(a.id)) {
      closed.add(a.id)
      plan.close.push({ assignmentId: a.id, toDate: input.effectiveFrom })
    }
    return null
  }

  for (const change of input.changes) {
    const mine = input.open.filter((a) => a.staffId === change.staffId && !closed.has(a.id))

    if (input.decisionType === 'mien-nhiem') {
      const seat = mine.find((a) => a.positionId === change.positionId)
      if (!seat) {
        return {
          ok: false,
          code: 'assignment_not_found',
          message: 'Người này không giữ chức danh ghi trong quyết định miễn nhiệm',
        }
      }
      const fail = close(seat)
      if (fail) return fail
      continue
    }

    if (mine.some((a) => a.positionId === change.positionId)) {
      return {
        ok: false,
        code: 'change_invalid',
        message: 'Người này đang giữ đúng chức danh ghi trong quyết định',
      }
    }
    if (change.assignmentKind === 'chinh') {
      const main = mine.find((a) => a.kind === 'chinh')
      if (main) {
        const fail = close(main)
        if (fail) return fail
      }
    }
    plan.insert.push({
      staffId: change.staffId,
      positionId: change.positionId,
      kind: change.assignmentKind,
      fromDate: input.effectiveFrom,
    })
  }
  return plan
}

/** Tiền tố số hiệu — chữ không dấu như ON/ĐB của mã đơn */
export const DOC_NUMBER_PREFIX = {
  'thong-bao': 'TB',
  'quyet-dinh': 'QD',
  'quy-dinh': 'QYD',
} as const

/** `QD-2610-0007` — kỳ đánh số là tháng của ngày ký */
export function formatDocNumber(
  kind: keyof typeof DOC_NUMBER_PREFIX,
  signedOn: string,
  counter: number,
): string {
  return `${DOC_NUMBER_PREFIX[kind]}-${signedOn.slice(2, 4)}${signedOn.slice(5, 7)}-${String(counter).padStart(4, '0')}`
}
