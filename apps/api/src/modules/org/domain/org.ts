import type { Role } from '@sora/contracts'

/**
 * Sơ đồ tổ chức — hàm thuần, không đụng Nest hay Drizzle.
 *
 * Mọi câu hỏi "ai quản ai" của hệ thống đi qua đây: giao việc cho ai được, văn
 * bản tới tay ai, ai chấm KPI ai. Service nạp một ẢNH CHỤP (đơn vị, chức danh,
 * người giữ đang hiệu lực, vai trò) rồi hỏi các hàm này — nên test được trọn
 * vẹn mà không cần CSDL.
 */

export interface UnitNode {
  id: number
  parentId: number | null
  kind: string
  branchId: string | null
  active: boolean
}

export interface PositionNode {
  id: number
  unitId: number
  isHead: boolean
  active: boolean
}

export interface Holding {
  staffId: number
  positionId: number
  kind: 'chinh' | 'kiem-nhiem'
  fromDate: string
  /** Ngày đầu tiên KHÔNG còn giữ — khoảng nửa mở */
  toDate: string | null
}

export interface RoleGrant {
  role: Role
  /** null = vai trò toàn chuỗi */
  branchId: string | null
}

export interface Person {
  staffId: number
  active: boolean
  /** Chi nhánh chính theo hồ sơ H1 */
  employeeBranchId: string | null
  roles: RoleGrant[]
}

export interface OrgSnapshot {
  units: Map<number, UnitNode>
  children: Map<number, number[]>
  positions: Map<number, PositionNode>
  /** Chức danh trưởng (đang hoạt động) của từng đơn vị */
  headOf: Map<number, number>
  /** Chỉ những dòng ĐANG hiệu lực ở ngày chụp */
  holdings: Holding[]
  people: Map<number, Person>
}

/** Độ sâu tối đa khi đi trên cây — dữ liệu lỡ có vòng thì dừng, không treo */
const MAX_DEPTH = 64

/** Khoảng nửa mở: from ≤ ngày < to */
export function inEffect(a: { fromDate: string; toDate: string | null }, date: string): boolean {
  return a.fromDate <= date && (a.toDate === null || date < a.toDate)
}

export function buildSnapshot(input: {
  units: UnitNode[]
  positions: PositionNode[]
  holdings: Holding[]
  people: Person[]
  date: string
}): OrgSnapshot {
  const units = new Map(input.units.map((u) => [u.id, u]))
  const children = new Map<number, number[]>()
  for (const u of input.units) {
    if (u.parentId === null) continue
    const list = children.get(u.parentId) ?? []
    list.push(u.id)
    children.set(u.parentId, list)
  }
  const positions = new Map(input.positions.map((p) => [p.id, p]))
  const headOf = new Map<number, number>()
  for (const p of input.positions) if (p.isHead && p.active) headOf.set(p.unitId, p.id)
  return {
    units,
    children,
    positions,
    headOf,
    holdings: input.holdings.filter((h) => inEffect(h, input.date)),
    people: new Map(input.people.map((p) => [p.staffId, p])),
  }
}

/** Tổ tiên của một đơn vị, gần nhất trước, KHÔNG gồm chính nó */
export function ancestorIds(unitId: number, units: Map<number, UnitNode>): number[] {
  const out: number[] = []
  let current = units.get(unitId)?.parentId ?? null
  while (current !== null && out.length < MAX_DEPTH) {
    if (out.includes(current) || current === unitId) break
    out.push(current)
    current = units.get(current)?.parentId ?? null
  }
  return out
}

/** Cây con, GỒM chính nó */
export function subtreeIds(unitId: number, children: Map<number, number[]>): Set<number> {
  const out = new Set<number>([unitId])
  const stack = [unitId]
  while (stack.length > 0) {
    const id = stack.pop()!
    for (const child of children.get(id) ?? []) {
      if (out.has(child)) continue
      out.add(child)
      stack.push(child)
    }
  }
  return out
}

/** Đặt `unitId` vào dưới `newParentId` có tạo vòng không */
export function wouldCycle(
  unitId: number,
  newParentId: number,
  units: Map<number, UnitNode>,
): boolean {
  return newParentId === unitId || ancestorIds(newParentId, units).includes(unitId)
}

/** Chi nhánh của một đơn vị: chính nó hoặc tổ tiên gần nhất mang mã chi nhánh */
export function branchOfUnit(unitId: number, units: Map<number, UnitNode>): string | null {
  for (const id of [unitId, ...ancestorIds(unitId, units)]) {
    const branchId = units.get(id)?.branchId ?? null
    if (branchId) return branchId
  }
  return null
}

export function branchUnitId(branchId: string, units: Map<number, UnitNode>): number | null {
  for (const u of units.values()) if (u.branchId === branchId) return u.id
  return null
}

// ------------------------------------------------------------------ Phạm vi

export type ScopeDomain = 'org' | 'task' | 'doc' | 'kpi' | 'report'

export type Scope = { chain: true } | { chain: false; unitIds: Set<number>; branchIds: Set<string> }

/**
 * Ai nhìn toàn chuỗi ở từng miền. R10/R11 điều hành cả chuỗi; R13 lo con người
 * nên toàn chuỗi ở sơ đồ, văn bản, KPI — nhưng KHÔNG giao việc vận hành hộ quản
 * lý chi nhánh.
 */
