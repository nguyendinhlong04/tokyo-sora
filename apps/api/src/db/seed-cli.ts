/**
 * Nạp dữ liệu nền cho CSDL mới:  pnpm --filter @sora/api db:seed [--ghi-de]
 *
 * Logic ở seed.ts — tách như migrate-cli.ts để test gọi `seed` mà không mở kết nối.
 */
import 'dotenv/config'
import { Pool } from 'pg'
import { createDb } from './client'
import { parseSeedArgs, seed, SeedRefused } from './seed'
import { PREP_SECONDS_BY_STATION } from './seed-routing'

async function main() {
  const { overwrite } = parseSeedArgs(process.argv.slice(2), process.env.DATABASE_URL)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const summary = await seed(createDb(pool), { overwrite })
    console.log('Đã nạp:', JSON.stringify(summary))
    console.log(`Thời gian chuẩn theo trạm: ${JSON.stringify(PREP_SECONDS_BY_STATION)}`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  // Từ chối là kết quả dự kiến khi chạy lại: in lời nhắn, không in stack
  console.error(err instanceof SeedRefused ? err.message : err)
  process.exitCode = 1
})
