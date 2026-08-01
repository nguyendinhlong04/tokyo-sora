import 'reflect-metadata'
import { Readable } from 'node:stream'
import fastifyCookie from '@fastify/cookie'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module'
import { ZodExceptionFilter } from './common/zod-exception.filter'

/**
 * Cấu hình app — dùng chung cho server thường, Vercel Function VÀ test.
 *
 * Test từng tự dựng app riêng và bị trôi lệch: thiếu bộ bắt raw body nên webhook
 * ngân hàng luôn 400 trong test dù chạy thật vẫn đúng. Một đường cấu hình duy
 * nhất khiến chuyện đó không lặp lại.
 */
export async function configureApp(app: NestFastifyApplication): Promise<void> {
  await app.register(fastifyCookie)
  captureRawBody(app)
  app.useGlobalFilters(new ZodExceptionFilter())

  app.getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (_req, reply) => {
      reply.header('X-Content-Type-Options', 'nosniff')
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
      reply.removeHeader('x-powered-by')
    })
}

export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    // Serverless: bớt log ồn, giữ cảnh báo và lỗi
    logger: process.env.VERCEL ? ['error', 'warn'] : ['error', 'warn', 'log'],
  })

  await configureApp(app)
  app.enableShutdownHooks()

  // Same-origin là mặc định (Vercel rewrite /api về function của chính domain đó),
  // nên KHÔNG mở CORS. Origin nào cần gọi chéo thì khai tường minh.
  const origins = process.env.CORS_ORIGINS?.split(',').filter(Boolean)
  if (origins?.length) app.enableCors({ origin: origins, credentials: true })

  return app
}

/**
 * Giữ lại chuỗi byte gốc của request JSON.
 *
 * Webhook ngân hàng ký chữ ký trên RAW BODY. Parse rồi serialize lại là đổi byte —
 * khoảng trắng, thứ tự khoá, cách escape unicode đều có thể khác — và chữ ký sẽ
 * sai dù nội dung không đổi.
 */
function captureRawBody(app: NestFastifyApplication) {
  const instance = app.getHttpAdapter().getInstance()

  /**
   * Dùng hook `preParsing` chứ không thay content-type parser: Nest đăng ký parser
   * JSON của nó trong `app.init()`, tức là SAU hàm này, nên thay parser ở đây sẽ
   * xung đột. Hook thì không phụ thuộc thứ tự đăng ký.
   *
   * Chỉ đệm nội dung của route webhook — mọi request khác đi thẳng, không tốn thêm
   * bộ nhớ.
   */
  instance.addHook('preParsing', async (req, _reply, payload) => {
    if (!req.url.startsWith('/api/webhooks/')) return payload

    const chunks: Buffer[] = []
    for await (const chunk of payload) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string))
    }
    const buffer = Buffer.concat(chunks)
    ;(req as typeof req & { rawBody?: string }).rawBody = buffer.toString('utf8')

    // Trả lại stream mới cho parser mặc định — phải là Buffer, chuỗi sẽ làm Fastify
    // ném lỗi và request treo cho tới lúc hết giờ.
    return Readable.from([buffer])
  })
}