const CHAIN_ROLES: Record<ScopeDomain, readonly Role[]> = {
  org: ['R10', 'R11', 'R13'],
  doc: ['R10', 'R11', 'R13'],
  kpi: ['R10', 'R11', 'R13'],
  task: ['R10', 'R11'],
  report: ['R10', 'R11'],
}

/**
 * Phạm vi của một người: hợp các cây con mà người đó đang là TRƯỞNG, cộng cả
 * chi nhánh nếu có vai trò quản lý ca (R7) gắn chi nhánh — dự phòng khi sơ đồ
 * chưa dựng, và vì quản lý ca điều hành cả ca chứ không riêng một bộ phận.
 *
 * Vai trò đọc từ `staff_roles`, không từ actor: actor đã trộn vai trò của thiết
 * bị đang đứng, mà đứng ở màn bếp không làm ai thành trưởng bếp.
 */
export function scopeOf(staffId: number, domain: ScopeDomain, snap: OrgSnapshot): Scope {
  const person = snap.people.get(staffId)
  if (!person || !person.active) return { chain: false, unitIds: new Set(), branchIds: new Set() }
  if (person.roles.some((g) => CHAIN_ROLES[domain].includes(g.role))) return { chain: true }

  const unitIds = new Set<number>()
  const branchIds = new Set<string>()
  for (const h of snap.holdings) {
    if (h.staffId !== staffId) continue
    const position = snap.positions.get(h.positionId)
    if (!position?.isHead || !position.active) continue
    for (const id of subtreeIds(position.unitId, snap.children)) unitIds.add(id)
  }
  for (const grant of person.roles) {
    if (grant.role !== 'R7' || !grant.branchId) continue
    branchIds.add(grant.branchId)
    const unit = branchUnitId(grant.branchId, snap.units)
    if (unit !== null) for (const id of subtreeIds(unit, snap.children)) unitIds.add(id)
  }
  for (const id of unitIds) {
    const branchId = snap.units.get(id)?.branchId
    if (branchId) branchIds.add(branchId)
  }
  return { chain: false, unitIds, branchIds }
}

/**
 * Người đích có nằm trong phạm vi không: giữ một chức danh trong cây con của
 * phạm vi, hoặc chưa giữ chức danh nào mà thuộc chi nhánh của phạm vi — sơ đồ
 * dựng dở thì người chưa xếp ghế vẫn có quản lý.
 */
export function inScope(scope: Scope, targetStaffId: number, snap: OrgSnapshot): boolean {
  if (scope.chain) return true
  const held = snap.holdings.filter((h) => h.staffId === targetStaffId)
  if (held.length > 0) {
    return held.some((h) => {
      const position = snap.positions.get(h.positionId)
      return position !== undefined && scope.unitIds.has(position.unitId)
    })
  }
  const person = snap.people.get(targetStaffId)
  if (!person) return false
  if (person.employeeBranchId) return scope.branchIds.has(person.employeeBranchId)
  return person.roles.some((g) => g.branchId !== null && scope.branchIds.has(g.branchId))
}

// ------------------------------------------------------------- Cấp trên trực tiếp

/**
 * Cấp trên trực tiếp: đi ngược lên cây từ đơn vị của chức danh chính, tới đơn
 * vị đầu tiên có người đang ngồi ghế trưởng (khác chính mình). Bản thân là
 * trưởng thì bắt đầu từ đơn vị cha. Ghế trưởng trống thì đi tiếp lên trên.
 *
 * Không tới được ai (sơ đồ dựng dở) thì dự phòng theo vai trò: quản lý ca của
 * chi nhánh → quản lý chuỗi → chủ. Trả về danh sách vì dự phòng có thể ra nhiều
 * người — nơi gọi chọn người đầu tiên hoặc gửi cho cả nhóm.
 */
export function managersOf(staffId: number, snap: OrgSnapshot): number[] {
  const person = snap.people.get(staffId)
  if (!person) return []

  const held = snap.holdings.filter((h) => h.staffId === staffId)
  const main = held.find((h) => h.kind === 'chinh') ?? held[0]
  const mainPosition = main ? snap.positions.get(main.positionId) : undefined

  let start: number | null = null
  if (mainPosition) {
    start = mainPosition.isHead
      ? (snap.units.get(mainPosition.unitId)?.parentId ?? null)
      : mainPosition.unitId
  } else if (person.employeeBranchId) {
    start = branchUnitId(person.employeeBranchId, snap.units)
  }

  if (start !== null) {
    for (const unitId of [start, ...ancestorIds(start, snap.units)]) {
      const head = snap.headOf.get(unitId)
      if (head === undefined) continue
      const holders = snap.holdings
        .filter((h) => h.positionId === head && h.staffId !== staffId)
        .map((h) => h.staffId)
        .filter((id) => snap.people.get(id)?.active)
      if (holders.length > 0) return [...new Set(holders)].sort((a, b) => a - b)
    }
  }

  const branchId = mainPosition
    ? branchOfUnit(mainPosition.unitId, snap.units)
    : person.employeeBranchId
  const byRole = (role: Role, branch: string | null | undefined) =>
    [...snap.people.values()]
      .filter(
        (p) =>
          p.active &&
          p.staffId !== staffId &&
          p.roles.some((g) => g.role === role && (branch === undefined || g.branchId === branch)),
      )
      .map((p) => p.staffId)
      .sort((a, b) => a - b)

  if (branchId) {
    const leads = byRole('R7', branchId)
    if (leads.length > 0) return leads
  }
  const chain = byRole('R11', undefined)
  if (chain.length > 0) return chain
  return byRole('R10', undefined)
}
