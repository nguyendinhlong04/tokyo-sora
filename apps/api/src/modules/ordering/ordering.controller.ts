import { Body, Controller, Get, Param, ParseIntPipe, Post, Query, Req, UseInterceptors } from '@nestjs/common'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import { assertOwnTableSession } from '../identity/actor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { FloorplanService } from './floorplan.service'
import { OrderingService } from './ordering.service'
import { QuickKeysService } from './quick-keys.service'

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

/** P9 tách món: đích là bàn đang có khách (`targetSessionId`) hoặc bàn trống (`targetTableId`) */
const TransferBody = z.object({
  lineIds: z.array(z.number().int().positive()).min(1).max(200),
  targetSessionId: z.number().int().positive().nullish(),
  targetTableId: z.number().int().positive().nullish(),
  guestCount: z.number().int().min(1).max(50).nullish(),
  confirmReroute: z.boolean().optional(),
})

const MoveBody = z.object({
  tableId: z.number().int().positive(),
  confirmReroute: z.boolean().optional(),
})

const MergeBody = z.object({
  targetSessionId: z.number().int().positive(),
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
    private readonly quick: QuickKeysService,
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

  /** P5 bàn phím nhanh — 20 món bán chạy tuần qua */
  @Get('quick-keys')
  @RequirePermission('order.create')
  quickKeys(@Query('branch') branch: string) {
    return this.quick.quickKeys(branch)
  }

  /** P9 chuyển cả bàn sang bàn trống */
  @Post('table-sessions/:id/move')
  @RequirePermission('table.move-merge-split')
  moveSession(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    const input = MoveBody.parse(body)
    return this.ordering.moveSession(id, input.tableId, input, req.actor!)
  }

  /** P9 tách món sang bàn khác */
  @Post('table-sessions/:id/transfer')
  @RequirePermission('table.move-merge-split')
  transferLines(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.ordering.transferLines(id, TransferBody.parse(body), req.actor!)
  }

  /** P9 ghép cả bàn vào bàn đích */
  @Post('table-sessions/:id/merge')
  @RequirePermission('table.move-merge-split')
  mergeSessions(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.ordering.mergeSessions(id, MergeBody.parse(body).targetSessionId, req.actor!)
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
