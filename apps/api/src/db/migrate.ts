import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations')

/** Thực thi được bởi cả PGlite (test) lẫn node-postgres (thật) */
export interface SqlRunner {
  exec(sql: string): Promise<unknown>
}

/**
 * Chạy tuần tự mọi file .sql trong migrations/ theo thứ tự tên.
 * Cố tình đơn giản: migration là nguồn sự thật của lược đồ, không có bước "sync"
 * ngầm nào — sinh bằng drizzle-kit rồi commit, guard viết tay đi kèm.
 */
export async function runMigrations(db: SqlRunner, dir = MIGRATIONS_DIR): Promise<string[]> {
  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  for (const file of files) {
    const sql = await readFile(join(dir, file), 'utf8')
    // Drizzle chèn `--> statement-breakpoint` giữa các câu lệnh; PGlite/pg chạy
    // được cả khối nên chỉ cần bỏ dấu phân cách.
    await db.exec(sql.replaceAll('--> statement-breakpoint', ''))
  }
  return files
}
