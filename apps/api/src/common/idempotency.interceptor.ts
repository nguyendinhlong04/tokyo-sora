import { createHash } from 'node:crypto'
import {
  CallHandler,
  ConflictException,
  ExecutionContext,
  Inject,
  Injectable,
  NestInterceptor,
} from '@nestjs/common'
import { IDEMPOTENCY_HEADER } from '@sora/contracts'
import { eq } from 'drizzle-orm'
import { Observable, from, of, switchMap, tap } from 'rxjs'
import type { Db } from '../db/client'
import { idempotencyKeys } from '../db/schema'
import { actorRef, type Actor } from '../modules/identity/actor'
import { DB } from './db.module'

interface RequestLike {
  method: string
  url: string
  body?: unknown
  headers: Record<string, string | string[] | undefined>
  actor?: Actor
}

/**
 * Chống trùng khi hàng đợi offline của POS/KDS gửi lại.
 *
 * Cùng key + cùng nội dung ⇒ trả lại đúng kết quả cũ, không chạy lại nghiệp vụ.
 * Cùng key + KHÁC nội dung ⇒ 409, vì đó là lỗi lập trình phía client chứ không
 * phải gửi lại.
 *
 * Đây là lớp thứ nhất. Lớp thứ hai nằm trong chính miền nghiệp vụ: chuyển trạng
 * thái trùng là no-op thành công (xem order-state.ts). Hai lớp cùng lúc khiến việc
 * gửi lại mù trở nên nhàm chán — đúng như mong muốn.
 */
@Injectable()
export class IdempotencyInterceptor implements NestInterceptor {
  constructor(@Inject(DB) private readonly db: Db) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<RequestLike>()
    if (req.method === 'GET' || req.method === 'HEAD') return next.handle()

    const header = req.headers[IDEMPOTENCY_HEADER]
    const key = Array.isArray(header) ? header[0] : header
    if (!key) return next.handle()

    const endpoint = `${req.method} ${req.url.split('?')[0]}`
    const requestHash = hashOf(req.body)
    const actor = req.actor ? `${actorRef(req.actor).kind}:${actorRef(req.actor).id}` : 'anon'

    return from(this.lookup(key)).pipe(
      switchMap((existing) => {
        if (existing) {
          if (existing.requestHash !== requestHash) {
            throw new ConflictException({
              code: 'idempotency_key_reused',
              message: 'Khoá idempotency đã dùng cho nội dung khác',
            })
          }
          return of(existing.responseBody)
        }
        return next.handle().pipe(
          tap((body) => {
            // Ghi sau khi nghiệp vụ thành công. Nếu request chết giữa chừng thì
            // không có bản ghi, lần gửi lại chạy lại từ đầu — đúng ý muốn.
            void this.remember(key, { actor, endpoint, requestHash, body })
          }),
        )
      }),
    )
  }

  private async lookup(key: string) {
    const [row] = await this.db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.key, key))
    return row ?? null
  }

  private async remember(
    key: string,
    input: { actor: string; endpoint: string; requestHash: string; body: unknown },
  ) {
    await this.db
      .insert(idempotencyKeys)
      .values({
        key,
        actor: input.actor,
        endpoint: input.endpoint,
        requestHash: input.requestHash,
        responseStatus: 200,
        responseBody: (input.body ?? null) as never,
      })
      .onConflictDoNothing()
  }
}

function hashOf(body: unknown): string {
  return createHash('sha256').update(JSON.stringify(body ?? null)).digest('hex')
}
