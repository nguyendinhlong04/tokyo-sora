import type { OrgPositionView, OrgUnitView } from '@sora/contracts'

/**
 * Mô hình hiển thị của sơ đồ — code thuần, không React.
 *
 * Máy chủ chỉ trả cây con trong phạm vi người xem, nên có thể có NHIỀU gốc (một
 * quản lý phụ trách hai bộ phận ở hai nhánh). Mọi hàm ở đây làm việc trên rừng,
 * không giả định một gốc.
 */

export interface Forest {
  roots: OrgUnitView[]
  childrenOf: Map<number, OrgUnitView[]>
  byId: Map<number, OrgUnitView>
}

const byOrder = (a: OrgUnitView, b: OrgUnitView) =>
  a.sort - b.sort || a.name.localeCompare(b.name, 'vi')

export function buildForest(units: OrgUnitView[]): Forest {
  const byId = new Map(units.map((u) => [u.id, u]))
  const childrenOf = new Map<number, OrgUnitView[]>()
  const roots: OrgUnitView[] = []
  for (const u of units) {
    if (u.parentId === null || !byId.has(u.parentId)) {
      roots.push(u)
      continue
    }
    const list = childrenOf.get(u.parentId) ?? []
    list.push(u)
    childrenOf.set(u.parentId, list)
  }
  for (const list of childrenOf.values()) list.sort(byOrder)
  return { roots: roots.sort(byOrder), childrenOf, byId }
}

/** Tổ tiên gần nhất trước — cho đường dẫn và để mở nhánh tới một nút */
export function ancestorsOf(unitId: number, forest: Forest): OrgUnitView[] {
  const out: OrgUnitView[] = []
  let current = forest.byId.get(unitId)?.parentId ?? null
  while (current !== null && out.length < 64) {
    const unit = forest.byId.get(current)
    if (!unit) break
    out.push(unit)
    current = unit.parentId
  }
  return out
}

/** Cây con gồm chính nó — để loại khỏi ô chọn đơn vị cha (thả vào cháu là vòng) */
export function descendantIds(unitId: number, forest: Forest): Set<number> {
  const out = new Set<number>([unitId])
  const stack = [unitId]
  while (stack.length > 0) {
    for (const child of forest.childrenOf.get(stack.pop()!) ?? []) {
      if (out.has(child.id)) continue
      out.add(child.id)
      stack.push(child.id)
    }
  }
  return out
}

/** Danh sách đơn vị theo thứ tự cây, kèm độ sâu — cho ô chọn thụt lề */
export function flatten(forest: Forest): { unit: OrgUnitView; depth: number }[] {
  const out: { unit: OrgUnitView; depth: number }[] = []
  const walk = (unit: OrgUnitView, depth: number) => {
    out.push({ unit, depth })
    for (const child of forest.childrenOf.get(unit.id) ?? []) walk(child, depth + 1)
  }
  for (const root of forest.roots) walk(root, 0)
  return out
}

export function positionsByUnit(positions: OrgPositionView[]): Map<number, OrgPositionView[]> {
  const out = new Map<number, OrgPositionView[]>()
  for (const p of positions) {
    const list = out.get(p.unitId) ?? []
    list.push(p)
    out.set(p.unitId, list)
  }
  // Trưởng đơn vị đứng đầu, còn lại theo thứ tự khai
  for (const list of out.values()) {
    list.sort((a, b) => Number(b.isHead) - Number(a.isHead) || a.sort - b.sort || a.id - b.id)
  }
  return out
}

/**
 * Định biên của một chức danh. "Thực có" chỉ đếm người giữ chức CHÍNH đang hiệu
 * lực — kiêm nhiệm hiện riêng, vì một người kiêm hai ghế không lấp được hai chỗ
 * trống trên sàn cùng lúc.
 */
export function staffing(p: OrgPositionView) {
  const current = p.holders.filter((h) => !h.upcoming)
  const filled = current.filter((h) => h.kind === 'chinh').length
  const concurrent = current.filter((h) => h.kind === 'kiem-nhiem').length
  const upcoming = p.holders.filter((h) => h.upcoming).length
  return { filled, concurrent, upcoming, gap: p.headcount - filled }
}

/**
 * Độ "nóng" của một chức danh trên thang than hồng — cùng chiều với mức cạn kho
 * ở S2: thiếu càng nhiều càng nóng. Ghế trưởng không có ai (kể cả kiêm nhiệm) là
 * lửa: đơn vị đó không có cấp trên trực tiếp. `null` = chức danh không khai định
 * biên, không có gì để đo.
 */
export function staffingHeat(p: OrgPositionView): number | null {
  const s = staffing(p)
  if (p.isHead && s.filled + s.concurrent === 0) return 1.01
  if (p.headcount <= 0) return null
  return Math.max(0, s.gap) / p.headcount
}

/** Chữ đi kèm màu — màu không bao giờ là thông tin duy nhất */
export function staffingLabel(p: OrgPositionView): string {
  const s = staffing(p)
  if (p.isHead && s.filled === 0) return s.concurrent > 0 ? 'Kiêm nhiệm' : 'Trống trưởng'
  if (s.gap > 0) return `Thiếu ${s.gap}`
  if (s.gap < 0) return `Vượt ${-s.gap}`
  return 'Đủ'
}

export function totals(positions: OrgPositionView[]) {
  let headcount = 0
  let filled = 0
  let vacant = 0
  let over = 0
  for (const p of positions) {
    const s = staffing(p)
    headcount += p.headcount
    filled += s.filled
    if (s.gap > 0) vacant += s.gap
    else over += -s.gap
  }
  return { headcount, filled, vacant, over }
}

/** Mã chi nhánh của một đơn vị: chính nó hoặc tổ tiên gần nhất */
export function branchOf(unitId: number, forest: Forest): string | null {
  const unit = forest.byId.get(unitId)
  if (unit?.branchId) return unit.branchId
  for (const a of ancestorsOf(unitId, forest)) if (a.branchId) return a.branchId
  return null
}
