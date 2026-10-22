/**
 * Kiểm chứng lược đồ trên Postgres THẬT — PGlite là bản Postgres biên dịch WASM,
 * chạy trong tiến trình Node nên không cần cài gì lên máy. Cùng bộ SQL này sẽ
 * chạy trên Postgres 16 qua Docker ở môi trường thật.
 *
 * Mục tiêu: chứng minh các bất biến QUAN TRỌNG được CSDL cưỡng chế, không phải
 * chỉ nằm trong kỷ luật code.
 */
import { PGlite } from '@electric-sql/pglite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { runMigrations } from './migrate'

let db: PGlite

/** Chèn dữ liệu tối thiểu cho các test bên dưới */
async function seedMinimal() {
  await db.exec(`
    INSERT INTO branches (id, name) VALUES ('cg', 'Cầu Giấy');
    INSERT INTO stations (id, name, ticket_prefix, columns)
      VALUES ('ST-02', 'Quầy sống', 'B', 6), ('ST-06', 'Bếp nướng', 'A', 4);
    INSERT INTO staff (code, full_name) VALUES ('NV01', 'Hoa'), ('NV09', 'Minh');
    INSERT INTO areas (branch_id, name) VALUES ('cg', 'Khu Sakura');
    INSERT INTO tables (branch_id, area_id, code, kind, has_grill, grill_type)
      SELECT 'cg', id, 'A4', 'grill', true, 'than' FROM areas LIMIT 1;
  `)
}

beforeAll(async () => {
  db = new PGlite()
  const files = await runMigrations(db)
  expect(files.length).toBeGreaterThanOrEqual(2)
  await seedMinimal()
}, 60_000)

afterAll(async () => {
  await db?.close()
})

describe('Lược đồ áp dụng được trên Postgres', () => {
  it('tạo đủ bảng của GĐ1', async () => {
    const res = await db.query<{ table_name: string }>(
      `SELECT table_name FROM information_schema.tables
        WHERE table_schema = 'public' ORDER BY table_name`,
    )
    const names = res.rows.map((r) => r.table_name)
    for (const t of [
      'branches',
      'staff',
      'devices',
      'stations',
      'dishes',
      'tables',
      'table_sessions',
      'orders',
      'order_lines',
      'tickets',
      'ticket_items',
      'payments',
      'config_bundles',
      'parameters',
      'audit_log',
      'approvals',
      'journal_entries',
      'outbox_events',
      'idempotency_keys',
    ]) {
      expect(names, `thiếu bảng ${t}`).toContain(t)
    }
  })
})

describe('Bếp không bao giờ biết giá (nguyên tắc 3)', () => {
  it('tickets và ticket_items không có cột nào mang thông tin tiền', async () => {
    const res = await db.query<{ table_name: string; column_name: string }>(
      `SELECT table_name, column_name FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name IN ('tickets','ticket_items')
          AND column_name ~ '(price|amount|money|total|cost|discount|vat)'`,
    )
    expect(res.rows).toEqual([])
  })

  it('event trigger chặn ngay việc thêm cột tiền vào vé bếp về sau', async () => {
    await expect(
      db.exec(`ALTER TABLE ticket_items ADD COLUMN unit_price bigint`),
    ).rejects.toThrow(/không được mang thông tin tiền/)
  })
})

describe('Sổ bất biến — chỉ INSERT, sửa sai bằng bút toán ngược', () => {
  // Cột thường để thử UPDATE — không dùng `id` vì đó là identity column, Postgres
  // chặn nó trước cả khi trigger chạy nên sẽ không kiểm được đúng thứ cần kiểm.
  const LEDGERS = [
    ['audit_log', 'action'],
    ['approvals', 'reason'],
    ['journal_entries', 'memo'],
    ['parameter_history', 'key'],
    // Sổ kho: sửa một dòng đã ghi là đổi giá vốn hàng bán của kỳ đã chốt
    ['stock_moves', 'note'],
  ] as const

  beforeAll(async () => {
    await db.exec(`
      INSERT INTO audit_log (branch_id, actor_kind, action, entity, entity_id)
        VALUES ('cg', 'staff', 'order.line.void', 'order_line', '1');
      INSERT INTO approvals (branch_id, action, requested_by, approved_by, reason, entity, entity_id)
        SELECT 'cg', 'order.line.void',
               (SELECT id FROM staff WHERE code = 'NV01'),
               (SELECT id FROM staff WHERE code = 'NV09'),
               'khách đổi ý', 'order_line', '1';
      INSERT INTO journal_entries (branch_id, kind, amount, business_date)
        VALUES ('cg', 'sale', 285000, '2026-08-01');
      INSERT INTO parameter_history (key, new_value) VALUES ('vat', '0'::jsonb);
      INSERT INTO ingredients (id, code, name, base_unit, purchase_unit, base_per_purchase)
        VALUES ('bo-test', 'NL-T-001', 'Bò kiểm thử', 'g', 'kg', 1000);
      INSERT INTO stock_moves (branch_id, ingredient_id, kind, qty_base, cost_vnd, business_date)
        VALUES ('cg', 'bo-test', 'receipt', 1000, 285000, '2026-08-01');
    `)
  })

  it.each(LEDGERS)('%s không cho UPDATE', async (table, column) => {
    await expect(db.exec(`UPDATE ${table} SET ${column} = 'sua-trom'`)).rejects.toThrow(
      /sổ bất biến/,
    )
  })

  it.each(LEDGERS)('%s không cho DELETE', async (table) => {
    await expect(db.exec(`DELETE FROM ${table}`)).rejects.toThrow(/sổ bất biến/)
  })

  it('người duyệt phải KHÁC người xin — cưỡng chế ngay ở CSDL', async () => {
    await expect(
      db.exec(`
        INSERT INTO approvals (branch_id, action, requested_by, approved_by, reason, entity, entity_id)
        SELECT 'cg', 'order.line.void', s.id, s.id, 'tự duyệt', 'order_line', '2'
          FROM staff s WHERE s.code = 'NV01'
      `),
    ).rejects.toThrow(/approvals_separation_of_duties/)
  })
})

