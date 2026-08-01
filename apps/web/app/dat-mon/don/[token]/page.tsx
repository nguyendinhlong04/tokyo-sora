import type { Metadata } from 'next'
import { TrackOrder } from './TrackOrder'

/** Theo dõi đơn KHÔNG index — nội dung riêng của một khách (§23.1.3) */
export const metadata: Metadata = {
  title: 'Đơn của bạn — Tokyo Sora',
  robots: { index: false, follow: false },
}

export default async function TrackPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <TrackOrder token={token} />
}
