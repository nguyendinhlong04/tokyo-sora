import { Controller, Get, Param, ParseIntPipe, Post, Req } from '@nestjs/common'
import { assertOwnTableSession } from '../identity/actor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { EinvoiceService } from './einvoice.service'

/**
 * Hoá đơn điện tử nhìn từ quầy và từ bàn. Sổ hoá đơn của kế toán (F3) nằm ở
 * `AccountingController`.
 */
@Controller('api')
export class EinvoiceController {
  constructor(private readonly einvoice: EinvoiceService) {}

  /**
   * POS P10/P11 và iPad T10/T11/T15. Không gắn quyền: khách tại bàn (R0) chỉ hỏi
   * được bàn của mình, nhân viên hỏi được mọi bàn — đúng cửa của tạm tính (`bill`).
   */
  @Get('table-sessions/:id/invoice')
  sessionInvoice(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    assertOwnTableSession(req.actor!, id)
    return this.einvoice.statusForSession(id)
  }

  @Get('orders/:id/invoice')
  @RequirePermission('einvoice.issue')
  orderInvoice(@Param('id', ParseIntPipe) id: number) {
    return this.einvoice.statusForOrder(id)
  }

  /**
   * Phát hành (lại) hoá đơn của một đơn đã trả đủ. Gửi lại bao nhiêu lần cũng chỉ
   * một hoá đơn: đơn đã có hoá đơn thì 409, đang chờ thì đẩy lại đúng hoá đơn đó.
   */
  @Post('orders/:id/invoice/issue')
  @RequirePermission('einvoice.issue')
  issue(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.einvoice.issueForOrder(id, req.actor!)
  }
}
