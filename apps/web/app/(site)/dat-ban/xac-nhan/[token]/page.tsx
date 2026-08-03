import type { Metadata } from 'next'
import { ConfirmReservation } from './ConfirmReservation'

/** Suất của riêng một khách — không phải thứ để Google lưu lại (§23.1.3) */
export const metadata: Metadata = {
  title: 'Đặt chỗ của bạn — Tokyo Sora',
  robots: { index: false, follow: false },
}

export default async function ReconfirmPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return <ConfirmReservation token={token} />
}
