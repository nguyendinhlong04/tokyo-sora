import 'reflect-metadata'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { Pool } from 'pg'
import { AppModule } from '../app.module'
import { configureApp } from '../bootstrap'
import { createDb } from '../db/client'
import { runMigrations } from '../db/migrate'
import * as s from '../db/schema'

/**
 * Dựng API thật trên CSDL test thật (Postgres riêng, không phải DB dev).
 * Cố ý KHÔNG mock tầng nào: cái cần chứng minh là các mảnh ghép nối đúng.
 */
export async function bootTestApp() {
  const url = process.env.TEST_DATABASE_URL
  if (!url) throw new Error('Thiếu TEST_DATABASE_URL — xem apps/api/.env.example')
  process.env.DATABASE_URL = url

  const pool = new Pool({ connectionString: url })
  await resetSchema(pool)
  await runMigrations({
    exec: (sql) => pool.query(sql),
    query: async <T,>(sql: string) => ({ rows: (await pool.query(sql)).rows as T[] }),
  })

  const db = createDb(pool)
  const fixtures = await seedFixtures(db)

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile()
  const app = moduleRef.createNestApplication<NestFastifyApplication>(new FastifyAdapter())
  // Dùng ĐÚNG đường cấu hình của server thật — không dựng lại ở đây, vì bản dựng
  // lại sẽ trôi lệch và test sẽ kiểm một ứng dụng khác với ứng dụng chạy thật.
  await configureApp(app)
  await app.init()
  await app.getHttpAdapter().getInstance().ready()

  return {
    app,
    db,
    fixtures,
    async close() {
      await app.close()
      await pool.end()
    },
  }
}

async function resetSchema(pool: Pool) {
  // Event trigger sống ngoài schema public nên phải xoá riêng
  await pool.query(`DROP EVENT TRIGGER IF EXISTS sora_kitchen_money_guard`)
  await pool.query(`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`)
}

export interface Fixtures {
  branchId: string
  cashierId: number
  waiterId: number
  managerId: number
  chefId: number
  pins: Record<number, string>
  /** Bàn CÓ bếp than tại bàn */
  grillTableId: number
  /** Bàn KHÔNG có bếp — món sống phải chuyển sang bếp nướng hộ */
  plainTableId: number
  /** Bàn dự phòng cho các kịch bản cần phiên bàn riêng, không đụng hai bàn trên */
  spareTableId: number
}

/** Món đủ để phủ mọi nhánh định tuyến §16 */
const DISHES = [
  // SỐNG: bàn có bếp → ST-02, không bếp → ST-06 (+8 phút)
  {
    id: 'bachibo',
    code: 'SORA-BO-001',
    nameVi: 'Ba chỉ bò',
    price: 285_000,
    method: 'song',
    grill: 'ST-02',
    noGrill: 'ST-06',
    prep: 180,
  },
  {
    id: 'thanbo',
    code: 'SORA-BO-002',
    nameVi: 'Thăn bò',
    price: 420_000,
    method: 'song',
    grill: 'ST-02',
    noGrill: 'ST-06',
    prep: 180,
  },
  // NƯỚNG: luôn ST-06, bếp nướng là mặc định nên không cộng thêm giờ
  {
    id: 'sodiep',
    code: 'SORA-HS-001',
    nameVi: 'Sò điệp Hokkaido',
    price: 245_000,
    method: 'nuong',
    grill: 'ST-06',
    noGrill: 'ST-06',
    prep: 600,
  },
  // Trạm cố định
  {
    id: 'miso',
    code: 'SORA-SUP-001',
    nameVi: 'Canh miso rong biển',
    price: 45_000,
    method: 'fixed',
    grill: 'ST-04',
    noGrill: 'ST-04',
    prep: 510,
  },
  {
    id: 'duamuoi',
    code: 'SORA-KV-001',
    nameVi: 'Dưa muối ba vị',
    price: 65_000,
    method: 'fixed',
    grill: 'ST-01',
    noGrill: 'ST-01',
    prep: 270,
  },
  {
    id: 'kemtra',
    code: 'SORA-TM-001',
    nameVi: 'Kem trà xanh',
    price: 55_000,
    method: 'fixed',
    grill: 'ST-01',
    noGrill: 'ST-01',
    prep: 270,
  },
] as const

