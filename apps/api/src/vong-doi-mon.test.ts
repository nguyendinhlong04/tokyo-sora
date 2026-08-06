/**
 * Kịch bản end-to-end: đi hết vòng đời một món trên CSDL THẬT, qua đúng các
 * đường HTTP mà điện thoại khách và màn bếp gọi.
 *
 *     LIVE_SCENARIO=1 pnpm --filter @sora/api test src/vong-doi-mon.test.ts
 *
 * MẶC ĐỊNH BỎ QUA. Kịch bản này mở bàn, tạo đơn và bấm vé trên CSDL đang chạy
 * thật — để nó chạy lẫn trong `pnpm test` là có ngày ai đó thả một đơn ma vào
 * giữa giờ cao điểm. Phải khai biến môi trường mới chạy.
 *
 * Kịch bản: khách quét mã → gọi món → gửi bếp → bếp làm → bếp xong → người chạy
 * bấm "Đã mang ra". Sau MỖI bước đều hỏi lại đúng đường mà điện thoại khách gọi,
 * để xem khách nhìn thấy gì.
 *
 * Cố ý gọi cả Sukiyaki — món đa trạm, nồi một trạm khay thịt một trạm. Đây là ca
 * dễ sai nhất: xong một nửa mà báo khách "sắp ra" là khách chờ hụt.
 *
 * Dấu vết để lại: vài dòng nhật ký thao tác và hộp thư sự kiện — hai sổ chỉ ghi
 * thêm, cố ý không xoá được. Sổ kho thì KHÔNG bị đụng chừng nào chưa khai công
 * thức cho món; nếu quán đã khai công thức thì kịch bản này sẽ trừ kho thật, phải
 * cân nhắc lại trước khi chạy.
 */
import 'reflect-metadata'
import type { NestFastifyApplication } from '@nestjs/platform-fastify'
import { Pool } from 'pg'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createApp } from './bootstrap'

const BRANCH = 'cg'
const TABLE = '05'

/** Địa chỉ mạng quán đọc từ tham số A6 — đừng viết cứng, quán đổi đường truyền là hỏng */
let trongQuan = ''

let app: NestFastifyApplication
let pool: Pool
let sessionId = 0
let orderId = 0
let kdsToken = ''
let khach: Record<string, string> = {}

const server = () => app.getHttpAdapter().getInstance()

/** Trạng thái từng món đúng như điện thoại khách đang thấy */
async function khachThay(): Promise<Record<string, string>> {
  const res = await server().inject({
    method: 'GET',
    url: `/api/table-sessions/${sessionId}/order`,
    cookies: khach,
  })
  const body = res.json<{ lines: { nameSnapshot: string; state: string }[] }>()
  return Object.fromEntries(body.lines.map((l) => [l.nameSnapshot, l.state]))
}

const bepBam = (ticketId: number, action: 'start' | 'done') =>
  server().inject({
    method: 'POST',
    url: `/api/tickets/${ticketId}/state`,
    headers: { 'x-sora-device': kdsToken, 'content-type': 'application/json' },
    payload: { action },
  })

async function moBanVaGhepBep() {
  process.env.DATABASE_URL ??= process.env.DATABASE_MIGRATION_URL
  pool = new Pool({ connectionString: process.env.DATABASE_MIGRATION_URL })
  app = await createApp()
  await app.init()
  await server().ready()

  const { rows: mang } = await pool.query<{ value: string }>(
    `SELECT value #>> '{}' AS value FROM parameters
      WHERE key = 'table.branchNetworks' AND branch_id = $1`,
    [BRANCH],
  )
  trongQuan = (mang[0]?.value ?? '').split(',')[0]?.trim() ?? ''
  if (!trongQuan) {
    throw new Error(
      `Chi nhánh ${BRANCH} chưa khai table.branchNetworks ở màn A6 — kịch bản cần nó để giả lập máy đang ở trong quán`,
    )
  }

  const { rows } = await pool.query(
    `INSERT INTO table_sessions (branch_id, table_id, guest_count, business_date)
       SELECT $1, id, 2, current_date FROM tables WHERE branch_id = $1 AND code = $2
       RETURNING id`,
    [BRANCH, TABLE],
  )
  sessionId = rows[0].id

  // Màn bếp: ghép bằng đường thật để nó mang đúng vai trò nhân viên bếp
  const { randomBytes, createHash } = await import('node:crypto')
  kdsToken = randomBytes(32).toString('base64url')
  await pool.query(
    `INSERT INTO devices (branch_id, kind, name, token_hash) VALUES ($1,'kds','Màn bếp thử',$2)`,
    [BRANCH, createHash('sha256').update(kdsToken).digest('hex')],
  )
  console.log(
    `\nĐã mở bàn ${TABLE} (lượt ăn #${sessionId}), ghép một màn bếp, coi ${trongQuan} là trong quán\n`,
  )
}

async function donDep() {
  if (sessionId) {
    await pool.query(
      `DELETE FROM ticket_items WHERE ticket_id IN (SELECT id FROM tickets WHERE order_id = $1)`,
      [orderId],
    )
    await pool.query(`DELETE FROM tickets WHERE order_id = $1`, [orderId])
    await pool.query(`DELETE FROM order_lines WHERE order_id = $1`, [orderId])
    await pool.query(`DELETE FROM order_batches WHERE order_id = $1`, [orderId])
    await pool.query(`DELETE FROM table_devices WHERE table_session_id = $1`, [sessionId])
    await pool.query(`DELETE FROM orders WHERE id = $1`, [orderId])
    await pool.query(`UPDATE table_sessions SET status='closed', closed_at=now() WHERE id = $1`, [
      sessionId,
    ])
    await pool.query(`UPDATE devices SET revoked_at = now() WHERE name = 'Màn bếp thử'`)
    console.log('\nDọn dẹp: xoá đơn, vé, máy khách; đóng bàn; thu hồi màn bếp')
  }
  await app?.close()
  await pool?.end()
}

