import { useQuery } from '@tanstack/react-query'
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { api } from '../api'
import { useSession } from '../session-context'
import { Field, Select } from './form'

interface ConfigBranchValue {
  /** Chi nhánh mà nhóm màn cài đặt đang đọc và GHI — mặc định là chi nhánh phiên */
  branchId: string | null
  sessionBranchId: string | null
  setBranchId: (next: string) => void
}

const ConfigBranchCtx = createContext<ConfigBranchValue | null>(null)

/**
 * Chi nhánh đang cấu hình của nhóm màn cài đặt theo chi nhánh
 * (O10 · O11 · R3 · A3 · A4 · A5 · A6 · A9).
 *
 * Hệ có ba cách nói "chi nhánh nào", mỗi cách cho một loại màn:
 * - Màn VẬN HÀNH (kho, nhân sự, kế toán…) dùng chi nhánh phiên — đổi là đăng
 *   nhập lại đúng phạm vi (triết lý ở session-context).
 * - Màn BÁO CÁO dùng ReportBranchProvider — màn đọc, đảo nhanh để so sánh.
 * - Màn CÀI ĐẶT dùng provider này. Chúng là chỗ khai cấu hình RIÊNG từng chi
 *   nhánh (vùng giao, sơ đồ bàn, máy in…), và người khai là quản trị chuỗi ngồi
 *   một chỗ khai cho cả ba nơi — bắt đăng nhập lại ba lần để khai ba chi nhánh
 *   là biến một buổi cài đặt thành ba buổi.
 *
 * Tách khỏi bộ chọn của nhóm báo cáo có chủ đích: đây là màn GHI. Đang so doanh
 * thu chi nhánh B rồi ghé qua sửa máy in mà lựa chọn báo cáo kéo theo được thì
 * cái máy in sửa nhầm đó nằm ở chi nhánh B. Hai lựa chọn sống độc lập; cùng
 * mặc định là chi nhánh phiên, cùng tự reset khi đăng xuất theo provider.
 *
 * Quyền vẫn do guard máy chủ cưỡng chế trên TỪNG lượt gọi (mọi endpoint cài đặt
 * đều nhận `?branch=` tường minh) — ô chọn này chỉ là tiện dụng, không phải chốt.
 */
export function ConfigBranchProvider({ children }: { children: ReactNode }) {
  const { branchId: sessionBranch } = useSession()
  const [choice, setChoice] = useState<string | null>(null)

  const value = useMemo(
    () => ({
      branchId: choice ?? sessionBranch,
      sessionBranchId: sessionBranch,
      setBranchId: setChoice,
    }),
    [choice, sessionBranch],
  )
  return <ConfigBranchCtx.Provider value={value}>{children}</ConfigBranchCtx.Provider>
}

export function useConfigBranch(): ConfigBranchValue {
  const value = useContext(ConfigBranchCtx)
  if (!value) throw new Error('useConfigBranch phải nằm trong <ConfigBranchProvider>')
  return value
}

/**
 * Ô chọn chi nhánh của màn cài đặt — đặt trong khe `action` của PageHeader.
 *
 * Khi chọn khác chi nhánh phiên thì nói thẳng ra ngay dưới ô: thanh bên vẫn ghi
 * "Chi nhánh đang xem" theo phiên, và một màn GHI đang nhắm nơi khác là thứ
 * người dùng phải thấy được mà không cần nhớ.
 */
export function ConfigBranchPicker() {
  const { branchId, sessionBranchId, setBranchId } = useConfigBranch()
  const branches = useQuery({ queryKey: ['public-branches'], queryFn: api.publicBranches })

  // Chưa tải xong thì tạm hiện mã chi nhánh — ô không nhảy bề rộng khi data về
  const options =
    branches.data?.map((b) => ({ value: b.id, label: b.name })) ??
    (branchId ? [{ value: branchId, label: branchId }] : [])
  const away = sessionBranchId !== null && branchId !== null && branchId !== sessionBranchId

  return (
    <div>
      <Field label="Chi nhánh đang cấu hình">
        <Select
          value={branchId ?? ''}
          onChange={setBranchId}
          options={options}
          disabled={!branches.data}
          width={200}
        />
      </Field>
      {away ? (
        <p className="mt-1 text-[length:var(--fs-c1)] text-warn">
          Khác chi nhánh đăng nhập ({sessionBranchId})
        </p>
      ) : null}
    </div>
  )
}
