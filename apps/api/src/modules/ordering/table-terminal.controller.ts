import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UseInterceptors,
} from '@nestjs/common'
import { z } from 'zod'
import { IdempotencyInterceptor } from '../../common/idempotency.interceptor'
import type { Actor } from '../identity/actor'
import type { RequestWithActor } from '../identity/auth.guard'
import { TableTerminalService } from './table-terminal.service'

const OpenBody = z.object({ guestCount: z.number().int().min(1).max(50) })

/**
 * Cửa riêng của iPad gắn bàn (§9.1). Không gắn `@RequirePermission`: iPad của bàn
 * CHƯA mở không có vai trò nào — chính việc nó là máy ghép của đúng bàn này là
 * thứ cho phép nó hỏi bàn mình và mở bàn mình, không hơn.
 */
@Controller('api/table-terminal')
export class TableTerminalController {
  constructor(private readonly terminal: TableTerminalService) {}

  @Get()
  state(@Req() req: RequestWithActor) {
    return this.terminal.state(tableOf(req.actor!))
  }

  @Post('open')
  @UseInterceptors(IdempotencyInterceptor)
  open(@Body() body: unknown, @Req() req: RequestWithActor) {
    const actor = req.actor!
    return this.terminal.open(tableOf(actor), OpenBody.parse(body).guestCount, actor)
  }
}

/** Bàn mà iPad đang gọi được ghim vào — bàn chưa mở hay đang có phiên đều vậy */
function tableOf(actor: Actor): number {
  if (actor.kind === 'device' && actor.deviceKind === 'table' && actor.tableId) return actor.tableId
  if (actor.kind === 'customer' && actor.tableId) return actor.tableId
  throw new ForbiddenException('Chỉ iPad gắn bàn mới dùng được')
}
