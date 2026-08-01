import type { Metadata } from 'next'
import { apiGet, type Branch } from '../../lib/api'
import { BranchPicker } from './BranchPicker'

export const metadata: Metadata = {
  title: 'Đặt món online — Tokyo Sora',
  description:
    'Chọn chi nhánh Tokyo Sora gần bạn, đặt món mang về hoặc giao tận nơi. Bò nướng than hoa, hải sản, set phần.',
}

/** O1 — chọn chi nhánh & kiểu nhận. Trang này ĐƯỢC index (§23.1.3) */
export default async function ChooseBranchPage() {
  const branches = await apiGet<Branch[]>('/api/online/branches').catch(() => [])

  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-32">
      <h1 className="font-display text-[length:var(--fs-d2)] leading-tight font-light text-ink-hi">
        Đặt món mang về
      </h1>
      <p className="mt-3 text-[length:var(--fs-b1)] text-ink-mute">
        Chọn chi nhánh gần bạn, rồi chọn cách nhận.
      </p>

      {branches.length === 0 ? (
        <p className="mt-8 rounded-md border border-warn p-4 text-[length:var(--fs-b1)] text-gold-200">
          Chưa tải được danh sách chi nhánh. Tải lại trang giúp bạn, hoặc gọi 024 3782 4400.
        </p>
      ) : (
        <BranchPicker branches={branches} />
      )}
    </main>
  )
}
