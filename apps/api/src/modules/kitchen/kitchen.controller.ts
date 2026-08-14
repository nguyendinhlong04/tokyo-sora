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
import { KitchenService } from './kitchen.service'

const StateBody = z.object({ action: z.enum(['start', 'done', 'undo']) })

const AvailabilityBody = z.object({
  dishId: z.string().min(1),
  status: z.enum(['sold_out', 'limited', 'available']),
  remaining: z.number().int().min(0).nullish(),
})

@Controller('api')
@UseInterceptors(IdempotencyInterceptor)
export class KitchenController {
  constructor(private readonly kitchen: KitchenService) {}

  /**
   * K2 hàng vé. Màn KDS ghim cứng một trạm lúc ghép thiết bị nên không cần truyền
   * `station` — lấy thẳng từ danh tính thiết bị, tránh việc màn này xem được vé
   * của trạm khác.
   */
  @Get('tickets')
  queue(
    @Req() req: RequestWithActor,
    @Query('branch') branchQuery?: string,
    @Query('station') stationQuery?: string,
  ) {
    const actor = req.actor!
    if (actor.kind === 'system' || actor.kind === 'customer' || actor.kind === 'guest') {
      throw new BadRequestException('Không đọc được hàng vé')
    }

    // Trạm lấy từ THIẾT BỊ trước: màn bếp ghim cứng một trạm nên không thể xem
    // nhầm vé trạm khác, kể cả khi có người đăng nhập lên nó. Tham số `station`
    // chỉ dùng cho máy không gắn trạm (máy thu ngân xem hộ, màn Expo).
    const station = actor.stationId ?? stationQuery
    if (!station) {
      throw new BadRequestException(
        'Thiết bị chưa ghép vào trạm nào — truyền tham số station nếu xem từ máy khác',
      )
    }
    return this.kitchen.queue(branchQuery ?? actor.branchId, station)
  }

  /** K6 Expo — gom theo đơn, biết còn chờ trạm nào */
  @Get('expo')
  expo(@Req() req: RequestWithActor, @Query('branch') branch?: string) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được expo')
    return this.kitchen.expo(branch ?? actor.branchId)
  }

  /** K2 bấm Bắt đầu / Xong / Hoàn tác */
  @Post('tickets/:id/state')
  @RequirePermission('kds.change-item-state')
  changeState(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.kitchen.changeTicketState(id, StateBody.parse(body).action, req.actor!)
  }

  /**
   * P4 — phục vụ xác nhận đã đặt món lên bàn.
   *
   * KHÔNG nằm ở màn bếp: người bưng món là phục vụ, và trạng thái khách nhìn
   * thấy là "Đã ra" — nghĩa là đã ở trên bàn, chứ không phải đã rời bếp. Đặt nút
   * ở màn bếp thì nhật ký ghi "thiết bị màn bếp" chứ không ghi ai bưng.
   *
   * Đặt cạnh `batches/:batchNo/fire` vì cùng một đơn vị: cả đợt một lượt, đúng
   * như người ta bê cả khay.
   */
  /**
   * Xác nhận đã mang ra bàn MỘT MÓN.
   *
   * Cùng quyền với nút cả đợt — vẫn là phục vụ bưng món, chỉ khác đơn vị: món
   * nào bếp báo xong thì bưng món đó, không bắt món nhanh nằm chờ món hầm.
   */
  @Post('order-lines/:id/served')
  @RequirePermission('order.mark-served')
  markLineServed(@Param('id', ParseIntPipe) id: number, @Req() req: RequestWithActor) {
    return this.kitchen.markLineServed(id, req.actor!)
  }

  @Post('orders/:orderId/batches/:batchNo/served')
  @RequirePermission('order.mark-served')
  markServed(
    @Param('orderId', ParseIntPipe) orderId: number,
    @Param('batchNo', ParseIntPipe) batchNo: number,
    @Req() req: RequestWithActor,
  ) {
    return this.kitchen.markServed(orderId, batchNo, req.actor!)
  }

  /**
   * K2 — bấm Bắt đầu / Xong / Hoàn tác cho MỘT MÓN trên vé.
   *
   * Đây là thao tác chính của bếp. Nút cả vé ở `tickets/:id/state` vẫn còn, dùng
   * cho vé mà mọi món ra cùng lúc.
   */
  @Post('ticket-items/:id/state')
  @RequirePermission('kds.change-item-state')
  changeItemState(
    @Param('id', ParseIntPipe) id: number,
    @Body() body: unknown,
    @Req() req: RequestWithActor,
  ) {
    return this.kitchen.changeItemState(id, StateBody.parse(body).action, req.actor!)
  }

  /**
   * K7 Công thức — quy trình chế biến cho người đứng bếp.
   *
   * KHÔNG dùng `/api/inventory/recipes/:id` của M4: điểm đó đòi quyền
   * `cost.view-recipe` và trả về giá vốn từng dòng. Màn bếp không có quyền đó và
   * cũng không được thấy tiền (nguyên tắc 3) — nên đây là điểm đọc riêng, trả về
   * bản đã trừ sạch tiền. Cùng ràng buộc danh tính với hàng vé: máy đã ghép hoặc
   * người đã đăng nhập, không phải khách.
   */
  @Get('recipes')
  recipeIndex(@Req() req: RequestWithActor) {
    this.requireKitchenReader(req)
    return this.kitchen.recipeIndex()
  }

  @Get('recipes/:dishId')
  recipe(@Param('dishId') dishId: string, @Req() req: RequestWithActor) {
    this.requireKitchenReader(req)
    return this.kitchen.recipe(dishId)
  }

  /** Khách ngồi bàn và tiến trình nền không có việc gì với tài liệu vận hành của bếp */
  private requireKitchenReader(req: RequestWithActor) {
    const kind = req.actor!.kind
    if (kind === 'system' || kind === 'customer' || kind === 'guest') {
      throw new BadRequestException('Không đọc được công thức')
    }
  }

  /** K5 báo hết món */
  @Post('availability')
  @RequirePermission('menu.mark-sold-out')
  setAvailability(@Body() body: unknown, @Req() req: RequestWithActor) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đổi được')
    return this.kitchen.setAvailability(actor.branchId, AvailabilityBody.parse(body), actor)
  }

  /** Danh sách món đang hết / còn giới hạn — Table và POS gọi lúc khởi động */
  @Get('availability')
  availability(@Req() req: RequestWithActor, @Query('branch') branch?: string) {
    const actor = req.actor!
    if (actor.kind === 'system') throw new BadRequestException('Không đọc được')
    return this.kitchen.availability(branch ?? actor.branchId)
  }
}
