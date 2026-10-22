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
import { createHash } from 'node:crypto'
import { and, asc, eq } from 'drizzle-orm'
import { Pool } from 'pg'
import { ParamsService } from '../common/params.service'
import { createDb } from './client'
import { branches, devices, tables } from './schema'
import { ConfigBundleService } from '../modules/config-bundle/config-bundle.service'

const DEV_DEVICE_TOKEN = 'dev-device-token'
const DEV_TABLE_TOKEN = 'dev-table-token'

async function main() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('dev-bootstrap không được chạy ở môi trường production')
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const db = createDb(pool)

  try {
    const [branch] = await db.select().from(branches).limit(1)
    if (!branch) throw new Error('Chưa có chi nhánh nào — chạy db:seed trước')

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
