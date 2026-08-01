/**
 * Nạp dữ liệu nền từ prototype vào CSDL:  pnpm --filter @sora/api db:seed
 *
 * Idempotent — chạy lại không nhân bản, chỉ cập nhật. Nguồn là các file JSON do
 * `pnpm extract-seed` sinh ra từ designs/*.dc.html.
 */
import 'dotenv/config'
import { hash } from '@node-rs/argon2'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { Pool } from 'pg'
import { createDb, type Db } from './client'
import { PREP_SECONDS_BY_STATION, routingForSeedDish } from './seed-routing'
import * as s from './schema'

const SEED_DIR = join(__dirname, '..', '..', '..', '..', 'scripts', 'extract-seed', 'out')

const readJson = async <T>(name: string): Promise<T> =>
  JSON.parse(await readFile(join(SEED_DIR, name), 'utf8')) as T

/** Trạm bếp — tên và thuộc tính hiển thị lấy từ prototype KDS (bản hi-fi cuối) */
const STATIONS = [
  { id: 'ST-01', name: 'Khai vị lạnh', kanji: '鮮', color: '#4E7FA8', ticketPrefix: 'D', columns: 5, sort: 1 },
  { id: 'ST-02', name: 'Quầy sống', kanji: '生', color: '#C2BCAE', ticketPrefix: 'B', columns: 6, sort: 2 },
  { id: 'ST-03', name: 'Chiên xào hấp', kanji: '揚', color: '#D08A1C', ticketPrefix: 'E', columns: 5, sort: 3 },
  { id: 'ST-04', name: 'Lẩu cơm mì', kanji: '鍋', color: '#4A8F63', ticketPrefix: 'C', columns: 5, sort: 4 },
  { id: 'ST-05', name: 'Quầy đồ uống', kanji: '酒', color: '#C9A85C', ticketPrefix: 'F', columns: 5, sort: 5 },
  { id: 'ST-06', name: 'Bếp nướng', kanji: '焼', color: '#D9721F', ticketPrefix: 'A', columns: 4, sort: 6 },
]

/** Tham số khởi điểm cho Trung tâm tham số A6 (§29.1) */
const PARAMETERS: {
  key: string
  value: unknown
  unit?: string
  sensitive?: boolean
}[] = [
  { key: 'sales.vatRate', value: 0, unit: 'tỉ lệ', sensitive: true },
  { key: 'sales.serviceFeeRate', value: 0, unit: 'tỉ lệ', sensitive: true },
  { key: 'sales.roundingUnit', value: 1000, unit: 'đồng' },
  { key: 'kitchen.slaSeconds', value: 720, unit: 'giây' },
  { key: 'kitchen.undoSeconds', value: 30, unit: 'giây' },
  { key: 'kitchen.grillServiceExtraSeconds', value: 480, unit: 'giây' },
  { key: 'kitchen.packBufferSeconds', value: 300, unit: 'giây' },
  { key: 'kitchen.deliveryBufferSeconds', value: 1200, unit: 'giây' },
  { key: 'auth.pinMaxAttemptsPerMinute', value: 5, unit: 'lần', sensitive: true },
  { key: 'auth.pinLockoutMinutes', value: 5, unit: 'phút', sensitive: true },
  { key: 'auth.pairingCodeTtlMinutes', value: 10, unit: 'phút' },
  { key: 'auth.staffSessionHours', value: 12, unit: 'giờ' },
  { key: 'reservation.softHoldMinutes', value: 10, unit: 'phút' },
  { key: 'reservation.tableHoldMinutes', value: 15, unit: 'phút' },
]

/** Vai trò trong prototype → mã vai trò trong ma trận §4.2 */
const ROLE_BY_TITLE: Record<string, string> = {
  'Thu ngân': 'R2',
  'Phục vụ': 'R1',
  'Trưởng ca': 'R7',
  'Lễ tân': 'R3',
  Bếp: 'R4',
}

