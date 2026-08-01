import { readFile, readdir } from 'node:fs/promises'
import { join } from 'node:path'

export const MIGRATIONS_DIR = join(__dirname, '..', '..', 'migrations')

/** Thực thi được bởi cả PGlite (test) lẫn node-postgres (thật) */
export interface SqlRunner {
  exec(sql: string): Promise<unknown>
  query?<T = unknown>(sql: string): Promise<{ rows: T[] }>
}

const TRACKING_TABLE = `
CREATE TABLE IF NOT EXISTS _sora_migrations (
  filename   text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
)`

/**
 * Chạy các file .sql trong migrations/ theo thứ tự tên, MỖI FILE ĐÚNG MỘT LẦN.
 *
 * Quy ước đánh số: drizzle-kit sinh 0000–8999 từ schema TS; guard viết tay (trigger,
 * ràng buộc Drizzle không diễn đạt được) đánh số từ 9000 để luôn chạy sau cùng.
 */
export async function runMigrations(db: SqlRunner, dir = MIGRATIONS_DIR): Promise<string[]> {
  await db.exec(TRACKING_TABLE)

  const applied = new Set<string>()
  if (db.query) {
    const res = await db.query<{ filename: string }>('SELECT filename FROM _sora_migrations')
    for (const row of res.rows) applied.add(row.filename)
  }

  const files = (await readdir(dir)).filter((f) => f.endsWith('.sql')).sort()
  const ran: string[] = []
  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(join(dir, file), 'utf8')
    // Drizzle chèn `--> statement-breakpoint`; PGlite/pg chạy được cả khối nên chỉ
    // cần bỏ dấu phân cách. Cả migration nằm trong một transaction ngầm của exec.
    await db.exec(sql.replaceAll('--> statement-breakpoint', ''))
    await db.exec(`INSERT INTO _sora_migrations (filename) VALUES ('${file}')`)
    ran.push(file)
  }
  return ran
}
