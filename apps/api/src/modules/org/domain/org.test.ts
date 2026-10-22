import { describe, expect, it } from 'vitest'
import {
  ancestorIds,
  branchOfUnit,
  buildSnapshot,
  inEffect,
  inScope,
  managersOf,
  scopeOf,
  subtreeIds,
  wouldCycle,
  type Holding,
  type Person,
  type PositionNode,
  type UnitNode,
} from './org'

/**
 * Chuỗi mẫu: công ty → khối vận hành → CG (sảnh, bếp → tổ nướng) và HT; khối
 * văn phòng đứng riêng.
 */
const UNITS: UnitNode[] = [
  { id: 1, parentId: null, kind: 'cong-ty', branchId: null, active: true },
  { id: 2, parentId: 1, kind: 'khoi', branchId: null, active: true },
  { id: 3, parentId: 2, kind: 'chi-nhanh', branchId: 'cg', active: true },
  { id: 4, parentId: 3, kind: 'bo-phan', branchId: null, active: true },
  { id: 5, parentId: 3, kind: 'bo-phan', branchId: null, active: true },
  { id: 6, parentId: 5, kind: 'to', branchId: null, active: true },
  { id: 7, parentId: 2, kind: 'chi-nhanh', branchId: 'ht', active: true },
  { id: 8, parentId: 1, kind: 'khoi', branchId: null, active: true },
]

const POSITIONS: PositionNode[] = [
  { id: 10, unitId: 2, isHead: true, active: true }, // Quản lý chuỗi
  { id: 11, unitId: 3, isHead: true, active: true }, // Quản lý chi nhánh CG
  { id: 12, unitId: 4, isHead: false, active: true }, // Phục vụ
  { id: 13, unitId: 5, isHead: true, active: true }, // Bếp trưởng
  { id: 14, unitId: 6, isHead: false, active: true }, // Đầu bếp nướng
  { id: 15, unitId: 7, isHead: true, active: true }, // Quản lý chi nhánh HT
  { id: 16, unitId: 4, isHead: false, active: true }, // Quản lý ca
]

const person = (
  staffId: number,
  roles: Person['roles'],
  employeeBranchId: string | null = null,
): Person => ({ staffId, active: true, employeeBranchId, roles })

const PEOPLE: Person[] = [
  person(100, [{ role: 'R11', branchId: null }]),
  person(101, [{ role: 'R7', branchId: 'cg' }], 'cg'),
  person(102, [{ role: 'R1', branchId: 'cg' }], 'cg'), // Minh
  person(103, [{ role: 'R5', branchId: 'cg' }], 'cg'), // bếp trưởng
  person(104, [{ role: 'R4', branchId: 'cg' }], 'cg'), // Đức
  person(105, [{ role: 'R1', branchId: 'ht' }], 'ht'), // Tâm — chưa có ghế
  person(106, [{ role: 'R2', branchId: 'cg' }], 'cg'), // Hoa — chưa có ghế
  person(107, [{ role: 'R7', branchId: 'cg' }], 'cg'), // Lan — quản lý ca, không phải trưởng
  person(108, [{ role: 'R10', branchId: null }]),
  person(109, [{ role: 'R13', branchId: null }]),
  person(110, [{ role: 'R7', branchId: 'ht' }], 'ht'), // sắp làm trưởng HT
]

const hold = (
  staffId: number,
  positionId: number,
  fromDate = '2026-01-01',
  toDate: string | null = null,
  kind: Holding['kind'] = 'chinh',
): Holding => ({ staffId, positionId, kind, fromDate, toDate })

const HOLDINGS: Holding[] = [
  hold(100, 10),
  hold(101, 11),
  hold(102, 12),
  hold(103, 13),
  hold(104, 14),
  hold(107, 16),
  // Bổ nhiệm ghi ngày hiệu lực tương lai — hôm nay chưa tính
  hold(110, 15, '2026-12-01'),
]

const TODAY = '2026-10-22'
const snap = (holdings = HOLDINGS, people = PEOPLE, units = UNITS) =>
  buildSnapshot({ units, positions: POSITIONS, holdings, people, date: TODAY })

describe('Khoảng hiệu lực nửa mở [from, to)', () => {
  it('ngày cuối là ngày TRƯỚC to_date', () => {
    const a = { fromDate: '2026-10-01', toDate: '2026-11-01' }
    expect(inEffect(a, '2026-09-30')).toBe(false)
    expect(inEffect(a, '2026-10-01')).toBe(true)
    expect(inEffect(a, '2026-10-31')).toBe(true)
    expect(inEffect(a, '2026-11-01')).toBe(false)
  })

  it('đóng bằng chính ngày mở là khoảng rỗng — sửa nhầm trong ngày không cần xoá', () => {
    expect(inEffect({ fromDate: '2026-10-22', toDate: '2026-10-22' }, '2026-10-22')).toBe(false)
  })
})