describe('Outbox — nội dung sự kiện bất biến, vé bếp không thể mất', () => {
  beforeAll(async () => {
    await db.exec(
      `INSERT INTO outbox_events (branch_id, topic, rooms, payload)
         VALUES ('cg', 'ticket.created', ARRAY['branch:cg:station:ST-06'], '{"ticketId":1}'::jsonb)`,
    )
  })

  it('sự kiện mang danh sách kênh nhận — code nghiệp vụ quyết định, SQL chỉ phát', async () => {
    const res = await db.query<{ rooms: string[] }>(
      `SELECT rooms FROM outbox_events WHERE topic = 'ticket.created'`,
    )
    expect(res.rows[0]!.rooms).toEqual(['branch:cg:station:ST-06'])
  })

  it('trigger phát Realtime tự bỏ qua trên Postgres không có Supabase', async () => {
    // Trên Postgres tự dựng không có schema `realtime`; ghi outbox vẫn phải chạy
    // bình thường thay vì làm hỏng giao dịch nghiệp vụ.
    await db.exec(
      `INSERT INTO outbox_events (branch_id, topic, rooms, payload)
         VALUES ('cg', 'order.updated', ARRAY['branch:cg:orders'], '{}'::jsonb)`,
    )
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM outbox_events WHERE topic = 'order.updated'`,
    )
    expect(res.rows[0]!.n).toBe(1)
  })

  it('đánh dấu đã phát thì được', async () => {
    await db.exec(`UPDATE outbox_events SET dispatched_at = now() WHERE topic = 'ticket.created'`)
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM outbox_events WHERE dispatched_at IS NOT NULL`,
    )
    expect(res.rows[0]!.n).toBe(1)
  })

  it('sửa nội dung sự kiện thì bị chặn', async () => {
    await expect(
      db.exec(`UPDATE outbox_events SET payload = '{"ticketId":999}'::jsonb`),
    ).rejects.toThrow(/chỉ được cập nhật cột dispatched_at/)
  })

  it('không xoá được sự kiện CHƯA phát', async () => {
    await db.exec(
      `INSERT INTO outbox_events (branch_id, topic, rooms, payload)
         VALUES ('cg','order.created', ARRAY['branch:cg:orders'], '{}'::jsonb)`,
    )
    await expect(
      db.exec(`DELETE FROM outbox_events WHERE topic = 'order.created'`),
    ).rejects.toThrow(/chưa phát/)
  })

  it('dọn retention sự kiện đã phát thì được', async () => {
    await db.exec(`DELETE FROM outbox_events WHERE dispatched_at IS NOT NULL`)
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM outbox_events WHERE dispatched_at IS NOT NULL`,
    )
    expect(res.rows[0]!.n).toBe(0)
  })
})

describe('Một bàn chỉ có ĐÚNG MỘT phiên chưa đóng', () => {
  it('mở phiên thứ hai trên cùng bàn bị chặn', async () => {
    await db.exec(`
      INSERT INTO table_sessions (branch_id, table_id, status, business_date)
        SELECT 'cg', id, 'open', '2026-08-01' FROM tables WHERE code = 'A4';
    `)
    await expect(
      db.exec(`
        INSERT INTO table_sessions (branch_id, table_id, status, business_date)
          SELECT 'cg', id, 'open', '2026-08-01' FROM tables WHERE code = 'A4';
      `),
    ).rejects.toThrow(/table_sessions_one_live_per_table/)
  })

  it('trạng thái "đã trả, chờ dọn" vẫn chiếm bàn — bàn không tự đóng khi trả xong', async () => {
    await db.exec(
      `UPDATE table_sessions SET status = 'paid_wait_clear' WHERE status = 'open'`,
    )
    await expect(
      db.exec(`
        INSERT INTO table_sessions (branch_id, table_id, status, business_date)
          SELECT 'cg', id, 'open', '2026-08-01' FROM tables WHERE code = 'A4';
      `),
    ).rejects.toThrow(/table_sessions_one_live_per_table/)
  })

  it('đóng phiên rồi thì mở phiên mới được', async () => {
    await db.exec(
      `UPDATE table_sessions SET status = 'closed', closed_at = now() WHERE status = 'paid_wait_clear'`,
    )
    await db.exec(`
      INSERT INTO table_sessions (branch_id, table_id, status, business_date)
        SELECT 'cg', id, 'open', '2026-08-01' FROM tables WHERE code = 'A4';
    `)
    const res = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM table_sessions WHERE status = 'open'`,
    )
    expect(res.rows[0]!.n).toBe(1)
  })
})

describe('Ràng buộc dữ liệu nghiệp vụ', () => {
  it('bàn khai có bếp mà không nói loại bếp thì bị chặn', async () => {
    await expect(
      db.exec(`
        INSERT INTO tables (branch_id, code, kind, has_grill)
          VALUES ('cg', 'A9', 'grill', true)
      `),
    ).rejects.toThrow(/tables_grill_consistency/)
  })

  it('huỷ đơn phải có lý do', async () => {
    await expect(
      db.exec(`
        INSERT INTO orders (display_code, branch_id, channel, type, status, created_by_kind, business_date)
          VALUES ('ON-2608-0001', 'cg', 'pos', 'dinein', 'cancelled', 'staff', '2026-08-01')
      `),
    ).rejects.toThrow(/orders_cancel_reason_required/)
  })

  it('món hết hẳn không được kèm số phần còn lại', async () => {
    await db.exec(`
      INSERT INTO dishes (id, code, name_vi, station_grill, station_no_grill, base_price)
        VALUES ('bachibo', 'SORA-BO-001', 'Ba chỉ bò', 'ST-02', 'ST-06', 285000);
    `)
    await expect(
      db.exec(`
        INSERT INTO dish_availability (branch_id, dish_id, business_date, status, remaining)
          VALUES ('cg', 'bachibo', '2026-08-01', 'sold_out', 5)
      `),
    ).rejects.toThrow(/dish_availability_remaining_check/)
  })

  it('món đi bếp phải khai đủ hai nhánh trạm; set thì miễn', async () => {
    await expect(
      db.exec(`
        INSERT INTO dishes (id, code, name_vi, base_price)
          VALUES ('thieu-tram', 'SORA-X-001', 'Món thiếu trạm', 100000)
      `),
    ).rejects.toThrow(/dishes_routing_required/)

    await db.exec(`
      INSERT INTO dishes (id, code, kind, name_vi, base_price)
        VALUES ('sora', 'SORA-SET-001', 'set', 'Set Sora', 1280000)
    `)
  })

  it('dòng con của set không được mang giá — giá nằm ở dòng set cha', async () => {
    await db.exec(`
      INSERT INTO orders (display_code, branch_id, channel, type, created_by_kind, business_date)
        VALUES ('ON-2608-0412', 'cg', 'pos', 'dinein', 'staff', '2026-08-01');
      INSERT INTO order_lines (order_id, kind, dish_id, dish_code, name_snapshot, qty, unit_price, price_total)
        SELECT id, 'set_parent', 'sora', 'SORA-SET-001', 'Set Sora', 1, 1280000, 1280000
          FROM orders WHERE display_code = 'ON-2608-0412';
    `)
    await expect(
      db.exec(`
        INSERT INTO order_lines (order_id, parent_line_id, dish_id, dish_code, name_snapshot, qty, unit_price, price_total)
          SELECT o.id, l.id, 'bachibo', 'SORA-BO-001', 'Ba chỉ bò', 1, 285000, 285000
            FROM orders o JOIN order_lines l ON l.order_id = o.id
           WHERE o.display_code = 'ON-2608-0412'
      `),
    ).rejects.toThrow(/order_lines_child_price_zero/)
  })

  it('vé bếp waiting thì đồng hồ chưa chạy, vé đã vào hàng thì bắt buộc có mốc giờ', async () => {
    const orderId = (
      await db.query<{ id: number }>(
        `SELECT id FROM orders WHERE display_code = 'ON-2608-0412'`,
      )
    ).rows[0]!.id

    await expect(
      db.exec(`
        INSERT INTO tickets (display_code, order_id, branch_id, station_id, source, batch_no, state, prep_seconds, queued_at)
          VALUES ('B-0412', ${orderId}, 'cg', 'ST-02', 'pos', 1, 'waiting', 180, now())
      `),
    ).rejects.toThrow(/tickets_clock_check/)

    await expect(
      db.exec(`
        INSERT INTO tickets (display_code, order_id, branch_id, station_id, source, batch_no, state, prep_seconds)
          VALUES ('B-0412', ${orderId}, 'cg', 'ST-02', 'pos', 1, 'cooking', 180)
      `),
    ).rejects.toThrow(/tickets_clock_check/)

    await db.exec(`
      INSERT INTO tickets (display_code, order_id, branch_id, station_id, source, batch_no, state, prep_seconds)
        VALUES ('B-0412', ${orderId}, 'cg', 'ST-02', 'pos', 1, 'waiting', 180)
    `)
  })
})

