/**
 * Kéo trạng thái từ vé bếp về dòng món — chạy trên Postgres THẬT (PGlite).
 *
 * Kiểm chính câu SQL trong KitchenService.syncOrderLines, vì đó là chỗ dễ sai
 * nhất: món đa trạm nằm ở hai vé khác nhau, và lấy nhầm mức nhanh nhất thì khách
 * được báo "sắp ra" trong khi một nửa món chưa ai đụng tới.
 */
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from '../../db/migrate'

let db: PGlite

/** Bản sao đúng nguyên văn câu SQL trong KitchenService.syncOrderLines */
const SYNC = (ticketId: number) => `
  UPDATE order_lines ol
     SET state = sub.new_state
    FROM (
      SELECT ti.order_line_id AS id,
             CASE MIN(
                    CASE t.state
                      WHEN 'waiting' THEN 0
                      WHEN 'queued'  THEN 0
                      WHEN 'cooking' THEN 1
                      WHEN 'ready'   THEN 2
                      WHEN 'closed'  THEN 2
                      ELSE 0
                    END)
               WHEN 0 THEN 'queued'
               WHEN 1 THEN 'cooking'
               ELSE 'ready'
             END AS new_state
        FROM ticket_items ti
        JOIN tickets t ON t.id = ti.ticket_id
       WHERE t.state <> 'voided'
         AND ti.state <> 'voided'
         AND ti.order_line_id IN (
               SELECT order_line_id FROM ticket_items WHERE ticket_id = ${ticketId}
             )
       GROUP BY ti.order_line_id
    ) sub
   WHERE ol.id = sub.id
     AND ol.state NOT IN ('served', 'voided')
     AND ol.state <> sub.new_state
`

const stateOf = async (lineId: number) => {
  const { rows } = await db.query<{ state: string }>(
    `SELECT state FROM order_lines WHERE id = ${lineId}`,
  )
  return rows[0]!.state
}

let lineDon = 0 // món một trạm
let lineDa = 0 // món đa trạm
let veChinh = 0
let vePhu = 0

beforeAll(async () => {
  db = new PGlite()
  await runMigrations(db)
  await db.exec(`
    INSERT INTO branches (id, name) VALUES ('cg', 'Cầu Giấy');
    INSERT INTO stations (id, name, ticket_prefix, columns)
      VALUES ('ST-02', 'Quầy sống', 'B', 6), ('ST-04', 'Lẩu', 'C', 5);
    INSERT INTO dishes (id, code, name_vi, station_grill, station_no_grill, base_price)
      VALUES ('bo', 'SORA-BO-001', 'Ba chỉ bò', 'ST-02', 'ST-02', 285000),
             ('suki', 'SORA-LAU-001', 'Sukiyaki', 'ST-04', 'ST-04', 690000);
    INSERT INTO orders (display_code, branch_id, channel, type, created_by_kind, business_date)
      VALUES ('ON-2608-9001', 'cg', 'pos', 'dinein', 'staff', '2026-08-01');
  `)

  const { rows: don } = await db.query<{ id: number }>(`
    INSERT INTO order_lines (order_id, kind, dish_id, dish_code, name_snapshot, qty, unit_price, price_total, state, batch_no)
      SELECT id, 'dish', 'bo', 'SORA-BO-001', 'Ba chỉ bò', 1, 285000, 285000, 'queued', 1
        FROM orders WHERE display_code = 'ON-2608-9001' RETURNING id`)
  lineDon = don[0]!.id

  const { rows: da } = await db.query<{ id: number }>(`
    INSERT INTO order_lines (order_id, kind, dish_id, dish_code, name_snapshot, qty, unit_price, price_total, state, batch_no)
      SELECT id, 'dish', 'suki', 'SORA-LAU-001', 'Sukiyaki', 1, 690000, 690000, 'queued', 1
        FROM orders WHERE display_code = 'ON-2608-9001' RETURNING id`)
  lineDa = da[0]!.id

  const { rows: t1 } = await db.query<{ id: number }>(`
    INSERT INTO tickets (branch_id, order_id, station_id, display_code, table_code, batch_no, state, queued_at, prep_seconds, source)
      SELECT 'cg', id, 'ST-02', 'B-001', 'A4', 1, 'queued', now(), 600, 'pos'
        FROM orders WHERE display_code = 'ON-2608-9001' RETURNING id`)
  veChinh = t1[0]!.id

  const { rows: t2 } = await db.query<{ id: number }>(`
    INSERT INTO tickets (branch_id, order_id, station_id, display_code, table_code, batch_no, state, queued_at, prep_seconds, source)
      SELECT 'cg', id, 'ST-04', 'C-001', 'A4', 1, 'queued', now(), 900, 'pos'
        FROM orders WHERE display_code = 'ON-2608-9001' RETURNING id`)
  vePhu = t2[0]!.id

  // Món một trạm nằm ở vé chính; món đa trạm nằm ở CẢ HAI vé, chung link_group
  await db.exec(`
    INSERT INTO ticket_items (ticket_id, order_line_id, dish_id, name_snapshot, qty)
      VALUES (${veChinh}, ${lineDon}, 'bo', 'Ba chỉ bò', 1),
             (${veChinh}, ${lineDa}, 'suki', 'Sukiyaki — khay thịt', 1),
             (${vePhu},  ${lineDa}, 'suki', 'Sukiyaki — nồi', 1);
    UPDATE ticket_items SET link_group = 'suki-1' WHERE order_line_id = ${lineDa};
  `)
}, 60_000)

