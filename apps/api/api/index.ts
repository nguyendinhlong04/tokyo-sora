import type { IncomingMessage, ServerResponse } from 'node:http'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { createApp } from '../src/bootstrap'

/**
 * Điểm vào cho Vercel Function.
 *
 * Instance Nest được cache ở phạm vi module: Vercel giữ lại tiến trình giữa các
 * lần gọi khi còn "ấm", nên chỉ request đầu tiên sau nguội máy phải chịu chi phí
 * khởi tạo (~1–2 giây), các request sau dùng lại ngay.
 *
 * Promise được cache chứ không phải app đã dựng xong: hai request tới cùng lúc lúc
 * nguội máy sẽ cùng chờ MỘT lần khởi tạo thay vì dựng hai app và mở hai pool.
 */
let appPromise: Promise<NestFastifyApplication> | null = null

async function getApp(): Promise<NestFastifyApplication> {
  if (!appPromise) {
    appPromise = createApp().then(async (app) => {
      await app.init()
      await app.getHttpAdapter().getInstance().ready()
      return app
    })
  }
  return appPromise
}

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  const app = await getApp()
  app.getHttpAdapter().getInstance().server.emit('request', req, res)
}