describe('Chia bill — chống trả trùng (T12)', () => {
  it('món đã có người nhận thì người sau không nhận được; lượt trả hỏng thì nhả ra', async () => {
    const { rows } = await db.query<{ order_id: number; line_id: number }>(`
      SELECT o.id AS order_id, l.id AS line_id
        FROM orders o JOIN order_lines l ON l.order_id = o.id
       WHERE o.display_code = 'ON-2608-0412' LIMIT 1
    `)
    const { order_id: orderId, line_id: lineId } = rows[0]!

    await db.exec(`
      INSERT INTO payments (id, branch_id, order_id, kind, amount, state, created_by_kind, business_date)
        OVERRIDING SYSTEM VALUE
        VALUES (901, 'cg', ${orderId}, 'vietqr', 285000, 'pending', 'customer', '2026-08-01'),
               (902, 'cg', ${orderId}, 'vietqr', 285000, 'pending', 'customer', '2026-08-01');
      INSERT INTO payment_lines (payment_id, order_line_id) VALUES (901, ${lineId});
    `)

    // Người thứ hai giành cùng món → chặn
    await expect(
      db.exec(`INSERT INTO payment_lines (payment_id, order_line_id) VALUES (902, ${lineId})`),
    ).rejects.toThrow(/payment_lines_one_live_claim/)

    // Lượt trả đầu hết hạn → trigger nhả món ra, người thứ hai nhận được
    await db.exec(`UPDATE payments SET state = 'expired' WHERE id = 901`)
    await db.exec(`INSERT INTO payment_lines (payment_id, order_line_id) VALUES (902, ${lineId})`)

    const claims = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM payment_lines WHERE order_line_id = ${lineId} AND live = 'yes'`,
    )
    expect(claims.rows[0]!.n).toBe(1)
  })

  it('lượt trả đã trả tiền phải có mốc paid_at', async () => {
    await expect(
      db.exec(`UPDATE payments SET state = 'paid' WHERE id = 902`),
    ).rejects.toThrow(/payments_paid_at_check/)
  })
})

/**
 * iPad gắn bàn (§9.1).
 *
 * iPad là danh tính của BÀN: nó đọc và ghi đơn của phiên đang sống ở bàn mình.
 * Hai iPad trên một bàn là hai giỏ tranh nhau một đơn, một iPad không bàn là máy
 * khách không biết mình phục vụ ai — cả hai chặn ở CSDL chứ không ở kỷ luật code.
 */
describe('iPad gắn bàn', () => {
  let tableId = 0

  beforeAll(async () => {
    const { rows } = await db.query<{ id: number }>(`SELECT id FROM tables WHERE code = 'A4'`)
    tableId = rows[0]!.id
    await db.exec(`
      INSERT INTO devices (branch_id, kind, name, table_id, token_hash)
        VALUES ('cg', 'table', 'iPad A4', ${tableId}, 'hash-ipad-a4')
    `)
  })

  it('iPad bàn phải có bàn; máy khác không được mang bàn', async () => {
    await expect(
      db.exec(`INSERT INTO devices (branch_id, kind, name, token_hash)
                 VALUES ('cg', 'table', 'iPad lạc', 'hash-ipad-lac')`),
    ).rejects.toThrow(/devices_table_check/)
    await expect(
      db.exec(`INSERT INTO devices (branch_id, kind, name, table_id, token_hash)
                 VALUES ('cg', 'kds', 'Màn bếp', ${tableId}, 'hash-kds-ban')`),
    ).rejects.toThrow(/devices_table_check/)
  })

  it('mỗi bàn đúng một iPad đang chạy — ngắt máy cũ rồi mới ghép máy mới', async () => {
    await expect(
      db.exec(`INSERT INTO devices (branch_id, kind, name, table_id, token_hash)
                 VALUES ('cg', 'table', 'iPad A4 thứ hai', ${tableId}, 'hash-ipad-a4-2')`),
    ).rejects.toThrow(/devices_one_live_table/)

    await db.exec(`UPDATE devices SET revoked_at = now() WHERE token_hash = 'hash-ipad-a4'`)
    await db.exec(`INSERT INTO devices (branch_id, kind, name, table_id, token_hash)
                     VALUES ('cg', 'table', 'iPad A4 thay thế', ${tableId}, 'hash-ipad-a4-3')`)
  })

  it('mã ghép iPad phải chỉ ra bàn, và chỉ trỏ được tới bàn có thật', async () => {
    await expect(
      db.exec(`INSERT INTO pairing_codes (code, branch_id, kind, expires_at)
                 VALUES ('100001', 'cg', 'table', now() + interval '10 minutes')`),
    ).rejects.toThrow(/pairing_codes_table_check/)
    await expect(
      db.exec(`INSERT INTO pairing_codes (code, branch_id, kind, table_id, expires_at)
                 VALUES ('100002', 'cg', 'table', 999999, now() + interval '10 minutes')`),
    ).rejects.toThrow(/pairing_codes_table_id_tables_id_fk/)
  })

  it('luồng QR điện thoại đã gỡ — không còn bảng máy khách, không còn tham số Wi-Fi', async () => {
    const tablesLeft = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM information_schema.tables WHERE table_name = 'table_devices'`,
    )
    expect(tablesLeft.rows[0]!.n).toBe(0)
    const params = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM parameters WHERE key = 'table.branchNetworks'`,
    )
    expect(params.rows[0]!.n).toBe(0)
  })
})

describe('Thẻ công thức — quy trình chế biến (M4 · M8)', () => {
  it('kiểu công thức nằm trong bốn kiểu đã chốt', async () => {
    await expect(
      db.exec(`
        INSERT INTO recipe_docs (subject_kind, subject_id, method_kind)
          VALUES ('dish', 'bachibo', 'xao-nhanh')
      `),
    ).rejects.toThrow(/recipe_docs_method_check/)
  })

  it('bước phải thuộc một trong ba giai đoạn', async () => {
    await db.exec(`
      INSERT INTO recipe_docs (subject_kind, subject_id, method_kind)
        VALUES ('dish', 'bachibo', 'song')
    `)
    await expect(
      db.exec(`
        INSERT INTO recipe_steps (subject_kind, subject_id, phase, sort, text)
          VALUES ('dish', 'bachibo', 'don-ban', 0, 'Chạy bàn')
      `),
    ).rejects.toThrow(/recipe_steps_phase_check/)
  })

  it('bước không bấm giờ để NULL được, nhưng bấm giờ thì phải dương', async () => {
    await db.exec(`
      INSERT INTO recipe_steps (subject_kind, subject_id, phase, sort, text, seconds)
        VALUES ('dish', 'bachibo', 'so_che', 0, 'Rã đông ngăn mát', NULL)
    `)
    await expect(
      db.exec(`
        INSERT INTO recipe_steps (subject_kind, subject_id, phase, sort, text, seconds)
          VALUES ('dish', 'bachibo', 'che_bien', 0, 'Thái ngang thớ', 0)
      `),
    ).rejects.toThrow(/recipe_steps_seconds_check/)
  })

  it('bước không sống được nếu không có thẻ — và xoá thẻ là xoá luôn bước', async () => {
    await expect(
      db.exec(`
        INSERT INTO recipe_steps (subject_kind, subject_id, phase, sort, text)
          VALUES ('dish', 'khong-co-the', 'so_che', 0, 'Bước mồ côi')
      `),
    ).rejects.toThrow(/recipe_steps_doc_fk/)

    await db.exec(`DELETE FROM recipe_docs WHERE subject_id = 'bachibo'`)
    const left = await db.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM recipe_steps WHERE subject_id = 'bachibo'`,
    )
    expect(left.rows[0]!.n).toBe(0)
  })
})