afterAll(async () => db?.close())

describe('Trạng thái bếp kéo về dòng món', () => {
  it('bếp bắt đầu làm → món một trạm chuyển sang Đang làm', async () => {
    await db.exec(`UPDATE tickets SET state = 'cooking' WHERE id = ${veChinh}`)
    await db.exec(SYNC(veChinh))
    expect(await stateOf(lineDon)).toBe('cooking')
  })

  it('món đa trạm lấy mức CHẬM NHẤT — một vé xong không đủ', async () => {
    await db.exec(`UPDATE tickets SET state = 'ready' WHERE id = ${veChinh}`)
    await db.exec(SYNC(veChinh))
    // Vé phụ (nồi lẩu) vẫn đang xếp hàng → cả món phải giữ ở mức đó
    expect(await stateOf(lineDa)).toBe('queued')
    // Món một trạm thì xong thật
    expect(await stateOf(lineDon)).toBe('ready')
  })

  it('cả hai vé xong thì món đa trạm mới sang Sắp ra', async () => {
    await db.exec(`UPDATE tickets SET state = 'ready' WHERE id = ${vePhu}`)
    await db.exec(SYNC(vePhu))
    expect(await stateOf(lineDa)).toBe('ready')
  })

  it('bếp hoàn tác thì món kéo lùi theo', async () => {
    await db.exec(`UPDATE tickets SET state = 'queued' WHERE id = ${veChinh}`)
    await db.exec(SYNC(veChinh))
    expect(await stateOf(lineDon)).toBe('queued')
  })

  /**
   * Món đã đặt trước mặt khách rồi thì bếp bấm gì cũng không kéo lùi được —
   * không có thao tác nào ở bếp lấy lại được đĩa thức ăn đã bưng ra.
   */
  it('món đã mang ra bàn thì không bị bếp ghi đè', async () => {
    await db.exec(`UPDATE order_lines SET state = 'served' WHERE id = ${lineDon}`)
    await db.exec(`UPDATE tickets SET state = 'cooking' WHERE id = ${veChinh}`)
    await db.exec(SYNC(veChinh))
    expect(await stateOf(lineDon)).toBe('served')
  })

  it('món đã huỷ cũng không bị ghi đè', async () => {
    // CSDL bắt buộc có lý do khi huỷ món — không huỷ trống tay được
    await db.exec(
      `UPDATE order_lines SET state = 'voided', void_reason = 'khách đổi ý' WHERE id = ${lineDa}`,
    )
    await db.exec(`UPDATE tickets SET state = 'ready' WHERE id = ${vePhu}`)
    await db.exec(SYNC(vePhu))
    expect(await stateOf(lineDa)).toBe('voided')
  })

  it('vé bị huỷ không kéo món xuống mức thấp', async () => {
    await db.exec(
      `UPDATE order_lines SET state = 'queued', void_reason = NULL WHERE id = ${lineDa}`,
    )
    await db.exec(`UPDATE tickets SET state = 'voided' WHERE id = ${veChinh}`)
    await db.exec(`UPDATE tickets SET state = 'ready' WHERE id = ${vePhu}`)
    await db.exec(SYNC(vePhu))
    // Chỉ còn vé phụ còn sống và nó đã xong → món xong
    expect(await stateOf(lineDa)).toBe('ready')
  })
})