describe.skipIf(!process.env.LIVE_SCENARIO)(
  'Vòng đời một món — từ lúc khách bấm tới lúc bưng ra bàn',
  () => {
    beforeAll(moBanVaGhepBep, 60_000)
    afterAll(donDep)

    let veCua: Record<number, string[]> = {}

    it('1 · khách quét mã, vào thẳng vì đang ở trong quán', async () => {
      const res = await server().inject({
        method: 'POST',
        url: '/api/table-devices/join',
        headers: { 'x-forwarded-for': trongQuan, 'content-type': 'application/json' },
        payload: { branchId: BRANCH, tableCode: TABLE },
      })
      expect(res.json().state).toBe('admitted')
      khach = Object.fromEntries(res.cookies.map((c) => [c.name, c.value]))
    })

    it('2 · khách gọi Ba chỉ bò và Sukiyaki', async () => {
      const res = await server().inject({
        method: 'POST',
        url: `/api/table-sessions/${sessionId}/lines`,
        headers: { 'content-type': 'application/json' },
        cookies: khach,
        payload: {
          lines: [
            { dishId: 'bachi', qty: 1 },
            { dishId: 'sukiyaki', qty: 1 },
          ],
        },
      })
      expect(res.statusCode).toBe(201)
      orderId = res.json().orderId
      const thay = await khachThay()
      console.log('  sau khi chọn món :', JSON.stringify(thay))
      expect(Object.values(thay).every((s) => s === 'draft')).toBe(true)
    })

    it('3 · gửi bếp → khách thấy "Bếp đã nhận"', async () => {
      const res = await server().inject({
        method: 'POST',
        url: `/api/table-sessions/${sessionId}/send`,
        cookies: khach,
      })
      expect(res.statusCode).toBe(201)

      const thay = await khachThay()
      console.log('  sau khi gửi bếp  :', JSON.stringify(thay))
      expect(Object.values(thay).every((s) => s === 'queued')).toBe(true)

      // Vé nào chứa món nào — Sukiyaki phải nằm ở HAI vé khác trạm
      const { rows } = await pool.query<{ ticket_id: number; ten: string }>(
        `SELECT ti.ticket_id, ti.name_snapshot AS ten FROM ticket_items ti
         JOIN tickets t ON t.id = ti.ticket_id WHERE t.order_id = $1`,
        [orderId],
      )
      veCua = {}
      for (const r of rows) veCua[r.ticket_id] = [...(veCua[r.ticket_id] ?? []), r.ten]
      console.log('  vé bếp sinh ra   :', JSON.stringify(veCua))
      expect(Object.keys(veCua).length).toBeGreaterThanOrEqual(2)
    })

    it('4 · bếp bấm Bắt đầu ở một trạm → chỉ món của trạm đó chuyển "Đang làm"', async () => {
      const veDauTien = Number(Object.keys(veCua)[0])
      expect((await bepBam(veDauTien, 'start')).statusCode).toBe(201)
      const thay = await khachThay()
      console.log('  bếp bắt đầu      :', JSON.stringify(thay))
      expect(Object.values(thay)).toContain('cooking')
    })

    it('5 · một trạm xong chưa đủ cho món đa trạm', async () => {
      const veDauTien = Number(Object.keys(veCua)[0])
      expect((await bepBam(veDauTien, 'done')).statusCode).toBe(201)
      const thay = await khachThay()
      console.log('  một trạm xong    :', JSON.stringify(thay))
      // Sukiyaki nằm ở hai vé — vé kia chưa đụng thì nó chưa được "sắp ra"
      expect(thay['Sukiyaki']).not.toBe('ready')
    })

    it('6 · mọi trạm xong → khách thấy "Sắp ra"', async () => {
      for (const id of Object.keys(veCua).map(Number)) {
        await bepBam(id, 'start')
        await bepBam(id, 'done')
      }
      const thay = await khachThay()
      console.log('  mọi trạm xong    :', JSON.stringify(thay))
      expect(Object.values(thay).every((s) => s === 'ready')).toBe(true)
    })

    it('7 · bảng Expo báo đợt này ra được', async () => {
      const res = await server().inject({
        method: 'GET',
        url: '/api/expo',
        headers: { 'x-sora-device': kdsToken },
      })
      const dot = res.json<{ orders: { orderId: number; ready: boolean }[] }>().orders
      const cuaTa = dot.find((o) => o.orderId === orderId)
      console.log('  Expo             :', JSON.stringify(cuaTa))
      expect(cuaTa?.ready).toBe(true)
    })

    it('8 · người chạy bấm "Đã mang ra" → khách thấy "Đã ra"', async () => {
      const res = await server().inject({
        method: 'POST',
        url: '/api/expo/served',
        headers: { 'x-sora-device': kdsToken, 'content-type': 'application/json' },
        payload: { orderId, batchNo: 1 },
      })
      expect(res.statusCode).toBe(201)
      const thay = await khachThay()
      console.log('  đã mang ra       :', JSON.stringify(thay))
      expect(Object.values(thay).every((s) => s === 'served')).toBe(true)
    })

    it('9 · đợt đã bưng ra biến khỏi bảng Expo', async () => {
      const res = await server().inject({
        method: 'GET',
        url: '/api/expo',
        headers: { 'x-sora-device': kdsToken },
      })
      const dot = res.json<{ orders: { orderId: number }[] }>().orders
      expect(dot.find((o) => o.orderId === orderId)).toBeUndefined()
    })
  },
)