/** PIN dev — mọi nhân viên dùng 4 số khác nhau, chỉ dành cho môi trường phát triển */
const DEV_PINS: Record<string, string> = {
  hoa: '1101',
  minh: '1102',
  tuan: '1103',
  lan: '1104',
  duc: '1105',
}

interface SeedBranch {
  id: string
  name: string
  addr?: string
  phone?: string
  hours?: string
}
interface SeedDishRow {
  id: string
  code: string | null
  nameVi: string
  nameJa: string | null
  kana: string | null
  group: string | null
  priceVnd: number | null
  costVnd: number | null
  allergens: string | null
  descShort: string | null
  descLong: string | null
  active: boolean
  stationsFromKitchen: string[]
}
interface SeedTable {
  n: string
  z: string
  grill: number
  cap: number
}
interface SeedStaff {
  id: string
  name: string
  role: string
}
interface SeedModifierGroup {
  gid: string
  title: string
  req: boolean
  opts: { id: string; n: string; p: number }[]
}

async function seed(db: Db) {
  // ---- Chi nhánh ----
  const branchRows = await readJson<SeedBranch[]>('branches.json')
  for (const b of branchRows) {
    await db
      .insert(s.branches)
      .values({
        id: b.id,
        name: b.name,
        address: b.addr ?? null,
        phone: b.phone ?? null,
        openHours: b.hours ? { raw: b.hours } : null,
      })
      .onConflictDoUpdate({
        target: s.branches.id,
        set: { name: b.name, address: b.addr ?? null, phone: b.phone ?? null },
      })
  }

  // ---- Trạm bếp ----
  for (const st of STATIONS) {
    await db.insert(s.stations).values(st).onConflictDoUpdate({ target: s.stations.id, set: st })
  }

  // ---- Nhóm thực đơn ----
  const cats = await readJson<[string, string, string][]>('categories.json')
  await Promise.all(
    cats.map((c, i) => {
      const row = { id: c[0], nameVi: c[1], kanji: c[2], sort: i }
      return db.insert(s.categories).values(row).onConflictDoUpdate({ target: s.categories.id, set: row })
    }),
  )

  // ---- Món ----
  const { dishes } = await readJson<{ dishes: SeedDishRow[] }>('dishes.json')
  const unroutable: string[] = []
  for (const d of dishes) {
    const isSet = d.group === 'set'
    const routing = isSet ? null : routingForSeedDish(d)
    if (!isSet && !routing) {
      unroutable.push(d.id)
      continue
    }
    const row = {
      id: d.id,
      code: d.code ?? `SORA-${d.id.toUpperCase()}`,
      kind: isSet ? 'set' : d.group && ['bia', 'ruou', 'tra'].includes(d.group) ? 'drink' : 'dish',
      categoryId: d.group,
      nameVi: d.nameVi,
      nameJa: d.nameJa,
      kana: d.kana,
      shortDesc: d.descShort,
      longDesc: d.descLong,
      allergens: d.allergens ? d.allergens.split(',').map((a) => a.trim()) : null,
      routingMethod: routing?.method ?? null,
      stationGrill: routing?.stationGrill ?? null,
      stationNoGrill: routing?.stationNoGrill ?? null,
      stationTakeaway: routing?.stationTakeaway ?? null,
      stationDelivery: routing?.stationDelivery ?? null,
      secondaryStation: routing?.secondaryStation ?? null,
      primaryLabel: routing?.primaryLabel ?? null,
      secondaryLabel: routing?.secondaryLabel ?? null,
      prepSeconds: routing?.prepSeconds ?? 300,
      basePrice: d.priceVnd ?? 0,
      active: d.active,
    }
    await db.insert(s.dishes).values(row).onConflictDoUpdate({ target: s.dishes.id, set: row })
  }
  if (unroutable.length) {
    throw new Error(
      `Không suy được trạm cho món: ${unroutable.join(', ')} — bổ sung vào seed-routing.ts`,
    )
  }

  // ---- Nhóm tuỳ chọn (modifier) ----
  const mods = await readJson<Record<string, SeedModifierGroup[]>>('modifiers.json')
  for (const [scope, groups] of Object.entries(mods)) {
    for (const g of groups) {
      const gid = `${scope}-${g.gid}`
      const grow = { id: gid, name: g.title, required: g.req, multi: !g.req, pickMin: g.req ? 1 : 0, pickMax: g.req ? 1 : null }
      await db.insert(s.modifierGroups).values(grow).onConflictDoUpdate({ target: s.modifierGroups.id, set: grow })
      for (const [i, o] of g.opts.entries()) {
        const orow = { id: `${gid}-${o.id}`, groupId: gid, name: o.n, priceDelta: o.p, sort: i }
        await db.insert(s.modifierOptions).values(orow).onConflictDoUpdate({ target: s.modifierOptions.id, set: orow })
      }
    }
  }

  // ---- Khu vực & bàn (dùng cho chi nhánh đầu tiên) ----
  const branchId = branchRows[0]!.id
  const tableRows = await readJson<{ tables: SeedTable[] }>('tables.json')
  const zoneNames: Record<string, string> = { sakura: 'Khu Sakura', sumi: 'Khu Sumi', private: 'Phòng riêng' }
  const areaIdByZone = new Map<string, number>()
  for (const zone of new Set(tableRows.tables.map((t) => t.z))) {
    const existing = await db.query.areas.findFirst({
      where: (a, { and, eq }) => and(eq(a.branchId, branchId), eq(a.name, zoneNames[zone] ?? zone)),
    })
    if (existing) {
      areaIdByZone.set(zone, existing.id)
      continue
    }
    const [created] = await db
      .insert(s.areas)
      .values({ branchId, name: zoneNames[zone] ?? zone })
      .returning({ id: s.areas.id })
    areaIdByZone.set(zone, created!.id)
  }
  for (const t of tableRows.tables) {
    const hasGrill = t.grill === 1
    const row = {
      branchId,
      areaId: areaIdByZone.get(t.z)!,
      code: t.n,
      kind: t.z === 'private' ? 'private' : hasGrill ? 'grill' : 'standard',
      hasGrill,
      // Bàn khai có bếp buộc phải nói loại bếp (ràng buộc tables_grill_consistency)
      grillType: hasGrill ? 'than' : null,
      seatMin: 2,
      seatMax: t.cap,
    }
    await db
      .insert(s.tables)
      .values(row)
      .onConflictDoUpdate({ target: [s.tables.branchId, s.tables.code], set: row })
  }

  // ---- Nhân viên + vai trò ----
  const { staff: staffRows } = await readJson<{ staff: SeedStaff[] }>('staff.json')
  for (const st of staffRows) {
    const pin = DEV_PINS[st.id] ?? '1100'
    const row = { code: st.id.toUpperCase(), fullName: st.name, pinHash: await hash(pin) }
    const [created] = await db
      .insert(s.staff)
      .values(row)
      .onConflictDoUpdate({ target: s.staff.code, set: { fullName: row.fullName, pinHash: row.pinHash } })
      .returning({ id: s.staff.id })
    const roleCode = ROLE_BY_TITLE[st.role] ?? 'R1'
    await db
      .insert(s.staffRoles)
      .values({ staffId: created!.id, roleCode, branchId })
      .onConflictDoNothing()
  }

  // ---- Tham số A6 ----
  for (const p of PARAMETERS) {
    await db
      .insert(s.parameters)
      .values({ key: p.key, branchId: null, value: p.value, unit: p.unit, sensitive: p.sensitive ?? false })
      .onConflictDoNothing()
  }

  return {
    branches: branchRows.length,
    stations: STATIONS.length,
    categories: cats.length,
    dishes: dishes.length,
    tables: tableRows.tables.length,
    staff: staffRows.length,
    parameters: PARAMETERS.length,
  }
}

async function main() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  try {
    const summary = await seed(createDb(pool))
    console.log('Đã nạp:', JSON.stringify(summary))
    console.log(`Thời gian chuẩn theo trạm: ${JSON.stringify(PREP_SECONDS_BY_STATION)}`)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
