import 'reflect-metadata'
import 'dotenv/config'
import fastifyCookie from '@fastify/cookie'
import { NestFactory } from '@nestjs/core'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { AppModule } from './app.module'
import { ZodExceptionFilter } from './common/zod-exception.filter'

export async function createApp() {
  const app = await NestFactory.create<NestFastifyApplication>(AppModule, new FastifyAdapter())

  await app.register(fastifyCookie)
  app.useGlobalFilters(new ZodExceptionFilter())
  app.enableShutdownHooks()

  // Same-origin: Caddy proxy /api trên từng origin nên KHÔNG mở CORS.
  // Origin nào cần gọi chéo thì khai tường minh qua CORS_ORIGINS.
  const origins = process.env.CORS_ORIGINS?.split(',').filter(Boolean)
  if (origins?.length) app.enableCors({ origin: origins, credentials: true })

  app.getHttpAdapter().getInstance().addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'strict-origin-when-cross-origin')
    reply.removeHeader('x-powered-by')
  })

  return app
}

async function bootstrap() {
  const app = await createApp()
  const port = Number(process.env.PORT ?? 3000)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`sora-api listening on :${port}`)
}

if (require.main === module) {
  void bootstrap()
}
