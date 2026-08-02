import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseInterceptors } from '@nestjs/common'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import { assertOwnTableSession } from '../identity/actor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { FloorplanService } from './floorplan.service'
import { OrderingService } from './ordering.service'

const OpenTableBody = z.object({
  guestCount: z.number().int().min(1).max(50),
  note: z.string().max(300).nullish(),
  /** Bàn có đặt chỗ sắp tới thì phải xác nhận lần hai mới mở (P3) */
  ignoreReservation: z.boolean().optional(),
})

const AddLinesBody = z.object({
  lines: z
    .array(
      z.object({
        dishId: z.string().min(1),
        qty: z.number().int().min(1).max(99),
        note: z.string().max(300).nullish(),
        modifierOptionIds: z.array(z.string()).max(20).optional(),
        batchNo: z.number().int().min(1).max(20).optional(),
        setSelections: z
          .array(z.object({ groupId: z.string(), dishIds: z.array(z.string()) }))
          .optional(),
      }),
    )
    .min(1)
    .max(50),
})

const VoidLineBody = z.object({
  reason: z.string().min(1).max(300),
  approval: z
    .object({
      approverStaffId: z.number().int().positive(),
      approverPin: z.string().regex(/^\d{4,6}$/),
      reason: z.string().min(1).max(300),
    })
    .nullish(),
})

@Controller('api')
@UseInterceptors(IdempotencyInterceptor)
export class OrderingController {
  constructor(
    private readonly floorplan: FloorplanService,
    private readonly ordering: OrderingService,
  ) {}

  /** P2 sơ đồ bàn */
  @Get('tables')
  tables(@Query('branch') branch: string) {
    return this.floorplan.floorplan(branch)
  }

  /** P3 mở bàn */
  @Post('tables/:id/open')
  @RequirePermission('order.create')
  openTable(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.floorplan.openTable(id, OpenTableBody.parse(body), req.actor!)
  }

  /** Đóng bàn sau khi trả đủ */
  @Post('table-sessions/:id/close')
  @RequirePermission('table.close-after-paid')
  closeSession(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.floorplan.closeSession(id, req.actor!)
  }

  /** P7 chi tiết đơn của bàn · T8 đơn của bàn trên điện thoại khách */
  @Get('table-sessions/:id/order')
  sessionOrder(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    assertOwnTableSession(req.actor!, id)
    return this.ordering.getSessionOrder(id)
  }

  /** P4 thêm món vào phiếu order (chưa gửi bếp) */
  @Post('table-sessions/:id/lines')
  @RequirePermission('order.create')
  addLines(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.ordering.addLines(id, AddLinesBody.parse(body).lines, req.actor!)
  }

  /** P4 nút GỬI BẾP */
  @Post('table-sessions/:id/send')
  @RequirePermission('order.create')
  send(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.ordering.sendToKitchen(id, req.actor!)
  }

  /** P7 "Ra đợt tiếp" — đồng hồ vé bắt đầu chạy từ đây */
  @Post('orders/:id/batches/:batchNo/fire')
  @RequirePermission('order.create')
  fireBatch(
    @Param('id', ParseIntPipe) id: number,
    @Param('batchNo', ParseIntPipe) batchNo: number,
    @Req() req: RequestWithActor,
  ) {
    return this.ordering.fireBatch(id, batchNo, req.actor!)
  }

  /**
   * P8 huỷ món. Không gắn @RequirePermission vì quyền phụ thuộc ngữ cảnh: món chưa
   * gửi bếp thì ai gọi được cũng huỷ được, đã gửi bếp thì cần duyệt — service tự
   * phân biệt qua ApprovalService.
   */
  @Post('order-lines/:id/void')
  voidLine(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.ordering.voidLine(id, VoidLineBody.parse(body), req.actor!)
  }
}
