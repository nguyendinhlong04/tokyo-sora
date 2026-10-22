import { describe, expect, it } from 'vitest'
import {
  formatDocNumber,
  matchesTarget,
  planPersonnelChanges,
  resolveRecipients,
  targetsWithinScope,
  type OpenAssignment,
} from './documents'
import { buildSnapshot, scopeOf, type Person } from './org'

/** Chuỗi mẫu gọn: công ty → CG (sảnh, bếp) và HT */
const snap = (extraPeople: Person[] = []) =>
  buildSnapshot({
    units: [
      { id: 1, parentId: null, kind: 'cong-ty', branchId: null, active: true },
      { id: 3, parentId: 1, kind: 'chi-nhanh', branchId: 'cg', active: true },
      { id: 4, parentId: 3, kind: 'bo-phan', branchId: null, active: true },
      { id: 5, parentId: 3, kind: 'bo-phan', branchId: null, active: true },
      { id: 7, parentId: 1, kind: 'chi-nhanh', branchId: 'ht', active: true },
    ],
    positions: [
      { id: 11, unitId: 3, isHead: true, active: true },
      { id: 12, unitId: 4, isHead: false, active: true },
      { id: 13, unitId: 5, isHead: true, active: true },
    ],
    holdings: [
      { staffId: 101, positionId: 11, kind: 'chinh', fromDate: '2026-01-01', toDate: null },
      { staffId: 102, positionId: 12, kind: 'chinh', fromDate: '2026-01-01', toDate: null },
      { staffId: 103, positionId: 13, kind: 'chinh', fromDate: '2026-01-01', toDate: null },
    ],
    people: [
      {
        staffId: 100,
        active: true,
        employeeBranchId: null,
        roles: [{ role: 'R10', branchId: null }],
      },
      {
        staffId: 101,
        active: true,
        employeeBranchId: 'cg',
        roles: [{ role: 'R7', branchId: 'cg' }],
      },
      {
        staffId: 102,
        active: true,
        employeeBranchId: 'cg',
        roles: [{ role: 'R1', branchId: 'cg' }],
      },
      {
        staffId: 103,
        active: true,
        employeeBranchId: 'cg',
        roles: [{ role: 'R5', branchId: 'cg' }],
      },
      // Hoa chưa có ghế ở CG
      {
        staffId: 106,
        active: true,
        employeeBranchId: 'cg',
        roles: [{ role: 'R2', branchId: 'cg' }],
      },
      // Tâm ở HT
      {
        staffId: 105,
        active: true,
        employeeBranchId: 'ht',
        roles: [{ role: 'R1', branchId: 'ht' }],
      },
      // Nghỉ việc, và tài khoản dở dang không vai trò
      {
        staffId: 107,
        active: false,
        employeeBranchId: 'cg',
        roles: [{ role: 'R1', branchId: 'cg' }],
      },
      { staffId: 108, active: true, employeeBranchId: null, roles: [] },
      ...extraPeople,
    ],
    date: '2026-10-22',
  })

describe('Người nhận theo quy tắc', () => {
  const s = snap()

  it('toàn chuỗi: mọi người đang làm có vai trò', () => {
    expect(resolveRecipients([{ kind: 'toan-chuoi' }], s)).toEqual([100, 101, 102, 103, 105, 106])
  })

  it('chi nhánh: theo hồ sơ, vai trò, hoặc ghế trong cây chi nhánh', () => {
    expect(resolveRecipients([{ kind: 'chi-nhanh', branchId: 'cg' }], s)).toEqual([
      101, 102, 103, 106,
    ])
  })

  it('đơn vị: ghế trong cây con; gửi cả chi nhánh thì người chưa xếp ghế cũng nhận', () => {
    expect(resolveRecipients([{ kind: 'don-vi', unitId: 4, includeChildren: true }], s)).toEqual([
      102,
    ])
    expect(resolveRecipients([{ kind: 'don-vi', unitId: 3, includeChildren: true }], s)).toEqual([
      101, 102, 103, 106,
    ])
    expect(resolveRecipients([{ kind: 'don-vi', unitId: 3, includeChildren: false }], s)).toEqual([
      101,
    ])
  })

  it('chức danh, vai trò, cá nhân', () => {
    expect(matchesTarget({ kind: 'chuc-danh', positionId: 13 }, 103, s)).toBe(true)
    expect(matchesTarget({ kind: 'vai-tro', role: 'R1', branchId: 'cg' }, 102, s)).toBe(true)
    expect(matchesTarget({ kind: 'vai-tro', role: 'R1', branchId: 'cg' }, 105, s)).toBe(false)
    expect(matchesTarget({ kind: 'ca-nhan', staffId: 105 }, 105, s)).toBe(true)
  })

  it('bỏ trùng giữa các quy tắc, bỏ người soạn và người ký', () => {
    expect(
      resolveRecipients(
        [
          { kind: 'chi-nhanh', branchId: 'cg' },
          { kind: 'ca-nhan', staffId: 102 },
        ],
        s,
        [101, 100],
      ),
    ).toEqual([102, 103, 106])
  })
})

