import {
  ROLES,
  ROLE_LABELS,
  permissionMatrix,
  type ActionKey,
  type Permission,
  type Role,
} from '@sora/contracts'
import { Badge, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api, type RoleAssignments } from '../api'
import { PageHeader } from '../components/PageHeader'

/**
 * A2 — Vai trò & quyền.
 *
 * Màn này ĐỌC ma trận §4.2, không sửa nó. Ma trận là hằng typed ở `@sora/contracts`
 * mà cả ba nơi cùng đọc: guard của API, màn này, và chỗ ẩn/hiện nút ở POS. Cho
 * phép bấm sửa ở đây nghĩa là quyền có thể lệch khỏi bản thiết kế lúc 11 giờ đêm,
 * còn hiện ra lưới đúng như tài liệu thì người quản lý kiểm được điều họ cần kiểm:
 * "vai trò này có được làm việc kia không".
 *
 * Nên màn này không đi qua mạng để lấy ma trận. Thứ máy chủ mới biết — và cũng là
 * câu hỏi thật khi mở A2 — là **ai đang giữ vai trò nào ở chi nhánh nào**.
 */

const PERMISSION_MARK: Record<Permission, { mark: string; className: string; title: string }> = {
  allow: { mark: '✓', className: 'text-ok', title: 'Làm được ngay' },
  approve: { mark: '△', className: 'text-warn', title: 'Làm được nhưng phải có người khác duyệt bằng PIN' },
  deny: { mark: '–', className: 'text-line-4', title: 'Không được phép' },
}

/** Ba nhóm của tài liệu: §4.2 vận hành, §4.2b nhân sự, §4.2b chi phí & báo cáo */
const GROUPS: { label: string; test: (action: ActionKey) => boolean }[] = [
  {
    label: 'Nhân sự (§4.2b)',
    test: (a) => a.startsWith('staff.') || a.startsWith('schedule.') || a.startsWith('timesheet.') || a.startsWith('payroll.'),
  },
  {
    label: 'Chi phí, tài sản & Lãi/Lỗ (§4.2b)',
    test: (a) => a.startsWith('expense.') || a.startsWith('asset.') || a.startsWith('report.pnl'),
  },
  { label: 'Vận hành & sổ sách (§4.2)', test: () => true },
]