describe('Hoá đơn điện tử (NĐ 254/2026)', () => {
  /** Mỗi đơn chỉ một hoá đơn còn hiệu lực — mỗi tình huống một đơn riêng */
  let seq = 0
  async function newOrder() {
    seq++
    const code = `ON-2610-${String(seq).padStart(4, '0')}`
    const { rows } = await db.query<{ id: number }>(`
      INSERT INTO orders (display_code, branch_id, channel, type, created_by_kind, business_date)
        VALUES ('${code}', 'cg', 'pos', 'dinein', 'staff', '2026-10-22')
      RETURNING id
    `)
    return rows[0]!.id
  }

  /** Hoá đơn đã phát hành, trên một đơn mới */
  async function issued(no: string) {
    const orderId = await newOrder()
    const { rows } = await db.query<{ id: number }>(`
      INSERT INTO invoices (branch_id, order_id, serial, invoice_no, invoice_date, tax_code,
                            state, amount_sub, amount_vat, amount_total, business_date, issued_at)
        VALUES ('cg', ${orderId}, 'C26MAA', '${no}', '2026-10-22', 'MCQT-${no}', 'issued',
                285000, 22800, 307800, '2026-10-22', now())
      RETURNING id
    `)
    return rows[0]!.id
  }

  /** Hoá đơn chưa phát hành được, có hoặc chưa có số */
  async function unissued(state: 'pending' | 'failed', no: string | null = null) {
    const orderId = await newOrder()
    const numbered = no === null ? `NULL, NULL` : `'${no}', '2026-10-22'`
    const { rows } = await db.query<{ id: number }>(`
      INSERT INTO invoices (branch_id, order_id, serial, invoice_no, invoice_date, state,
                            amount_sub, amount_vat, amount_total, business_date)
        VALUES ('cg', ${orderId}, 'C26MAA', ${numbered}, '${state}', 0, 0, 0, '2026-10-22')
      RETURNING id
    `)
    return rows[0]!.id
  }

  it('món chỉ mang một trong hai nhóm thuế suất', async () => {
    await expect(db.exec(`UPDATE dishes SET vat_code = '8%' WHERE id = 'bachibo'`)).rejects.toThrow(
      /dishes_vat_code_check/,
    )
    await db.exec(`UPDATE dishes SET vat_code = 'alcohol' WHERE id = 'bachibo'`)
    await db.exec(`UPDATE dishes SET vat_code = 'standard' WHERE id = 'bachibo'`)
  })

  it('người mua trên đơn phải là doanh nghiệp hoặc cá nhân có tên', async () => {
    const orderId = await newOrder()
    await expect(
      db.exec(`UPDATE orders SET invoice_buyer = '{"kind":"consumer"}' WHERE id = ${orderId}`),
    ).rejects.toThrow(/orders_invoice_buyer_check/)
    await db.exec(`
      UPDATE orders SET invoice_buyer = '{"kind":"person","name":"Nguyễn Văn An"}' WHERE id = ${orderId};
      UPDATE orders SET invoice_buyer = NULL WHERE id = ${orderId};
    `)
  })

  it('hoá đơn cho doanh nghiệp phải có MST đúng dạng và địa chỉ', async () => {
    const orderId = await newOrder()
    const insert = (cols: string, values: string) =>
      db.exec(`
        INSERT INTO invoices (branch_id, order_id, serial, state, amount_sub, amount_vat,
                              amount_total, business_date, buyer_kind, buyer_name, ${cols})
          VALUES ('cg', ${orderId}, 'C26MAA', 'pending', 0, 0, 0, '2026-10-22', 'company', ${values})
      `)
    await expect(insert('buyer_tax_code', `'CÔNG TY FPT', '0101248141'`)).rejects.toThrow(
      /invoices_buyer_check/,
    )
    await expect(
      insert('buyer_tax_code, buyer_address', `'CÔNG TY X', '001203012345', 'Hà Nội'`),
    ).rejects.toThrow(/invoices_buyer_check/)
  })

  it('có số là phải có ngày lập', async () => {
    const orderId = await newOrder()
    await expect(
      db.exec(`
        INSERT INTO invoices (branch_id, order_id, serial, invoice_no, state, amount_sub,
                              amount_vat, amount_total, business_date)
          VALUES ('cg', ${orderId}, 'C26MAA', '00000099', 'failed', 0, 0, 0, '2026-10-22')
      `),
    ).rejects.toThrow(/invoices_numbered_check/)
  })

  it('hoá đơn đã phát hành không sửa được nội dung, không xoá được', async () => {
    const id = await issued('00000001')
    await expect(db.exec(`UPDATE invoices SET amount_total = 1 WHERE id = ${id}`)).rejects.toThrow(
      /đã phát hành — sai thì lập hoá đơn thay thế/,
    )
    await expect(
      db.exec(`UPDATE invoices SET buyer_kind = 'person', buyer_name = 'A' WHERE id = ${id}`),
    ).rejects.toThrow(/đã phát hành/)
    await expect(db.exec(`DELETE FROM invoices WHERE id = ${id}`)).rejects.toThrow(
      /Không xoá hoá đơn/,
    )
  })

  it('đã phát hành chỉ chuyển được sang "đã thay thế", kèm lý do; rồi đứng yên mãi', async () => {
    const id = await issued('00000002')
    await expect(
      db.exec(`UPDATE invoices SET state = 'voided', void_reason = 'nhầm' WHERE id = ${id}`),
    ).rejects.toThrow(/đã phát hành/)
    await expect(
      db.exec(`UPDATE invoices SET state = 'replaced' WHERE id = ${id}`),
    ).rejects.toThrow(/invoices_replaced_check/)

    await db.exec(
      `UPDATE invoices SET state = 'replaced', void_reason = 'Khách đưa MST công ty' WHERE id = ${id}`,
    )
    await expect(
      db.exec(`UPDATE invoices SET void_reason = 'sửa lý do' WHERE id = ${id}`),
    ).rejects.toThrow(/không sửa được nữa/)
  })

  it('số đã cấp không đổi và không huỷ được, kể cả khi lượt gửi thất bại', async () => {
    const id = await unissued('failed', '00000003')
    await expect(
      db.exec(`UPDATE invoices SET invoice_no = '00000004' WHERE id = ${id}`),
    ).rejects.toThrow(/không đổi số/)
    // Số đã cấp không được bỏ — huỷ là để lại một lỗ trong dãy số liên tục
    await expect(
      db.exec(`UPDATE invoices SET state = 'voided', void_reason = 'bỏ' WHERE id = ${id}`),
    ).rejects.toThrow(/invoices_numbered_not_voided/)
    // Gửi lại thì được: tăng số lần thử, không đổi số
    await db.exec(`UPDATE invoices SET attempts = attempts + 1 WHERE id = ${id}`)
  })

  it('huỷ hoá đơn chưa cấp số chỉ cần lý do, không cần bản ghi duyệt', async () => {
    const id = await unissued('pending')
    await expect(db.exec(`UPDATE invoices SET state = 'voided' WHERE id = ${id}`)).rejects.toThrow(
      /invoices_void_check/,
    )
    await db.exec(
      `UPDATE invoices SET state = 'voided', void_reason = 'Đơn huỷ trước khi phát hành' WHERE id = ${id}`,
    )
  })

  it('một hoá đơn chỉ có một bản thay thế còn hiệu lực', async () => {
    const original = await issued('00000005')
    const replacement = async () => {
      const orderId = await newOrder()
      await db.exec(`
        INSERT INTO invoices (branch_id, order_id, serial, state, amount_sub, amount_vat,
                              amount_total, business_date, replaces_id)
          VALUES ('cg', ${orderId}, 'C26MAA', 'pending', 0, 0, 0, '2026-10-22', ${original})
      `)
    }
    await replacement()
    await expect(replacement()).rejects.toThrow(/invoices_one_live_replacement/)
  })

  it('bộ đếm số giữ số trong khoảng 1–99.999.999', async () => {
    await expect(
      db.exec(`INSERT INTO einvoice_counters (serial, last_no) VALUES ('C26MZZ', 100000000)`),
    ).rejects.toThrow(/einvoice_counters_no_check/)
  })

  it('danh bạ người mua chỉ nhận MST tổ chức — số định danh cá nhân không vào được', async () => {
    await expect(
      db.exec(`INSERT INTO invoice_buyers (tax_code, name, source)
                 VALUES ('001203012345', 'Nguyễn Văn An', 'invoice')`),
    ).rejects.toThrow(/invoice_buyers_tax_code_check/)
    await db.exec(`INSERT INTO invoice_buyers (tax_code, name, source)
                     VALUES ('0101248141-001', 'Chi nhánh FPT', 'lookup')`)
  })
})

