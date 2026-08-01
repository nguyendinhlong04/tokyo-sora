import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>

/** Nhận biết đang chạy trên nền serverless (Vercel) */
export const isServerless = Boolean(process.env.VERCEL)

/**
 * Pool kết nối.
 *
 * Trên Vercel mỗi function instance là một tiến trình riêng và có thể có hàng chục
 * instance sống cùng lúc, nên pool phải NHỎ và đi qua Supavisor (pooler của
 * Supabase, cổng 6543, chế độ transaction) — đó chính là thứ sinh ra để gom hàng
 * trăm kết nối ngắn thành số ít kết nối thật tới Postgres.
 *
 * Lưu ý về prepared statement: chế độ transaction của Supavisor không giữ được
 * prepared statement giữa các lần thuê kết nối. Drizzle + node-postgres mặc định
 * dùng truy vấn không đặt tên nên an toàn; đừng dùng `.prepare()` của Drizzle ở
 * đường chạy qua pooler.
 */
export function createPool(url = process.env.DATABASE_URL): Pool {
  if (!url) throw new Error('Thiếu DATABASE_URL')

  const explicitMax = process.env.DATABASE_POOL_MAX
  return new Pool({
    connectionString: url,
    max: explicitMax ? Number(explicitMax) : isServerless ? 1 : 10,
    // Serverless: nhả kết nối sớm để không giữ chỗ của instance khác
    idleTimeoutMillis: isServerless ? 10_000 : 30_000,
    connectionTimeoutMillis: 10_000,
    // Supabase yêu cầu TLS; chứng chỉ do nhà cung cấp quản lý
    ssl: needsSsl(url) ? { rejectUnauthorized: false } : undefined,
  })
}

function needsSsl(url: string): boolean {
  if (process.env.DATABASE_SSL === 'false') return false
  if (process.env.DATABASE_SSL === 'true') return true
  // Mặc định: bật TLS cho mọi host không phải máy cục bộ
  return !/@(localhost|127\.0\.0\.1)[:/]/.test(url)
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema })
}

export { schema }
