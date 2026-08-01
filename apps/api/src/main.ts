import 'dotenv/config'
import { createApp } from './bootstrap'

async function bootstrap() {
  const app = await createApp()
  const port = Number(process.env.PORT ?? 3000)
  await app.listen({ port, host: '0.0.0.0' })
  console.log(`sora-api listening on :${port}`)
}

void bootstrap()
