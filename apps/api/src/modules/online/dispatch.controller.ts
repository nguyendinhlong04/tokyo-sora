import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  Req,
  UseInterceptors,
} from '@nestjs/common'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import type { RequestWithActor } from '../identity/auth.guard'
import { RequirePermission } from '../identity/permission.guard'
import { ORDER_STATUSES } from '../ordering/domain/order-state'
import { DispatchService } from './dispatch.service'
import { OnlineService } from './online.service'

const StatusBody = z.object({ to: z.enum(ORDER_STATUSES) })
const CancelBody = z.object({ reason: z.string().min(1).max(300) })
const ShipperBody = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().max(20).nullish(),
  provider: z.string().max(60).nullish(),
})

const ManualOrderBody = z.object({
  branchId: z.string().min(1),
  channel: z.enum(['grab', 'shopee', 'be']),
  type: z.enum(['takeaway', 'delivery']),
  /** Mã đơn bên kênh — thứ nhân viên đọc để đối chiếu khi shipper của họ tới */
  externalCode: z.string().min(1).max(40),
  customer: z.object({
    name: z.string().max(120).nullish(),
    phone: z.string().max(20).nullish(),
    address: z.string().max(300).nullish(),
    note: z.string().max(300).nullish(),
  }),
  lines: z
    .array(
      z.object({
        dishId: z.string().min(1),
        qty: z.number().int().min(1).max(99),
        note: z.string().max(300).nullish(),
      }),
    )
    .min(1)
    .max(50),
})

/** O8 · O9 · O12 — điều phối đơn online trên POS */
@Controller('api')
@UseInterceptors(IdempotencyInterceptor)
export class DispatchController {
  constructor(
    private readonly dispatch: DispatchService,
    private readonly online: OnlineService,
  ) {}

  /** O8 bảng điều phối */
  @Get('orders')
  board(
    @Req() req: RequestWithActor,
    @Query('branch') branch?: string,
    @Query('date') date?: string,
    @Query('status') status?: string,
  ) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được')
    const parsed = status ? z.enum(ORDER_STATUSES).parse(status) : undefined
    return this.dispatch.board(branch ?? actor.branchId, {
      businessDate: date,
      status: parsed,
    })
  }

  /** O8 phần đã đóng trong ngày */
  @Get('orders/closed')
  closed(@Req() req: RequestWithActor, @Query('branch') branch: string, @Query('date') date: string) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được')
    if (!date) throw new BadRequestException('Thiếu ngày làm việc')
    return this.dispatch.closed(branch ?? actor.branchId, date)
  }

  /** O9 chi tiết đơn */
  @Get('orders/:id')
  detail(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.dispatch.detail(id, req.actor!)
  }

  /**
   * O9 đổi trạng thái. Không gắn `@RequirePermission`: ai bấm được bước nào là
   * việc của máy trạng thái §3 — bếp đẩy sang `cooking`, điều phối đẩy sang
   * `delivering`, và bảng quy tắc đó nằm ở một chỗ duy nhất.
   */
  @Post('orders/:id/status')
  setStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.dispatch.setStatus(id, StatusBody.parse(body).to, req.actor!)
  }

  /** O9 huỷ đơn, luôn kèm lý do */
  @Post('orders/:id/cancel')
  @RequirePermission('online-order.assign-shipper-or-cancel')
  cancel(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.dispatch.cancel(id, CancelBody.parse(body).reason, req.actor!)
  }

  /** P16 drawer gán shipper */
  @Post('orders/:id/assign-shipper')
  @RequirePermission('online-order.assign-shipper-or-cancel')
  assignShipper(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.dispatch.assignShipper(id, ShipperBody.parse(body), req.actor!)
  }

  /**
   * O12 Kênh ngoài — nhân viên nhập tay đơn GrabFood/ShopeeFood/Be.
   *
   * Không đấu nối API theo quyết định trong kế hoạch; nhập tay là luồng CHÍNH
   * THỨC, nên đơn kênh ngoài đi đúng đường của đơn web: cùng bảng, cùng bếp,
   * cùng hàng đợi. Bếp không cần biết đơn đến từ đâu.
   */
  @Post('orders/external')
  @RequirePermission('online-order.confirm')
  async createExternal(@Body() body: unknown, @Req() req: RequestWithActor) {
    const input = ManualOrderBody.parse(body)
    return this.online.create(
      {
        branchId: input.branchId,
        type: input.type,
        channel: input.channel,
        customer: {
          // Kênh ngoài che tên khách; thứ nhân viên đọc là mã đơn của kênh
          name: input.customer.name?.trim() || input.externalCode,
          phone: input.customer.phone ?? '',
          address: input.customer.address ?? null,
          note: input.customer.note ?? null,
          externalCode: input.externalCode,
        },
        lines: input.lines,
        // Kênh ngoài luôn là "làm ngay": shipper của họ đang đứng chờ ở cửa
        slotMode: 'asap',
      },
      req.actor!,
    )
  }
}