describe('Sơ đồ tổ chức — cây, chức danh, lịch sử giữ chức danh', () => {
  const unitId = async (name: string) =>
    (await db.query<{ id: number }>(`SELECT id FROM org_units WHERE name = '${name}'`)).rows[0]!.id

  it('migration dựng sẵn gốc công ty — và chỉ được có một gốc', async () => {
    const roots = await db.query<{ kind: string }>(
      `SELECT kind FROM org_units WHERE parent_id IS NULL`,
    )
    expect(roots.rows).toEqual([{ kind: 'cong-ty' }])
    await expect(
      db.exec(`INSERT INTO org_units (kind, name) VALUES ('cong-ty', 'Công ty thứ hai')`),
    ).rejects.toThrow(/org_units_one_root/)
  })

  it('không đặt được một đơn vị vào dưới chính cây con của nó', async () => {
    const root = await unitId('Tokyo Sora')
    await db.exec(
      `INSERT INTO org_units (parent_id, kind, name) VALUES (${root}, 'khoi', 'Khối A')`,
    )
    const a = await unitId('Khối A')
    await db.exec(`INSERT INTO org_units (parent_id, kind, name) VALUES (${a}, 'phong', 'Phòng B')`)
    const b = await unitId('Phòng B')
    await db.exec(`INSERT INTO org_units (parent_id, kind, name) VALUES (${b}, 'to', 'Tổ C')`)
    const c = await unitId('Tổ C')

    await expect(db.exec(`UPDATE org_units SET parent_id = ${c} WHERE id = ${a}`)).rejects.toThrow(
      /cây con của nó/,
    )
    // Chuyển sang nhánh không liên quan thì được
    await db.exec(`UPDATE org_units SET parent_id = ${root} WHERE id = ${c}`)
  })

  it('đơn vị chi nhánh phải mang mã chi nhánh, đơn vị khác thì không', async () => {
    const root = await unitId('Tokyo Sora')
    await expect(
      db.exec(`INSERT INTO org_units (parent_id, kind, name) VALUES (${root}, 'chi-nhanh', 'CG')`),
    ).rejects.toThrow(/org_units_branch_check/)
    await expect(
      db.exec(
        `INSERT INTO org_units (parent_id, kind, name, branch_id) VALUES (${root}, 'khoi', 'X', 'cg')`,
      ),
    ).rejects.toThrow(/org_units_branch_check/)
  })

  it('một đơn vị chỉ có một trưởng, và trưởng là một người', async () => {
    const a = await unitId('Khối A')
    await db.exec(
      `INSERT INTO positions (unit_id, title, is_head, headcount) VALUES (${a}, 'Giám đốc khối', true, 1)`,
    )
    await expect(
      db.exec(
        `INSERT INTO positions (unit_id, title, is_head, headcount) VALUES (${a}, 'Phó giám đốc', true, 1)`,
      ),
    ).rejects.toThrow(/positions_one_head_per_unit/)
    await expect(
      db.exec(
        `INSERT INTO positions (unit_id, title, is_head, headcount) VALUES (${a}, 'Đồng trưởng', false, 2),
                                                                           (${a}, 'Trưởng đôi', true, 2)`,
      ),
    ).rejects.toThrow(/positions_head_headcount_check/)
  })

  it('lịch sử chức danh: không xoá, mỗi dòng chỉ đóng một lần, gán tay phải có lý do', async () => {
    const a = await unitId('Khối A')
    await db.exec(
      `INSERT INTO positions (unit_id, title, headcount) VALUES (${a}, 'Chuyên viên', 3)`,
    )
    const pos = (
      await db.query<{ id: number }>(`SELECT id FROM positions WHERE title = 'Chuyên viên'`)
    ).rows[0]!.id
    const hoa = `(SELECT id FROM staff WHERE code = 'NV01')`

    await expect(
      db.exec(
        `INSERT INTO position_assignments (staff_id, position_id, from_date) VALUES (${hoa}, ${pos}, '2026-10-01')`,
      ),
    ).rejects.toThrow(/position_assignments_basis_check/)

    await db.exec(
      `INSERT INTO position_assignments (staff_id, position_id, from_date, note)
         VALUES (${hoa}, ${pos}, '2026-10-01', 'Gán tay khi dựng sơ đồ')`,
    )
    await expect(
      db.exec(
        `INSERT INTO position_assignments (staff_id, position_id, kind, from_date, note)
           VALUES (${hoa}, (SELECT id FROM positions WHERE title = 'Giám đốc khối'), 'chinh', '2026-10-02', 'x')`,
      ),
    ).rejects.toThrow(/position_assignments_one_main/)

    await db.exec(`UPDATE position_assignments SET to_date = '2026-11-01' WHERE staff_id = ${hoa}`)
    await expect(
      db.exec(`UPDATE position_assignments SET to_date = '2026-12-01' WHERE staff_id = ${hoa}`),
    ).rejects.toThrow(/chỉ được đóng một lần/)
    await expect(
      db.exec(`UPDATE position_assignments SET note = 'sửa lý do' WHERE staff_id = ${hoa}`),
    ).rejects.toThrow(/chỉ được đóng một lần/)
    await expect(db.exec(`DELETE FROM position_assignments`)).rejects.toThrow(/không xoá được/)
  })
})