async function seedFixtures(db: ReturnType<typeof createDb>): Promise<Fixtures> {
  const branchId = 'cg'
  await db.insert(s.branches).values({ id: branchId, name: 'Cầu Giấy' })
  await db.insert(s.stations).values([
    { id: 'ST-01', name: 'Khai vị lạnh', ticketPrefix: 'D', columns: 5 },
    { id: 'ST-02', name: 'Quầy sống', ticketPrefix: 'B', columns: 6 },
    { id: 'ST-04', name: 'Lẩu cơm mì', ticketPrefix: 'C', columns: 5 },
    { id: 'ST-06', name: 'Bếp nướng', ticketPrefix: 'A', columns: 4 },
  ])

  for (const d of DISHES) {
    await db.insert(s.dishes).values({
      id: d.id,
      code: d.code,
      nameVi: d.nameVi,
      basePrice: d.price,
      routingMethod: d.method,
      stationGrill: d.grill,
      stationNoGrill: d.noGrill,
      stationTakeaway: d.noGrill,
      stationDelivery: d.noGrill,
      prepSeconds: d.prep,
    })
  }

  // Lẩu Sukiyaki — món ĐA TRẠM: nồi ST-04 + khay thịt sống ST-02
  await db.insert(s.dishes).values({
    id: 'sukiyaki',
    code: 'SORA-LAU-001',
    nameVi: 'Lẩu Sukiyaki bò',
    basePrice: 520_000,
    routingMethod: 'fixed',
    stationGrill: 'ST-04',
    stationNoGrill: 'ST-04',
    stationTakeaway: 'ST-04',
    stationDelivery: 'ST-04',
    secondaryStation: 'ST-02',
    primaryLabel: 'nồi',
    secondaryLabel: 'khay thịt',
    prepSeconds: 600,
  })

  // Set Sora — 3 chặng, mỗi chặng ra ở một đợt khác nhau
  await db.insert(s.dishes).values({
    id: 'setsora',
    code: 'SORA-SET-001',
    kind: 'set',
    nameVi: 'Set Sora',
    basePrice: 1_280_000,
  })
  await db.insert(s.setGroups).values([
    { id: 'sora-mo-bua', setDishId: 'setsora', label: 'Mở bữa', batchOffset: 0, sort: 0 },
    { id: 'sora-bo', setDishId: 'setsora', label: 'Bò trên than', batchOffset: 1, sort: 1 },
    { id: 'sora-ngot', setDishId: 'setsora', label: 'Tráng miệng', batchOffset: 2, sort: 2 },
  ])
  await db.insert(s.setGroupItems).values([
    { groupId: 'sora-mo-bua', dishId: 'duamuoi', qty: 1, portionLabel: '1 phần' },
    { groupId: 'sora-bo', dishId: 'bachibo', qty: 1, portionLabel: '100g' },
    { groupId: 'sora-bo', dishId: 'thanbo', qty: 1, portionLabel: '100g' },
    { groupId: 'sora-ngot', dishId: 'kemtra', qty: 2, portionLabel: '2 phần' },
  ])

  // Tuỳ chọn có chênh giá
  await db.insert(s.modifierGroups).values({ id: 'yaki-them', name: 'Thêm', required: false, multi: true })
  await db.insert(s.modifierOptions).values([
    { id: 'yaki-them-toi', groupId: 'yaki-them', name: 'Tỏi nướng', priceDelta: 15_000 },
    { id: 'yaki-them-rau', groupId: 'yaki-them', name: 'Rau ăn kèm', priceDelta: 25_000 },
  ])
  // Gắn nhóm vào món để bundle cấu hình biết món nào hỏi thêm gì (T3)
  await db.insert(s.dishModifierGroups).values({ dishId: 'thanbo', groupId: 'yaki-them' })

  const [area] = await db
    .insert(s.areas)
    .values({ branchId, name: 'Khu Sakura' })
    .returning({ id: s.areas.id })

  const [grillTable] = await db
    .insert(s.tables)
    .values({
      branchId,
      areaId: area!.id,
      code: 'A4',
      kind: 'grill',
      hasGrill: true,
      grillType: 'than',
      seatMin: 2,
      seatMax: 6,
    })
    .returning({ id: s.tables.id })

  const [plainTable] = await db
    .insert(s.tables)
    .values({
      branchId,
      areaId: area!.id,
      code: '05',
      kind: 'standard',
      hasGrill: false,
      seatMin: 2,
      seatMax: 4,
    })
    .returning({ id: s.tables.id })

  const [spareTable] = await db
    .insert(s.tables)
    .values({
      branchId,
      areaId: area!.id,
      code: 'A9',
      kind: 'grill',
      hasGrill: true,
      grillType: 'than',
      seatMin: 2,
      seatMax: 6,
    })
    .returning({ id: s.tables.id })

  await db.insert(s.parameters).values([
    { key: 'sales.roundingUnit', value: 1000, unit: 'đồng' },
    { key: 'sales.vatRate', value: 0 },
    { key: 'sales.serviceFeeRate', value: 0 },
    { key: 'kitchen.grillServiceExtraSeconds', value: 480, unit: 'giây' },
  ])

  const pins: Record<number, string> = {}
  const make = async (code: string, name: string, roles: string[], pin: string) => {
    const [row] = await db
      .insert(s.staff)
      .values({ code, fullName: name, pinHash: await hash(pin) })
      .returning({ id: s.staff.id })
    for (const role of roles) {
      await db.insert(s.staffRoles).values({ staffId: row!.id, roleCode: role, branchId })
    }
    pins[row!.id] = pin
    return row!.id
  }

  return {
    branchId,
    cashierId: await make('TN01', 'Hoa', ['R2'], '1101'),
    waiterId: await make('PV01', 'Minh', ['R1'], '1102'),
    managerId: await make('QL01', 'Lan', ['R7', 'R10'], '1103'),
    chefId: await make('BE01', 'Đức', ['R4'], '1104'),
    pins,
    grillTableId: grillTable!.id,
    plainTableId: plainTable!.id,
    spareTableId: spareTable!.id,
  }
}
