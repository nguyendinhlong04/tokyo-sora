import type { Metadata } from 'next'
import { BookingFlow } from '../../../components/BookingFlow'
import { getBranches } from '../../../lib/site'

export const metadata: Metadata = {
  title: 'Đặt bàn',
  description:
    'Đặt bàn tại Tokyo Sora trong ba bước: chọn chi nhánh, chọn giờ còn trống thật, để lại tên và số điện thoại.',
  alternates: { canonical: '/dat-ban' },
  // Suất giữ chỗ và mã đặt bàn không phải thứ để Google lưu lại
  robots: { index: true, follow: true },
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const one = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)

/**
 * W6 — Đặt bàn.
 *
 * Chi nhánh dựng sẵn ở máy chủ để bước 1 hiện ra ngay; lưới khung giờ thì phải
 * hỏi lúc chạy vì nó đổi theo từng phút.
 */
export default async function BookingPage({ searchParams }: PageProps) {
  const params = await searchParams
  const branches = await getBranches()

  const branchId = one(params['chi-nhanh'])
  const date = one(params.ngay)
  const guests = Number(one(params.khach))

  return (
    <BookingFlow
      branches={branches}
      initial={{
        branchId: branches.some((b) => b.id === branchId) ? branchId : undefined,
        date: date && /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : undefined,
        guestCount: Number.isInteger(guests) && guests >= 1 && guests <= 10 ? guests : undefined,
      }}
    />
  )
}
