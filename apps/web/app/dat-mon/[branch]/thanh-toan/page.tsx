import type { Metadata } from 'next'
import { PayStep } from './PayStep'

export const metadata: Metadata = {
  title: 'Thanh toán — Tokyo Sora',
  robots: { index: false, follow: false },
}

export default async function PayPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params
  return <PayStep branchId={branch} />
}
