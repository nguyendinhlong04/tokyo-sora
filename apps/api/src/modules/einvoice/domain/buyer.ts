import type { InvoiceBuyer } from '@sora/contracts'

/**
 * Người mua ghi lên đơn, theo người gửi.
 *
 * Hồ sơ khách doanh nghiệp B15 (`corporateId`) chỉ nhân viên gắn được: gắn là kéo
 * theo công nợ và hạn mức của công ty đó. iPad bàn hay khách web gửi kèm thì bỏ —
 * MST, tên, địa chỉ của họ vẫn giữ nguyên.
 */
export function buyerFrom(
  buyer: InvoiceBuyer | null | undefined,
  byStaff: boolean,
): InvoiceBuyer | null {
  if (!buyer) return null
  if (buyer.kind !== 'company' || byStaff || buyer.corporateId === undefined) return buyer
  const { corporateId: _dropped, ...rest } = buyer
  return rest
}