describe('Văn bản — đóng băng từ lúc trình ký, biên nhận ghi một lần', () => {
  const hoa = `(SELECT id FROM staff WHERE code = 'NV01')`
  const minh = `(SELECT id FROM staff WHERE code = 'NV09')`

  it('nháp sửa và xoá thoải mái', async () => {
    await db.exec(`
      INSERT INTO org_documents (kind, title, body, targets, effective_from, author_id)
        VALUES ('thong-bao', 'Nháp', 'Nội dung', '[{"kind":"toan-chuoi"}]', '2026-10-22', ${hoa})
    `)
    await db.exec(`UPDATE org_documents SET body = 'Sửa nháp' WHERE title = 'Nháp'`)
    await db.exec(`DELETE FROM org_documents WHERE title = 'Nháp'`)
  })

  it('đã ban hành thì không sửa nội dung, không xoá — chỉ thu hồi được, và phải đủ lý do', async () => {
    await db.exec(`
      INSERT INTO org_documents (kind, title, body, targets, effective_from, author_id, signer_id,
                                 state, number, signed_at)
        VALUES ('thong-bao', 'Đã ký', 'Nội dung', '[{"kind":"toan-chuoi"}]', '2026-10-22', ${hoa},
                ${hoa}, 'issued', 'TB-2610-0001', now())
    `)
    await expect(
      db.exec(`UPDATE org_documents SET body = 'Sửa lén' WHERE title = 'Đã ký'`),
    ).rejects.toThrow(/không sửa được/)
    await expect(db.exec(`DELETE FROM org_documents WHERE title = 'Đã ký'`)).rejects.toThrow(
      /không xoá được/,
    )
    await expect(
      db.exec(
        `UPDATE org_documents SET state = 'revoked', revoked_at = now() WHERE title = 'Đã ký'`,
      ),
    ).rejects.toThrow(/org_documents_revoked_check/)
    await db.exec(`
      UPDATE org_documents SET state = 'revoked', revoked_at = now(), revoked_by = ${hoa},
                               revoke_reason = 'Sai ngày áp dụng'
       WHERE title = 'Đã ký'
    `)
  })

  it('quyết định nhân sự phải kèm danh sách thay đổi; khen thưởng thì không', async () => {
    await expect(
      db.exec(`
        INSERT INTO org_documents (kind, decision_type, title, body, targets, effective_from, author_id)
          VALUES ('quyet-dinh', 'bo-nhiem', 'Bổ nhiệm', 'x', '[]', '2026-10-22', ${hoa})
      `),
    ).rejects.toThrow(/org_documents_changes_check/)
    await expect(
      db.exec(`
        INSERT INTO org_documents (kind, decision_type, title, body, targets, effective_from, author_id)
          VALUES ('thong-bao', 'khen-thuong', 'Lẫn loại', 'x', '[]', '2026-10-22', ${hoa})
      `),
    ).rejects.toThrow(/org_documents_decision_type_check/)
  })

  it('biên nhận: mốc đọc ghi đúng một lần, không xoá', async () => {
    const doc = `(SELECT id FROM org_documents WHERE title = 'Đã ký')`
    await db.exec(
      `INSERT INTO org_document_receipts (document_id, staff_id) VALUES (${doc}, ${minh})`,
    )
    await db.exec(`UPDATE org_document_receipts SET read_at = '2026-10-22T09:00:00Z'`)
    // Ghi lại đúng giá trị cũ (coalesce ở service) là được, đổi giá trị thì không
    await db.exec(`UPDATE org_document_receipts SET read_at = '2026-10-22T09:00:00Z'`)
    await expect(
      db.exec(`UPDATE org_document_receipts SET read_at = '2026-10-23T09:00:00Z'`),
    ).rejects.toThrow(/chỉ được ghi thêm/)
    await expect(db.exec(`DELETE FROM org_document_receipts`)).rejects.toThrow(/không xoá được/)
  })
})

describe('customer_ratings — một bữa ăn một phiếu chấm sao', () => {
  it('phiên đã có phiếu B13 thì phiếu chấm tại bàn của phiên đó không tính thêm', async () => {
    await db.exec(`
      INSERT INTO table_sessions (branch_id, table_id, status, business_date, closed_at)
        SELECT 'cg', id, 'closed', '2026-10-20', now() FROM tables WHERE code = 'A4';
      INSERT INTO table_sessions (branch_id, table_id, status, business_date, closed_at)
        SELECT 'cg', id, 'closed', '2026-10-20', now() FROM tables WHERE code = 'A4';
    `)
    const sessions = (
      await db.query<{ id: number }>(
        `SELECT id FROM table_sessions WHERE business_date = '2026-10-20' ORDER BY id`,
      )
    ).rows.map((r) => r.id)
    const [both, tableOnly] = sessions as [number, number]
    await db.exec(`
      INSERT INTO orders (display_code, branch_id, channel, type, created_by_kind, business_date,
                          table_session_id)
        VALUES ('ON-2610-0901', 'cg', 'table', 'dinein', 'customer', '2026-10-20', ${both});
      INSERT INTO feedback (branch_id, order_id, stars, source, business_date)
        SELECT 'cg', id, 2, 'table', '2026-10-20' FROM orders WHERE display_code = 'ON-2610-0901';
      INSERT INTO table_feedback (branch_id, table_session_id, stars, business_date)
        VALUES ('cg', ${both}, 3, '2026-10-20'), ('cg', ${tableOnly}, 5, '2026-10-20');
    `)
    const rows = (
      await db.query<{ origin: string; stars: number; table_session_id: number }>(
        `SELECT origin, stars, table_session_id FROM customer_ratings
          WHERE business_date = '2026-10-20' ORDER BY table_session_id`,
      )
    ).rows
    expect(rows).toEqual([
      { origin: 'feedback', stars: 2, table_session_id: both },
      { origin: 'table_feedback', stars: 5, table_session_id: tableOnly },
    ])
  })
})

