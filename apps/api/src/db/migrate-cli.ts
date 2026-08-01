/**
 * Chạy migration lên CSDL thật:  pnpm --filter @sora/api db:migrate
 * Cùng bộ SQL mà test chạy trên PGlite — không có đường nhánh riêng cho test.
 */
import 'dotenv/config'
import { Pool } from 'pg'
import { runMigrations } from './migrate'

async function main() {
  // Migration cần quyền cao hơn runtime (CREATE EVENT TRIGGER là quyền superuser),
  // nên dùng credential riêng nếu có — app chạy bằng sora_app quyền hẹp.
  const url = process.env.DATABASE_MIGRATION_URL ?? process.env.DATABASE_URL
  if (!url) throw new Error('Thiếu DATABASE_MIGRATION_URL / DATABASE_URL (xem .env.example)')

  const pool = new Pool({ connectionString: url })
  try {
    const ran = await runMigrations({
      exec: (sql) => pool.query(sql),
      query: async <T,>(sql: string) => ({ rows: (await pool.query(sql)).rows as T[] }),
    })
    console.log(ran.length ? `Đã áp ${ran.length} migration: ${ran.join(', ')}` : 'Không có migration mới')
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