describe('Phạm vi người ký', () => {
  const s = snap()

  it('quản lý ca CG ký cho chi nhánh mình — không ký "toàn chuỗi", không gửi sang HT', () => {
    const scope = scopeOf(101, 'doc', s)
    expect(targetsWithinScope(scope, [{ kind: 'chi-nhanh', branchId: 'cg' }], s)).toBe(true)
    expect(
      targetsWithinScope(scope, [{ kind: 'don-vi', unitId: 5, includeChildren: true }], s),
    ).toBe(true)
    expect(targetsWithinScope(scope, [{ kind: 'ca-nhan', staffId: 106 }], s)).toBe(true)
    expect(targetsWithinScope(scope, [{ kind: 'toan-chuoi' }], s)).toBe(false)
    expect(targetsWithinScope(scope, [{ kind: 'chi-nhanh', branchId: 'ht' }], s)).toBe(false)
    expect(targetsWithinScope(scope, [{ kind: 'vai-tro', role: 'R1', branchId: null }], s)).toBe(
      false,
    )
  })

  it('chủ quán ký gì cũng được', () => {
    expect(targetsWithinScope(scopeOf(100, 'doc', s), [{ kind: 'toan-chuoi' }], s)).toBe(true)
  })
})

describe('Quyết định nhân sự → lịch sử chức danh', () => {
  const open: OpenAssignment[] = [
    { id: 1, staffId: 102, positionId: 12, kind: 'chinh', fromDate: '2026-01-01' },
    { id: 2, staffId: 103, positionId: 13, kind: 'chinh', fromDate: '2026-11-15' },
  ]

  it('bổ nhiệm chức chính: đóng chức cũ đúng ngày hiệu lực, mở chức mới', () => {
    const plan = planPersonnelChanges({
      decisionType: 'bo-nhiem',
      effectiveFrom: '2026-11-01',
      changes: [{ staffId: 102, positionId: 11, assignmentKind: 'chinh' }],
      open,
    })
    expect(plan).toEqual({
      ok: true,
      close: [{ assignmentId: 1, toDate: '2026-11-01' }],
      insert: [{ staffId: 102, positionId: 11, kind: 'chinh', fromDate: '2026-11-01' }],
    })
  })

  it('kiêm nhiệm không đóng chức chính', () => {
    const plan = planPersonnelChanges({
      decisionType: 'bo-nhiem',
      effectiveFrom: '2026-11-01',
      changes: [{ staffId: 102, positionId: 13, assignmentKind: 'kiem-nhiem' }],
      open,
    })
    expect(plan.ok && plan.close).toEqual([])
  })

  it('ngày hiệu lực trước ngày nhận chức đang giữ là chồng khoảng', () => {
    const plan = planPersonnelChanges({
      decisionType: 'dieu-chuyen',
      effectiveFrom: '2026-11-01',
      changes: [{ staffId: 103, positionId: 11, assignmentKind: 'chinh' }],
      open,
    })
    expect(plan).toMatchObject({ ok: false, code: 'assignment_overlap' })
  })

  it('miễn nhiệm đóng đúng ghế ghi trong quyết định; không giữ ghế đó thì báo', () => {
    expect(
      planPersonnelChanges({
        decisionType: 'mien-nhiem',
        effectiveFrom: '2026-11-01',
        changes: [{ staffId: 102, positionId: 12, assignmentKind: 'chinh' }],
        open,
      }),
    ).toEqual({ ok: true, close: [{ assignmentId: 1, toDate: '2026-11-01' }], insert: [] })
    expect(
      planPersonnelChanges({
        decisionType: 'mien-nhiem',
        effectiveFrom: '2026-11-01',
        changes: [{ staffId: 102, positionId: 13, assignmentKind: 'chinh' }],
        open,
      }),
    ).toMatchObject({ ok: false, code: 'assignment_not_found' })
  })

  it('bổ nhiệm vào đúng ghế đang giữ là quyết định sai', () => {
    expect(
      planPersonnelChanges({
        decisionType: 'bo-nhiem',
        effectiveFrom: '2026-11-01',
        changes: [{ staffId: 102, positionId: 12, assignmentKind: 'chinh' }],
        open,
      }),
    ).toMatchObject({ ok: false, code: 'change_invalid' })
  })
})

describe('Số hiệu văn bản', () => {
  it('tiền tố theo loại, kỳ đánh số là tháng ký', () => {
    expect(formatDocNumber('thong-bao', '2026-10-22', 1)).toBe('TB-2610-0001')
    expect(formatDocNumber('quyet-dinh', '2026-11-03', 27)).toBe('QD-2611-0027')
    expect(formatDocNumber('quy-dinh', '2027-01-01', 3)).toBe('QYD-2701-0003')
  })
})
