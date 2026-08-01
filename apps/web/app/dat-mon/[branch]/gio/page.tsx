import type { Metadata } from 'next'
import { CartAndSlot } from './CartAndSlot'

/** Giỏ hàng KHÔNG index (§23.1.3) — nội dung riêng của từng phiên, không có gì để tìm kiếm */
export const metadata: Metadata = {
  title: 'Giỏ của bạn — Tokyo Sora',
  robots: { index: false, follow: false },
}

export default async function CartPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params
  return <CartAndSlot branchId={branch} />
}
