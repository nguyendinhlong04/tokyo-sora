import 'reflect-metadata'
import fastifyCookie from '@fastify/cookie'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module'
import { ZodExceptionFilter } from './common/zod-exception.filter'

/**
 * Dựng app dùng chung cho cả server thường (main.ts) lẫn Vercel Function
 * (api/index.ts) — một đường khởi tạo duy nhất, không có nhánh riêng cho từng nơi.
 */
export async function createApp(): Promise<NestFastifyApplication> {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter(), {
    // Serverless: bớt log ồn, giữ cảnh báo và lỗi
    logger: process.env.VERCEL ? ['error', 'warn'] : ['error', 'warn', 'log'],
  })

  await app.register(fastifyCookie)
  app.useGlobalFilters(new ZodExceptionFilter())
  app.enableShutdownHooks()

  // Same-origin là mặc định (Vercel rewrite /api về function của chính domain đó),
  // nên KHÔNG mở CORS. Origin nào cần gọi chéo thì khai tường minh.
  const origins = process.env.CORS_ORIGINS?.split(',').filter(Boolean)
  if (origins?.length) app.enableCors({ origin: origins, credentials: true })

  app.getHttpAdapter()
    .getInstance()
    .addHook('onSend', async (_req, reply) => {
      reply.header('X-Content-Type-Options', 'nosniff')
      reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
      reply.removeHeader('x-powered-by')
    })

  return app
}