export function Roles() {
  const [tab, setTab] = useState<'matrix' | 'scope'>('matrix')
  const assignments = useQuery({ queryKey: ['role-assignments'], queryFn: api.roleAssignments })

  const rows = useMemo(() => permissionMatrix(), [])
  const grouped = useMemo(() => {
    const seen = new Set<ActionKey>()
    return GROUPS.map((group) => {
      const items = rows.filter((r) => !seen.has(r.action) && group.test(r.action))
      for (const item of items) seen.add(item.action)
      return { label: group.label, items }
    }).filter((g) => g.items.length > 0)
  }, [rows])

  return (
    <>
      <PageHeader
        title="Vai trò & quyền"
        subtitle="Ma trận §4.2 dựng thành lưới. Đọc chứ không sửa: quyền là bản thiết kế, sửa quyền là sửa bản thiết kế rồi triển khai lại."
        action={
          <div className="flex overflow-hidden rounded-sm border border-line-1">
            {(
              [
                ['matrix', 'Ma trận quyền'],
                ['scope', 'Hạn mức & phạm vi'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`h-[var(--hit-target)] border-r border-line-1 px-4 text-[length:var(--fs-b2)] last:border-r-0 ${
                  tab === key ? 'bg-surface-3 text-ink-hi' : 'text-ink-mute hover:text-ink-hi'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-auto px-8 pb-8">
        {tab === 'matrix' ? (
          <>
            <div className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-[length:var(--fs-c1)] text-ink-mute">
              {(['allow', 'approve', 'deny'] as Permission[]).map((p) => (
                <span key={p} className="inline-flex items-center gap-2">
                  <span className={`font-mono ${PERMISSION_MARK[p].className}`}>
                    {PERMISSION_MARK[p].mark}
                  </span>
                  {PERMISSION_MARK[p].title}
                </span>
              ))}
            </div>

            {grouped.map((group) => (
              <section key={group.label} className="mb-6">
                <h2 className="mb-2 text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
                  {group.label}
                </h2>
                <div className="overflow-x-auto rounded-md border border-line-1 bg-surface-1">
                  <table className="w-full border-collapse text-[length:var(--fs-c1)]">
                    <thead>
                      <tr className="border-b border-line-1 bg-canvas">
                        <th className="sticky left-0 z-10 min-w-[320px] bg-canvas px-4 py-2.5 text-left font-semibold tracking-[0.1em] text-ink-mute uppercase">
                          Hành động
                        </th>
                        {ROLES.map((role) => (
                          <th
                            key={role}
                            title={ROLE_LABELS[role]}
                            className="w-[52px] px-1 py-2.5 font-mono font-semibold text-ink-mute"
                          >
                            {role}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {group.items.map((row) => (
                        <tr key={row.action} className="border-b border-line-1 last:border-b-0">
                          <td className="sticky left-0 z-10 bg-surface-1 px-4 py-2">
                            <span className="block text-ink-body">{row.label}</span>
                            {row.note ? (
                              <span className="mt-0.5 block text-[length:var(--fs-c2)] leading-relaxed text-ink-mute">
                                {row.note}
                              </span>
                            ) : null}
                            <span className="mt-0.5 block font-mono text-[length:var(--fs-c2)] text-line-4">
                              {row.action}
                            </span>
                          </td>
                          {ROLES.map((role) => {
                            const mark = PERMISSION_MARK[row.byRole[role]]
                            return (
                              <td
                                key={role}
                                title={`${ROLE_LABELS[role]} — ${mark.title}`}
                                className={`px-1 py-2 text-center font-mono ${mark.className}`}
                              >
                                {mark.mark}
                              </td>
                            )
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </>
        ) : assignments.isError ? (
          <ErrorState message={(assignments.error as Error).message} />
        ) : assignments.isPending ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          <ScopeTab data={assignments.data} />
        )}
      </div>
    </>
  )
}

/**
 * Tab "Hạn mức & phạm vi".
 *
 * Cố ý chỉ hiện những hạn mức CÓ THẬT và đang được cưỡng chế: mức giảm giá đến từ
 * hai dòng ma trận (≤10% và >10%), còn ngưỡng duyệt chi phí đến từ Trung tâm tham
 * số A6. Dựng thêm một ô "giảm giá tối đa theo vai trò" mà không có engine nào
 * đọc là dựng một cái công tắc không nối dây — người sửa tin là đã đổi, thực tế
 * thì không.
 */
function ScopeTab({ data }: { data: RoleAssignments }) {
  const rows = useMemo(() => permissionMatrix(), [])
  const limitOf = (role: Role, action: ActionKey) =>
    rows.find((r) => r.action === action)?.byRole[role] ?? 'deny'

  const discountLabel = (role: Role) => {
    const over = limitOf(role, 'bill.discount-over-10')
    const upto = limitOf(role, 'bill.discount-upto-10')
    if (over === 'allow') return 'Không giới hạn'
    if (over === 'approve') return '>10% — cần duyệt'
    if (upto === 'allow') return 'Tới 10%'
    if (upto === 'approve') return 'Tới 10% — cần duyệt'
    return 'Không được giảm'
  }

  return (
    <>
      <div className="overflow-x-auto rounded-md border border-line-1 bg-surface-1">
        <table className="w-full border-collapse text-[length:var(--fs-c1)]">
          <thead>
            <tr className="border-b border-line-1 bg-canvas">
              <th className="min-w-[240px] px-4 py-2.5 text-left font-semibold tracking-[0.1em] text-ink-mute uppercase">
                Vai trò
              </th>
              <th className="min-w-[200px] px-4 py-2.5 text-left font-semibold tracking-[0.1em] text-ink-mute uppercase">
                Giảm giá tối đa
              </th>
              <th className="min-w-[190px] px-4 py-2.5 text-left font-semibold tracking-[0.1em] text-ink-mute uppercase">
                Phiếu chi
              </th>
              <th className="px-4 py-2.5 text-left font-semibold tracking-[0.1em] text-ink-mute uppercase">
                Người đang giữ vai trò
              </th>
            </tr>
          </thead>
          <tbody>
            {data.roles
              .filter((r) => r.code !== 'R0')
              .map((role) => {
                const holders = [
                  ...role.chainWide.map((h) => ({ ...h, where: 'toàn chuỗi' })),
                  ...data.branches.flatMap((b) =>
                    (role.byBranch[b.id] ?? []).map((h) => ({ ...h, where: b.name })),
                  ),
                ]
                return (
                  <tr key={role.code} className="border-b border-line-1 last:border-b-0">
                    <td className="px-4 py-2.5">
                      <span className="font-mono text-ink-mute">{role.code}</span>{' '}
                      <span className="text-ink-hi">{role.label}</span>
                    </td>
                    <td className="px-4 py-2.5 text-ink-body">{discountLabel(role.code as Role)}</td>
                    <td className="px-4 py-2.5 text-ink-body">
                      {expenseLabel(limitOf(role.code as Role, 'expense.record-over-limit'), limitOf(role.code as Role, 'expense.record-petty'))}
                    </td>
                    <td className="px-4 py-2.5">
                      {holders.length === 0 ? (
                        <span className="text-ink-mute">Chưa ai</span>
                      ) : (
                        <span className="flex flex-wrap gap-1.5">
                          {holders.map((h) => (
                            <span
                              key={`${h.staffId}:${h.where}`}
                              className="inline-flex h-[22px] items-center rounded-pill border border-line-3 px-2 text-[length:var(--fs-c2)] text-ink-body"
                            >
                              {h.fullName}
                              <span className="ml-1 text-ink-mute">{h.where}</span>
                            </span>
                          ))}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Badge tone="info">Con số hạn mức nằm ở A6</Badge>
        <p className="max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Hạn mức chi vặt, ngưỡng chủ duyệt và ngưỡng ghi nhận tài sản là ba tham số
          <span className="font-mono"> expense.* </span>
          ở Trung tâm tham số — sửa ở đó, cả hệ thống đổi theo. Bảng này chỉ nói vai trò nào rơi vào
          bước nào của luồng, vì đó là thứ ma trận quyết định chứ không phải con số.
        </p>
      </div>
    </>
  )
}

function expenseLabel(overLimit: Permission, petty: Permission): string {
  if (overLimit === 'allow') return 'Ghi mọi mức'
  if (overLimit === 'approve') return 'Trên hạn mức — cần duyệt'
  if (petty === 'allow') return 'Trong hạn mức chi vặt'
  return 'Không ghi phiếu chi'
}
