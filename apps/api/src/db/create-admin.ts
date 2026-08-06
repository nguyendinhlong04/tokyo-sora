/**
 * Tạo một tài khoản Sora Office cấp Chủ / Admin (R10), phạm vi TOÀN CHUỖI:
 *
 *   DATABASE_URL="<direct-url>" ADMIN_EMAIL=... ADMIN_PASSWORD=... ADMIN_NAME=... \
 *   ADMIN_CODE=... pnpm --filter @sora/api db:create-admin
 *
 * Đây là cửa duy nhất khi trong tay chưa có tài khoản R10 nào: mọi màn quản trị
 * (kể cả A1 tạo tài khoản) đứng sau `admin.manage-accounts-roles` mà chỉ R10 có,
 * nên bài toán con gà quả trứng chỉ mở được từ phía CSDL.
 *
 * Idempotent theo `code`: chạy lại là đặt LẠI mật khẩu cho đúng tài khoản đó.
 */
import 'dotenv/config'
import { hash } from '@node-rs/argon2'
import { Pool } from 'pg'
import { createDb } from './client'
import { staff, staffRoles } from './schema'

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Thiếu ${name}`)
  return value
}

async function main() {
  const code = required('ADMIN_CODE').toUpperCase()
  const email = required('ADMIN_EMAIL').toLowerCase()
  const password = required('ADMIN_PASSWORD')
  const fullName = required('ADMIN_NAME')

  // Mật khẩu Office phải qua được z.string().min(8) ở /api/auth/office/login —
  // đặt ngắn hơn thì tài khoản tạo xong không đăng nhập nổi.
  if (password.length < 8) throw new Error('ADMIN_PASSWORD phải từ 8 ký tự')

  const pool = new Pool({ connectionString: required('DATABASE_URL') })
  const db = createDb(pool)

  try {
    const row = { code, fullName, email, passwordHash: await hash(password), active: true }
    const [person] = await db
      .insert(staff)
      .values(row)
      .onConflictDoUpdate({ target: staff.code, set: row })
      .returning({ id: staff.id })

    await db
      .insert(staffRoles)
      // branchId NULL = phạm vi toàn chuỗi, vào được cả ba chi nhánh
      .values({ staffId: person!.id, roleCode: 'R10', branchId: null })
      .onConflictDoNothing()

    console.log(`Đã tạo tài khoản R10: ${email} (mã ${code}, id ${person!.id})`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
