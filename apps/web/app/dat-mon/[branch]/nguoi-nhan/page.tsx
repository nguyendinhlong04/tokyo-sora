import type { Metadata } from 'next'
import { RecipientForm } from './RecipientForm'

export const metadata: Metadata = {
  title: 'Người nhận — Tokyo Sora',
  robots: { index: false, follow: false },
}

export default async function RecipientPage({ params }: { params: Promise<{ branch: string }> }) {
  const { branch } = await params
  return <RecipientForm branchId={branch} />
}