describe('Việc — không tự nghiệm thu, việc đã đóng là hồ sơ, checklist chốt khi nộp', () => {
  const hoa = `(SELECT id FROM staff WHERE code = 'NV01')`
  const minh = `(SELECT id FROM staff WHERE code = 'NV09')`
  const task = (title: string) => `(SELECT id FROM tasks WHERE title = '${title}')`

  it('không giao cho chính người làm nghiệm thu', async () => {
    await expect(
      db.exec(`
        INSERT INTO tasks (title, assignee_staff_id, reviewer_staff_id, due_at)
          VALUES ('Tự nghiệm thu', ${minh}, ${minh}, now() + interval '1 day')
      `),
    ).rejects.toThrow(/tasks_review_not_self/)
  })

  it('mỗi mẫu một việc mỗi ngày — sinh lại là trùng khoá, không ra việc thứ hai', async () => {
    const position = `(SELECT id FROM positions ORDER BY id LIMIT 1)`
    await db.exec(`
      INSERT INTO task_templates (title, checklist, assignee_position_id, recurrence, due_minute,
                                  starts_on, created_by)
        VALUES ('Kiểm kho', '{"Đếm","Ghi sổ"}', ${position}, 'hang-ngay', 660, '2026-10-01', ${hoa})
    `)
    const insert = `
      INSERT INTO tasks (title, assignee_position_id, due_at, template_id, occurrence_date)
        SELECT 'Kiểm kho', ${position}, now(), id, '2026-10-22' FROM task_templates
         WHERE title = 'Kiểm kho'`
    await db.exec(insert)
    await expect(db.exec(insert)).rejects.toThrow(/tasks_one_per_occurrence/)
    await expect(
      db.exec(`
        INSERT INTO task_templates (title, assignee_position_id, recurrence, starts_on, created_by)
          VALUES ('Theo ca thiếu ca', ${position}, 'theo-ca', '2026-10-01', ${hoa})
      `),
    ).rejects.toThrow(/task_templates_shape_check/)
  })

  it('checklist tích được khi đang làm; nộp xong thì chốt, việc xong thì không sửa, không xoá', async () => {
    await db.exec(`
      INSERT INTO tasks (title, assignee_staff_id, reviewer_staff_id, due_at, created_by)
        VALUES ('Lau quạt hút', ${minh}, ${hoa}, now() + interval '1 day', ${hoa});
      INSERT INTO task_check_items (task_id, idx, label)
        VALUES (${task('Lau quạt hút')}, 0, 'Tháo lưới lọc');
    `)
    await db.exec(`
      UPDATE task_check_items SET checked_by = ${minh}, checked_at = now()
       WHERE task_id = ${task('Lau quạt hút')}
    `)
    await db.exec(`
      UPDATE tasks SET state = 'submitted', submitted_by = ${minh}, submitted_at = now()
       WHERE title = 'Lau quạt hút'
    `)
    await expect(
      db.exec(`UPDATE task_check_items SET checked_by = NULL, checked_at = NULL`),
    ).rejects.toThrow(/checklist đã chốt/)
    // Người nộp không tự bấm "Đạt"
    await expect(
      db.exec(`
        UPDATE tasks SET state = 'done', reviewed_by = ${minh}, reviewed_at = now(),
                         done_by = ${minh}, done_at = now()
         WHERE title = 'Lau quạt hút'
      `),
    ).rejects.toThrow(/tasks_review_not_self/)
    await db.exec(`
      UPDATE tasks SET state = 'done', reviewed_by = ${hoa}, reviewed_at = now(),
                       done_by = ${minh}, done_at = now()
       WHERE title = 'Lau quạt hút'
    `)
    await expect(
      db.exec(`UPDATE tasks SET due_at = now() + interval '7 days' WHERE title = 'Lau quạt hút'`),
    ).rejects.toThrow(/đã đóng/)
    await expect(db.exec(`DELETE FROM tasks WHERE title = 'Lau quạt hút'`)).rejects.toThrow(
      /không xoá được/,
    )
  })

  it('huỷ phải ghi người huỷ và lý do', async () => {
    await db.exec(`
      INSERT INTO tasks (title, assignee_staff_id, due_at, created_by)
        VALUES ('Dán nhãn kệ', ${minh}, now() + interval '1 day', ${hoa})
    `)
    await expect(
      db.exec(
        `UPDATE tasks SET state = 'cancelled', cancelled_at = now() WHERE title = 'Dán nhãn kệ'`,
      ),
    ).rejects.toThrow(/tasks_cancel_check/)
  })
})