describe('Cây đơn vị', () => {
  const s = snap()

  it('tổ tiên gần nhất trước, không gồm chính nó', () => {
    expect(ancestorIds(6, s.units)).toEqual([5, 3, 2, 1])
    expect(ancestorIds(1, s.units)).toEqual([])
  })

  it('cây con gồm chính nó', () => {
    expect([...subtreeIds(3, s.children)].sort()).toEqual([3, 4, 5, 6])
  })

  it('thả vào chính mình hoặc vào cháu là vòng; sang nhánh khác thì không', () => {
    expect(wouldCycle(2, 2, s.units)).toBe(true)
    expect(wouldCycle(2, 6, s.units)).toBe(true)
    expect(wouldCycle(6, 7, s.units)).toBe(false)
  })

  it('dữ liệu lỡ có vòng thì dừng, không treo', () => {
    const looped = snap(HOLDINGS, PEOPLE, [
      ...UNITS,
      { id: 20, parentId: 21, kind: 'to', branchId: null, active: true },
      { id: 21, parentId: 20, kind: 'to', branchId: null, active: true },
    ])
    expect(ancestorIds(20, looped.units)).toEqual([21])
  })

  it('chi nhánh của đơn vị suy từ tổ tiên gần nhất', () => {
    expect(branchOfUnit(6, s.units)).toBe('cg')
    expect(branchOfUnit(8, s.units)).toBeNull()
  })
})

describe('Phạm vi theo cây', () => {
  it('quản lý chuỗi nhìn toàn chuỗi; nhân sự toàn chuỗi ở sơ đồ nhưng không giao việc vận hành', () => {
    const s = snap()
    expect(scopeOf(100, 'task', s)).toEqual({ chain: true })
    expect(scopeOf(109, 'org', s)).toEqual({ chain: true })
    const hrTask = scopeOf(109, 'task', s)
    expect(hrTask.chain).toBe(false)
    expect(inScope(hrTask, 102, s)).toBe(false)
  })

  it('trưởng chi nhánh phủ cả người CHƯA có ghế ở chi nhánh mình', () => {
    const s = snap()
    const scope = scopeOf(101, 'task', s)
    expect(inScope(scope, 102, s)).toBe(true)
    expect(inScope(scope, 106, s)).toBe(true) // Hoa chưa xếp ghế
    expect(inScope(scope, 105, s)).toBe(false) // Tâm ở HT
  })

  it('bếp trưởng không với tới người ở sảnh', () => {
    const s = snap()
    const scope = scopeOf(103, 'task', s)
    expect(inScope(scope, 104, s)).toBe(true)
    expect(inScope(scope, 102, s)).toBe(false)
    expect(inScope(scope, 106, s)).toBe(false)
  })

  it('quản lý ca (R7) điều hành cả chi nhánh dù không ngồi ghế trưởng — không với sang HT', () => {
    const s = snap()
    const scope = scopeOf(107, 'task', s)
    expect(inScope(scope, 102, s)).toBe(true)
    expect(inScope(scope, 104, s)).toBe(true)
    expect(inScope(scope, 105, s)).toBe(false)
  })

  it('kiêm nhiệm hai đơn vị thì phạm vi là hợp hai cây', () => {
    const s = snap([...HOLDINGS, hold(103, 15, '2026-01-01', null, 'kiem-nhiem')])
    const scope = scopeOf(103, 'task', s)
    expect(inScope(scope, 104, s)).toBe(true)
    expect(inScope(scope, 105, s)).toBe(true) // Tâm chưa có ghế ở HT
  })

  it('bổ nhiệm chưa tới ngày hiệu lực chưa cho phạm vi nào', () => {
    const s = snap()
    const scope = scopeOf(110, 'task', s)
    // Có R7 ở HT nên vẫn phủ HT qua vai trò — nhưng KHÔNG nhờ ghế trưởng tương lai
    expect(scope.chain).toBe(false)
    if (!scope.chain) expect([...scope.unitIds]).toEqual([7])
  })
})

describe('Cấp trên trực tiếp', () => {
  it('nhân viên lên trưởng gần nhất phía trên', () => {
    const s = snap()
    expect(managersOf(102, s)).toEqual([101])
    expect(managersOf(104, s)).toEqual([103])
  })

  it('trưởng đơn vị lên trưởng của đơn vị cha', () => {
    const s = snap()
    expect(managersOf(103, s)).toEqual([101])
    expect(managersOf(101, s)).toEqual([100])
  })

  it('người chưa có ghế lên trưởng chi nhánh của hồ sơ', () => {
    expect(managersOf(106, snap())).toEqual([101])
  })

  it('ghế trưởng trống (hoặc chưa tới ngày nhận) thì đi tiếp lên trên', () => {
    expect(managersOf(105, snap())).toEqual([100])
    const vacant = snap(HOLDINGS.filter((h) => h.staffId !== 101))
    expect(managersOf(102, vacant)).toEqual([100])
  })

  it('sơ đồ chưa có chi nhánh thì dự phòng theo vai trò: quản lý ca → quản lý chuỗi', () => {
    const people = [
      ...PEOPLE,
      person(120, [{ role: 'R1', branchId: 'td' }], 'td'),
      person(121, [{ role: 'R7', branchId: 'td' }], 'td'),
    ]
    expect(managersOf(120, snap(HOLDINGS, people))).toEqual([121])
    const noLead = people.filter((p) => p.staffId !== 121)
    expect(managersOf(120, snap(HOLDINGS, noLead))).toEqual([100])
  })

  it('không bao giờ trả chính mình — quản lý chuỗi lên chủ', () => {
    expect(managersOf(100, snap())).toEqual([108])
  })
})
