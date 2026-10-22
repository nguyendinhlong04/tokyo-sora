import type { InvoiceState } from '@sora/contracts'

/**
 * Trạng thái hoá đơn điện tử — sổ F3 và ngăn chi tiết cùng đọc.
 *
 * Để riêng, không trong `routes/InvoiceDetail.tsx`: sổ F3 import tĩnh một hằng của file đó
 * là kéo cả ngăn chi tiết — form người mua và zod — về chunk chung của F2–F6, trong khi
 * ngăn chỉ tải lúc mở một tờ (CLAUDE.md §8).
 */
export const INVOICE_STATE_LABELS: Record<InvoiceState, { label: string; tone: BadgeTone }> = {
  pending: { label: 'Chờ phát hành', tone: 'warn' },
  issued: { label: 'Đã phát hành', tone: 'ok' },
  failed: { label: 'Chưa lên được', tone: 'danger' },
  voided: { label: 'Đã huỷ', tone: 'neutral' },
  replaced: { label: 'Đã thay thế', tone: 'neutral' },
}

type BadgeTone = 'neutral' | 'ok' | 'warn' | 'danger'
