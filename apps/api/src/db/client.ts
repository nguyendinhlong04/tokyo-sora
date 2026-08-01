import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

export type Db = NodePgDatabase<typeof schema>

export function createPool(url = process.env.DATABASE_URL): Pool {
  if (!url) throw new Error('Thiếu DATABASE_URL')
  return new Pool({
    connectionString: url,
    // POS/KDS mở kết nối lâu; giữ pool nhỏ vì cả hệ thống chạy trên một VPS
    max: Number(process.env.DATABASE_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
  })
}

export function createDb(pool: Pool): Db {
  return drizzle(pool, { schema })
}

export { schema }
