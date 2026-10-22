/**
 * Chuẩn bị môi trường dev để mở POS/KDS lên là dùng được ngay:
 *   pnpm --filter @sora/api db:dev-bootstrap
 *
 * Làm hai việc mà ngoài đời người vận hành làm bằng tay lúc mở quán:
 *   1. Tạo THIẾT BỊ ĐẦU TIÊN của chi nhánh (bài toán con gà quả trứng: sinh mã
 *      ghép cần quyền quản trị, mà đăng nhập lại cần thiết bị đã ghép).
 *   2. Phát hành bundle cấu hình để POS có thực đơn.
 *
 * Chỉ dùng cho dev — token cố định, không bao giờ chạy ở môi trường thật.
 */
import 'dotenv/config'
import { hash } from '@node-rs/argon2'
import { createHash } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { Pool } from 'pg'
import { ParamsService } from '../common/params.service'
import { createDb } from './client'
import { branches, devices, staff } from './schema'
import { ConfigBundleService } from '../modules/config-bundle/config-bundle.service'

const DEV_DEVICE_TOKEN = 'dev-device-token'

/**
 * PIN của tài khoản Office mẫu. Đặt ở đây chứ KHÔNG ở `db:seed`: DEPLOY.md chạy
 * seed cả trên production, mà mọi chuỗi trong file này đều nằm công khai trong
 * repo. Có PIN thì máy dev mới thử được các luồng cần người thứ hai — duyệt △,
 * ký ban hành văn bản.
 */
const DEV_OFFICE_PINS: Record<string, string> = {
  CHU01: '2101',
  CHUOI01: '2102',
  KETOAN01: '2103',
  NHANSU01: '2104',
  MARKETING01: '2105',
}
/** Trùng với `DEV_OFFICE_PASSWORD` của seed.ts — import file đó là chạy luôn cả seed */
const DEV_OFFICE_PASSWORD = 'sora-dev-2026'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('dev-bootstrap không được chạy ở môi trường production')
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = createDb(pool)

  try {
    const [branch] = await db.select().from(branches).limit(1)
    if (!branch) throw new Error('Chưa có chi nhánh nào — chạy db:seed trước')

    // Máy POS + một màn bếp cho mỗi trạm, để mở app lên là dùng được ngay
    const wanted = [
      { token: DEV_DEVICE_TOKEN, kind: 'cashier' as const, name: 'Máy POS dev', stationId: null },
      ...['ST-01', 'ST-02', 'ST-03', 'ST-04', 'ST-05', 'ST-06'].map((stationId) => ({
        token: `dev-kds-${stationId.toLowerCase()}`,
        kind: 'kds' as const,
        name: `Màn bếp ${stationId}`,
        stationId,
      })),
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
        tokenHash,
      })
    }

    for (const [code, pin] of Object.entries(DEV_OFFICE_PINS)) {
      await db
        .update(staff)
        .set({ pinHash: await hash(pin) })
        .where(eq(staff.code, code))
    }
    // Quản lý ca Lan có thêm cửa Office để thử phạm vi của R7: chỉ thấy cây
    // chi nhánh mình, không sửa được sơ đồ
    await db
      .update(staff)
      .set({ email: 'lan@tokyosora.vn', passwordHash: await hash(DEV_OFFICE_PASSWORD) })
      .where(eq(staff.code, 'LAN'))

    const params = new ParamsService(db)
    const bundles = new ConfigBundleService(db, params)
    const published = await bundles.publish(branch.id, { kind: 'system' })

    console.log(
      JSON.stringify(
        {
          branchId: branch.id,
          configVersion: published.version,
          tokens: Object.fromEntries(wanted.map((d) => [d.name, d.token])),
        },
        null,
        2,
      ),
    )
    console.log(
      '\nMở app rồi chạy trong Console của trình duyệt:' +
        `\n  POS:      localStorage.setItem('sora.device.token', '${DEV_DEVICE_TOKEN}')` +
        "\n  Bếp nướng: localStorage.setItem('sora.device.token', 'dev-kds-st-06')" +
        '\n  location.reload()',
    )
    console.log(
      '\nPIN Office (duyệt △, ký văn bản): ' +
        Object.entries(DEV_OFFICE_PINS)
          .map(([code, pin]) => `${code} ${pin}`)
          .join(' · ') +
        '\nQuản lý ca Lan vào Office bằng lan@tokyosora.vn',
    )
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
