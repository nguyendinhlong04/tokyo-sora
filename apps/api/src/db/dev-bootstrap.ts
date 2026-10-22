/**
 * Chuẩn bị môi trường dev để mở POS/KDS/Office lên là dùng được ngay:
 *   pnpm --filter @sora/api db:dev-bootstrap
 *
 * Làm bốn việc mà ngoài đời người vận hành làm bằng tay lúc mở quán:
 *   1. Tạo TÀI KHOẢN DEV còn thiếu — Office và PIN nhân viên (`dev-accounts.ts`).
 *      Tài khoản đã có thì giữ nguyên, không đặt lại mật khẩu.
 *   2. Tạo THIẾT BỊ ĐẦU TIÊN của chi nhánh (bài toán con gà quả trứng: sinh mã
 *      ghép cần quyền quản trị, mà đăng nhập lại cần thiết bị đã ghép).
 *   3. Dựng sơ đồ tổ chức theo mẫu chuẩn (N2).
 *   4. Phát hành bundle cấu hình để POS có thực đơn.
 *
 * Chỉ dùng cho dev — mật khẩu, PIN và token cố định, công khai trong repo. Script
 * từ chối mọi CSDL không nằm trên máy đang chạy.
 */
import 'dotenv/config'
import { createHash } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { Pool } from 'pg'
import { createDb } from './client'
import { assertLocalDatabase, seedDevAccounts } from './dev-accounts'
import { branches, devices, tables } from './schema'
import { ConfigBundleService } from '../modules/config-bundle/config-bundle.service'
import { AuditService } from '../modules/identity/audit.service'
import { OrgService } from '../modules/org/org.service'

const DEV_DEVICE_TOKEN = 'dev-device-token'
const DEV_TABLE_TOKEN = 'dev-table-token'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('dev-bootstrap không được chạy ở môi trường production')
  }
  assertLocalDatabase(process.env.DATABASE_URL)

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = createDb(pool)

  try {
    const [branch] = await db.select().from(branches).limit(1)
    if (!branch) throw new Error('Chưa có chi nhánh nào — chạy db:seed trước')

    // Cùng chi nhánh với thiết bị bên dưới: PIN chỉ đăng nhập được trên máy của
    // chi nhánh mà người đó có vai trò
    const accounts = await seedDevAccounts(db, branch.id)

    // iPad dev gắn bàn đầu tiên của chi nhánh (§9.1) — mở Sora Table là vào bàn ngay
    const [firstTable] = await db
      .select({ id: tables.id, code: tables.code })
      .from(tables)
      .where(and(eq(tables.branchId, branch.id), eq(tables.active, true)))
      .orderBy(asc(tables.code))
      .limit(1)

    // Máy POS + một màn bếp cho mỗi trạm, để mở app lên là dùng được ngay
    const wanted = [
      {
        token: DEV_DEVICE_TOKEN,
        kind: 'cashier' as const,
        name: 'Máy POS dev',
        stationId: null,
        tableId: null,
      },
      ...['ST-01', 'ST-02', 'ST-03', 'ST-04', 'ST-05', 'ST-06'].map((stationId) => ({
        token: `dev-kds-${stationId.toLowerCase()}`,
        kind: 'kds' as const,
        name: `Màn bếp ${stationId}`,
        stationId,
        tableId: null,
      })),
      ...(firstTable
        ? [
            {
              token: DEV_TABLE_TOKEN,
              kind: 'table' as const,
              name: `iPad bàn ${firstTable.code} dev`,
              stationId: null,
              tableId: firstTable.id,
            },
          ]
        : []),
    ]

    for (const device of wanted) {
      const tokenHash = createHash('sha256').update(device.token).digest('hex')
      const existing = await db.select().from(devices).where(eq(devices.tokenHash, tokenHash))
      if (existing.length > 0) continue
      await db.insert(devices).values({
        branchId: branch.id,
        kind: device.kind,
        name: device.name,
        stationId: device.stationId,
        tableId: device.tableId,
        tokenHash,
      })
    }

    // Sơ đồ tổ chức theo mẫu chuẩn — khung chuỗi rồi từng chi nhánh. Idempotent:
    // chạy lại không nhân đôi, sửa tay trên Office không bị ghi đè
    const org = new OrgService(db, new AuditService(db))
    await org.applyStandard('chuoi', { kind: 'system' })
    for (const b of await db.select({ id: branches.id }).from(branches)) {
      await org.applyStandard(b.id, { kind: 'system' })
    }

    const bundles = new ConfigBundleService(db)
    const published = await bundles.publish(branch.id, { kind: 'system' })

    console.log(
      JSON.stringify(
        {
          branchId: branch.id,
          configVersion: published.version,
          accounts,
          tokens: Object.fromEntries(wanted.map((d) => [d.name, d.token])),
        },
        null,
        2,
      ),
    )
    console.log(
      '\nMật khẩu Office và PIN của tài khoản dev: DEV.md § Tài khoản dev.' +
        (accounts.kept.length > 0
          ? `\nGiữ nguyên vì đã có từ trước (mật khẩu/PIN không bị đặt lại): ${accounts.kept.join(', ')}`
          : ''),
    )
    console.log(
      '\nMở app rồi chạy trong Console của trình duyệt:' +
        `\n  POS:      localStorage.setItem('sora.device.token', '${DEV_DEVICE_TOKEN}')` +
        "\n  Bếp nướng: localStorage.setItem('sora.device.token', 'dev-kds-st-06')" +
        `\n  iPad bàn:  localStorage.setItem('sora.device.token', '${DEV_TABLE_TOKEN}')` +
        '\n  location.reload()',
    )
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