describe('Báo cáo công việc và sự cố — đã nộp là hồ sơ', () => {
  const hoa = `(SELECT id FROM staff WHERE code = 'NV01')`
  const minh = `(SELECT id FROM staff WHERE code = 'NV09')`

  it('báo cáo đã nộp không sửa giá trị; chỉ xác nhận được, và người viết không tự xác nhận', async () => {
    await db.exec(`
      INSERT INTO report_templates (code, name, cadence, branch_id, fields, due_offset_minutes,
                                    review_mode, created_by)
        VALUES ('cuoi-ngay', 'Cuối ngày', 'ngay', 'cg', '[]', 1980, 'cap-tren', ${hoa});
      INSERT INTO work_reports (template_id, template_version, fields_snapshot, branch_id,
                                business_date, period_key, author_id, due_at)
        SELECT id, 1, '[]', 'cg', '2026-10-21', '2026-10-21', ${minh}, now()
          FROM report_templates WHERE code = 'cuoi-ngay';
    `)
    await db.exec(`
      UPDATE work_reports SET state = 'submitted', auto_values = '{}', channel = 'office',
                              submitted_at = now(), on_time = true
    `)
    await expect(
      db.exec(`UPDATE work_reports SET values = '{"nhan-xet":"sửa lén"}'`),
    ).rejects.toThrow(/đã nộp/)
    await expect(
      db.exec(
        `UPDATE work_reports SET state = 'reviewed', reviewed_by = ${minh}, reviewed_at = now()`,
      ),
    ).rejects.toThrow(/work_reports_review_not_self/)
    await db.exec(
      `UPDATE work_reports SET state = 'reviewed', reviewed_by = ${hoa}, reviewed_at = now()`,
    )
    await expect(db.exec(`DELETE FROM work_reports`)).rejects.toThrow(/không xoá được/)
  })

  it('mỗi suất một bản: cùng mẫu, cùng kỳ, cùng ca thì không có bản thứ hai', async () => {
    await expect(
      db.exec(`
        INSERT INTO work_reports (template_id, template_version, fields_snapshot, branch_id,
                                  business_date, period_key, author_id, due_at)
          SELECT id, 1, '[]', 'cg', '2026-10-21', '2026-10-21', ${hoa}, now()
            FROM report_templates WHERE code = 'cuoi-ngay'
      `),
    ).rejects.toThrow(/work_reports_one_per_slot/)
  })

  it('sự cố ATTP nghiêm trọng bắt buộc khai báo ra ngoài; đóng phải đủ nguyên nhân và mốc khai báo', async () => {
    const insert = (required: boolean) => `
      INSERT INTO incidents (code, branch_id, category, severity, occurred_at, business_date,
                             title, description, reported_by, external_report_required)
        VALUES ('SC-2610-0001', 'cg', 'an-toan-thuc-pham', 'nghiem-trong', now(), '2026-10-22',
                'Khách đau bụng', 'Hai khách', ${minh}, ${required})`
    await expect(db.exec(insert(false))).rejects.toThrow(/incidents_external_check/)
    await db.exec(insert(true))
    await expect(
      db.exec(`
        UPDATE incidents SET state = 'closed', closed_by = ${hoa}, closed_at = now(),
                             root_cause = 'Hàu không đạt', corrective_action = 'Đổi nhà cung cấp'
      `),
    ).rejects.toThrow(/incidents_closed_check/)
    // Người báo không tự đóng sự cố nghiêm trọng
    await expect(
      db.exec(`
        UPDATE incidents SET state = 'closed', closed_by = ${minh}, closed_at = now(),
                             root_cause = 'x', corrective_action = 'y', external_reported_at = now()
      `),
    ).rejects.toThrow(/incidents_close_not_self/)
    await db.exec(`
      UPDATE incidents SET state = 'closed', closed_by = ${hoa}, closed_at = now(),
                           root_cause = 'x', corrective_action = 'y', external_reported_at = now()
    `)
    await expect(db.exec(`UPDATE incidents SET title = 'Sửa'`)).rejects.toThrow(/đã đóng/)
    await expect(db.exec(`DELETE FROM incidents`)).rejects.toThrow(/không xoá được/)
  })
})

describe('KPI — luật chấm đóng băng khi mở kỳ, phiếu đóng băng khi chốt', () => {
  const hoa = `(SELECT id FROM staff WHERE code = 'NV01')`
  const minh = `(SELECT id FROM staff WHERE code = 'NV09')`

  it('kỳ đã mở không đổi luật chấm; kỳ chỉ đi tới', async () => {
    await db.exec(`
      INSERT INTO kpi_cycles (branch_id, kind, period_start, period_end, created_by)
        VALUES ('cg', 'thang', '2026-09-01', '2026-09-30', ${hoa})
    `)
    await expect(
      db.exec(`UPDATE kpi_cycles SET state = 'open' WHERE period_start = '2026-09-01'`),
    ).rejects.toThrow(/kpi_cycles_order_check/)
    await db.exec(`
      UPDATE kpi_cycles SET state = 'open', rules = '{"gradeA":105}', opened_by = ${hoa},
                            opened_at = now()
       WHERE period_start = '2026-09-01'
    `)
    await expect(
      db.exec(`UPDATE kpi_cycles SET rules = '{"gradeA":90}' WHERE period_start = '2026-09-01'`),
    ).rejects.toThrow(/luật chấm/)
    await expect(
      db.exec(`UPDATE kpi_cycles SET state = 'draft' WHERE period_start = '2026-09-01'`),
    ).rejects.toThrow(/không lùi/)
  })

  it('không tự chấm KPI của mình; chốt kỳ xong phiếu chỉ nhận ý kiến một lần', async () => {
    await db.exec(`
      INSERT INTO employees (staff_id, branch_id, position, pay_kind, hourly_rate_vnd, started_on)
        VALUES (${minh}, 'cg', 'Phục vụ', 'hourly', 25000, '2026-01-05')
        ON CONFLICT DO NOTHING
    `)
    const cycle = `(SELECT id FROM kpi_cycles WHERE period_start = '2026-09-01')`
    const employee = `(SELECT id FROM employees WHERE staff_id = ${minh} LIMIT 1)`
    await expect(
      db.exec(`
        INSERT INTO kpi_reviews (cycle_id, staff_id, employee_id, reviewer_id)
          VALUES (${cycle}, ${minh}, ${employee}, ${minh})
      `),
    ).rejects.toThrow(/kpi_reviews_not_self/)
    await db.exec(`
      INSERT INTO kpi_reviews (cycle_id, staff_id, employee_id, reviewer_id, score_milli, grade)
        VALUES (${cycle}, ${minh}, ${employee}, ${hoa}, 101000, 'B')
    `)
    await db.exec(`
      UPDATE kpi_cycles SET state = 'review', review_started_by = ${hoa}, review_started_at = now()
       WHERE id = ${cycle};
      UPDATE kpi_cycles SET state = 'closed', closed_by = ${hoa}, closed_at = now()
       WHERE id = ${cycle};
    `)
    await expect(
      db.exec(`UPDATE kpi_reviews SET grade = 'A' WHERE cycle_id = ${cycle}`),
    ).rejects.toThrow(/đã chốt/)
    await db.exec(
      `UPDATE kpi_reviews SET employee_ack_at = now(), employee_feedback = 'Đồng ý' WHERE cycle_id = ${cycle}`,
    )
    await expect(
      db.exec(`UPDATE kpi_reviews SET employee_feedback = 'Đổi ý' WHERE cycle_id = ${cycle}`),
    ).rejects.toThrow(/một lần/)
  })

  it('phiếu kiểm tra cần bằng chứng https; huỷ một lần, không sửa điểm, không xoá', async () => {
    await expect(
      db.exec(`
        INSERT INTO kpi_observations (branch_id, kind, observed_on, score_milli, evidence_url, observer_id)
          VALUES ('cg', 've-sinh', '2026-10-20', 92000, 'http://anh.example/1.jpg', ${hoa})
      `),
    ).rejects.toThrow(/kpi_observations_evidence_check/)
    await db.exec(`
      INSERT INTO kpi_observations (branch_id, kind, observed_on, score_milli, evidence_url, observer_id)
        VALUES ('cg', 've-sinh', '2026-10-20', 92000, 'https://anh.example/1.jpg', ${hoa})
    `)
    await expect(db.exec(`UPDATE kpi_observations SET score_milli = 99000`)).rejects.toThrow(
      /không sửa điểm/,
    )
    await db.exec(
      `UPDATE kpi_observations SET voided_at = now(), voided_by = ${hoa}, void_reason = 'Chấm nhầm chi nhánh'`,
    )
    await expect(db.exec(`DELETE FROM kpi_observations`)).rejects.toThrow(/không xoá được/)
  })
})
