import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Put,
  Req,
  UseInterceptors,
} from '@nestjs/common'
import { InvoiceBuyerSchema } from '@sora/contracts'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import { assertOwnTableSession } from '../identity/actor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { EinvoiceService } from './einvoice.service'
import { TaxCodesService } from './tax-codes.service'

/** null = "Bán cho người tiêu dùng" */
const BuyerBody = z.object({ buyer: InvoiceBuyerSchema.nullable() })

/**
 * Hoá đơn điện tử nhìn từ quầy và từ bàn. Sổ hoá đơn của kế toán (F3) nằm ở
 * `AccountingController`.
 */
@Controller('api')
export class EinvoiceController {
  constructor(
    private readonly einvoice: EinvoiceService,
    private readonly taxCodes: TaxCodesService,
  ) {}

  /**
   * POS P10/P11 và iPad T10/T11/T15. Không gắn quyền: khách tại bàn (R0) chỉ hỏi
   * được bàn của mình, nhân viên hỏi được mọi bàn — đúng cửa của tạm tính (`bill`).
   */
  @Get('table-sessions/:id/invoice')
  sessionInvoice(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    assertOwnTableSession(req.actor!, id)
    return this.einvoice.statusForSession(id)
  }

  /**
   * Khai thông tin xuất hoá đơn của bàn — POS P10 và iPad T10/T11. Cùng quyền với
   * gọi món: ai gọi món được cho bàn thì khai được người mua cho bàn đó.
   */
  @Put('table-sessions/:id/invoice-buyer')
  @RequirePermission('order.create')
  @UseInterceptors(IdempotencyInterceptor)
  setBuyer(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    assertOwnTableSession(req.actor!, id)
    return this.einvoice.setBuyerForSession(id, BuyerBody.parse(body).buyer, req.actor!)
  }

  /**
   * Gõ MST là điền sẵn tên, địa chỉ — POS, iPad bàn, Office F3. Không gắn quyền:
   * nhân viên nào cũng có thể đang nhập người mua, iPad chỉ khi bàn đang mở (khách).
   */
  @Get('tax-codes/:code')
  lookupTaxCode(@Param('code') code: string, @Req() req: RequestWithActor) {
    const actor = req.actor!
    if (actor.kind === 'staff') {
      return this.taxCodes.lookup(code, { key: `staff:${actor.staffId}`, staff: true })
    }
    if (actor.kind === 'customer') {
      return this.taxCodes.lookup(code, { key: `table:${actor.tableSessionId}`, staff: false })
    }
    throw new ForbiddenException('Thiết bị này không tra được mã số thuế')
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
