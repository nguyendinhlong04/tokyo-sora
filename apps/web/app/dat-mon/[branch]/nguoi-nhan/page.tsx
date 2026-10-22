import type { Metadata } from 'next'
import { apiGet, type OnlineMenu } from '../../../../lib/api'
import { RecipientForm } from './RecipientForm'

export const metadata: Metadata = {
  title: 'Người nhận — Tokyo Sora',
  robots: { index: false, follow: false },
}

export default async function RecipientPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params
  // Cùng địa chỉ khung chi nhánh đã gọi — Next gộp thành một lượt trong lần dựng
  const menu = await apiGet<OnlineMenu>(
    `/api/online/menu?branch=${encodeURIComponent(branch)}`,
  ).catch(() => null)
  return <RecipientForm branchId={branch} einvoiceEnabled={menu?.einvoiceEnabled ?? false} />
}
