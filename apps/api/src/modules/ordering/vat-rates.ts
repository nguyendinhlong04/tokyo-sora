import { rateToBp, VAT_RATE_PARAMS, type VatCode } from '@sora/contracts'
import type { ParamsService } from '../../common/params.service'

/**
 * Thuế suất của từng nhóm thuế tại một chi nhánh, basis point (800 = 8%).
 *
 * Thuế suất là tham số A6 chứ không nằm trên món: món ăn đang được giảm còn 8%
 * tới 31/12/2026 (NĐ 174/2025) rồi tuỳ Quốc hội, bia rượu giữ 10% — kế toán đổi
 * một con số là mọi đơn tính lại theo, không ai phải sửa từng món.
 *
 * Chưa khai thuế suất bia rượu thì theo thuế suất thường: cơ sở dữ liệu chưa chạy
 * 9008 vẫn tính ra đúng tiền như trước.
 */
export async function vatRatesOf(
  params: ParamsService,
  branchId: string,
): Promise<Record<VatCode, number>> {
  const standard = await params.getNumber(VAT_RATE_PARAMS.standard, 0, branchId)
  const alcohol = await params.getNumber(VAT_RATE_PARAMS.alcohol, standard, branchId)
  return { standard: rateToBp(standard), alcohol: rateToBp(alcohol) }
}
