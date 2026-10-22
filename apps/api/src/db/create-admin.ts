/**
 * Tạo một tài khoản Sora Office cấp Chủ / Admin (R10), phạm vi TOÀN CHUỖI:
 *
 *   DATABASE_URL="<direct-url>" ADMIN_CODE=... ADMIN_EMAIL=... ADMIN_NAME=... \
 *   pnpm --filter @sora/api db:create-admin
 *
 * Mật khẩu được HỎI trên terminal — gõ không hiện, gõ hai lần, không có giá trị
 * mặc định. Không nhận qua biến môi trường: chuỗi gõ sau `ADMIN_PASSWORD=` nằm lại
 * trong lịch sử shell, còn khai trong `.env` thì thành mật khẩu mặc định cho mọi
 * lần chạy sau.
 *
 * Đây là cửa duy nhất khi trong tay chưa có tài khoản R10 nào: mọi màn quản trị
 * (kể cả A1 tạo tài khoản) đứng sau `admin.manage-accounts-roles` mà chỉ R10 có,
 * nên bài toán con gà quả trứng chỉ mở được từ phía CSDL.
 *
 * CHỈ TẠO MỚI — mã hoặc email đã có thì dừng, không đụng tới tài khoản đó. Bản
 * trước đặt lại mật khẩu khi trùng mã: gõ nhầm mã của một thu ngân là biến người
 * đó thành chủ quán, mà phiên đang mở của tài khoản vẫn sống. Quên mật khẩu R10
 * cuối cùng thì tạo một R10 mới ở đây, rồi đặt lại mật khẩu cũ ở A1 — A1 cắt
 * phiên cũ và ghi nhật ký.
 */
import 'dotenv/config'
import { hash } from '@node-rs/argon2'
import { createInterface } from 'node:readline/promises'
import { Writable } from 'node:stream'
import { Pool } from 'pg'
import { createDb } from './client'
import { staff, staffRoles } from './schema'

/**
 * Office chỉ có một lớp xác thực (mật khẩu — cột TOTP chưa dùng), nên lấy mức của
 * NIST SP 800-63B-4 cho mật khẩu một lớp: tối thiểu 15 ký tự. Trần 200 là của
 * /api/auth/office/login — dài hơn thì tạo xong không đăng nhập nổi.
 */
const MIN_PASSWORD = 15
const MAX_PASSWORD = 200

function required(name: string): string {
  const value = process.env[name]?.trim()
  if (!value) throw new Error(`Thiếu ${name}`)
  return value
}

/** Hỏi trên terminal mà không hiện ký tự gõ: readline vọng từng phím vào một luồng câm */
async function askHidden(question: string): Promise<string> {
  process.stdout.write(question)
  const rl = createInterface({
    input: process.stdin,
    output: new Writable({ write: (_chunk, _encoding, done) => done() }),
    terminal: true,
  })
  // Ctrl+C giữa chừng: thoát luôn, chưa có gì được ghi vào CSDL
  rl.on('SIGINT', () => {
    process.stdout.write('\n')
    process.exit(130)
  })
  try {
    return await rl.question('')
  } finally {
    rl.close()
    process.stdout.write('\n')
  }
}

async function main() {
  if (process.env.ADMIN_PASSWORD !== undefined) {
    throw new Error(
      'Không nhận mật khẩu qua ADMIN_PASSWORD — bỏ biến đó (khỏi lệnh và khỏi .env) rồi gõ mật khẩu khi được hỏi',
    )
  }
  const code = required('ADMIN_CODE').toUpperCase()
  const email = required('ADMIN_EMAIL').toLowerCase()
  const fullName = required('ADMIN_NAME')
  const databaseUrl = required('DATABASE_URL')
  if (!process.stdin.isTTY) {
    throw new Error('Chạy lệnh này trong terminal — mật khẩu phải gõ tay khi được hỏi')
  }

  const password = await askHidden(
    `Mật khẩu cho ${email} (${MIN_PASSWORD}–${MAX_PASSWORD} ký tự, không hiện khi gõ): `,
  )
  if (password.length < MIN_PASSWORD) throw new Error(`Mật khẩu phải từ ${MIN_PASSWORD} ký tự`)
  if (password.length > MAX_PASSWORD) throw new Error(`Mật khẩu tối đa ${MAX_PASSWORD} ký tự`)
  if ((await askHidden('Gõ lại mật khẩu: ')) !== password) {
    throw new Error('Hai lần gõ không khớp — chưa tạo gì')
  }
  const passwordHash = await hash(password)

  const pool = new Pool({ connectionString: databaseUrl })
  const db = createDb(pool)

  try {
    const person = await db.transaction(async (tx) => {
      // DO NOTHING không chỉ đích: chặn cả trùng mã lẫn trùng email
      const [row] = await tx
        .insert(staff)
        .values({ code, fullName, email, passwordHash })
        .onConflictDoNothing()
        .returning({ id: staff.id })
      if (!row) return null
      // branchId NULL = phạm vi toàn chuỗi, vào được cả ba chi nhánh
      await tx.insert(staffRoles).values({ staffId: row.id, roleCode: 'R10', branchId: null })
      return row
    })
    if (!person) {
      throw new Error(
        `Đã có tài khoản mang mã ${code} hoặc email ${email} — script chỉ tạo mới, không ghi đè. Chọn mã và email khác; đổi mật khẩu tài khoản cũ thì làm ở Office A1.`,
      )
    }
    console.log(`Đã tạo tài khoản R10: ${email} (mã ${code}, id ${person.id})`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
