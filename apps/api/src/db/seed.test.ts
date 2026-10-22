/**
 * db:seed chỉ nạp CSDL mới — chạy trên Postgres THẬT (PGlite), không cần
 * `scripts/extract-seed/out/` (gitignore, CI không có): test tự viết một bộ JSON
 * nhỏ cùng hình dạng vào thư mục tạm.
 *
 * Lỗi được chặn: DEPLOY.md chạy db:seed lên Supabase, mà phần lớn lệnh ghi của seed
 * là UPSERT — chạy lại là lặng lẽ trả tên món, giá niêm yết, sơ đồ bàn và thẻ công
 * thức đã sửa ở Office về như prototype.
 */
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Db } from './client'
import { runMigrations } from './migrate'
import * as schema from './schema'
import { parseSeedArgs, seed, SeedRefused } from './seed'

const dish = (id: string, group: string, nameVi: string, priceVnd: number) => ({
  id,
  code: null,
  nameVi,
  nameJa: null,
  kana: null,
  group,
  subGroup: '',
  priceVnd,
  costVnd: null,
  allergens: null,
  descShort: null,
  descLong: null,
  isVegetarian: false,
  isSpicy: false,
  hasSeafood: false,
  isSignature: false,
  active: true,
  stationsFromKitchen: [] as string[],
})

/** Ba món có đủ đường đi: món nướng có thẻ công thức + bài kể, món chiên, một set hai chặng */
const DISHES = [
  dish('misuji', 'yaki', 'Lõi vai bò', 380_000),
  dish('karaage', 'chien', 'Gà chiên karaage', 145_000),
  dish('sora', 'set', 'Set Sora', 1_280_000),
]

const FILES = {
  'branches.json': [{ id: 'cg', name: 'Cầu Giấy', addr: '24 Trần Duy Hưng', hours: '11:00–23:00' }],
  'categories.json': [
    ['set', 'Set', '膳'],
    ['yaki', 'Nướng', '焼'],
    ['chien', 'Chiên xào hấp', '揚'],
  ],
  'dishes.json': { dishes: DISHES },
  'sets.json': {
    setDetails: {
      setsora: {
        courses: [
          { k: '焼', label: 'Bò trên than', items: [{ id: 'misuji', q: '100g' }] },
          { k: '揚', label: 'Chiên', items: [{ id: 'karaage', q: '1 phần' }] },
        ],
      },
    },
  },
  'modifiers.json': {
    modYaki: [
      {
        gid: 'vi',
        title: 'Chọn vị',
        req: true,
        opts: [{ id: 'muoi', n: 'Muối tiêu chanh', p: 0 }],
      },
    ],
  },
  'tables.json': {
    tables: [
      { n: 'A4', z: 'sakura', grill: 1, cap: 4 },
      { n: '05', z: 'momiji', grill: 0 },
    ],
  },
}

const dirs: string[] = []

/** Viết bộ JSON vào một thư mục tạm, thay từng file theo `overrides` */
async function fixture(overrides: Partial<Record<keyof typeof FILES, unknown>> = {}) {
  const dir = await mkdtemp(join(tmpdir(), 'sora-seed-'))
  dirs.push(dir)
  for (const [name, data] of Object.entries({ ...FILES, ...overrides })) {
    await writeFile(join(dir, name), JSON.stringify(data))
  }
  return dir
}

let pg: PGlite
let db: Db
/** Bước đầu của thẻ công thức misuji như prototype — để thấy nạp đè trả nó về */
let prototypeStep = ''

/** `from` là phần sau FROM: tên bảng, có thể kèm WHERE */
const count = async (from: string) =>
  (await pg.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${from}`)).rows[0]!.n

const misuji = async () =>
  (
    await pg.query<{ name: string; price: number }>(
      `SELECT name_vi AS name, base_price::int AS price FROM dishes WHERE id = 'misuji'`,
    )
  ).rows[0]!

const a4Seats = async () =>
  (await pg.query<{ n: number }>(`SELECT seat_max AS n FROM tables WHERE code = 'A4'`)).rows[0]!.n

const firstMisujiStep = async () =>
  (
    await pg.query<{ text: string }>(
      `SELECT text FROM recipe_steps WHERE subject_id = 'misuji' ORDER BY phase, sort LIMIT 1`,
    )
  ).rows[0]!.text

beforeAll(async () => {
  pg = new PGlite()
  await runMigrations(pg)
  // Trình điều khiển PGlite của Drizzle cùng bề mặt lúc chạy với node-postgres
  db = drizzle(pg, { schema }) as unknown as Db
}, 60_000)

afterAll(async () => {
  await pg?.close()
  for (const dir of dirs) await rm(dir, { recursive: true, force: true })
})

// Các ca nối tiếp nhau trên CÙNG một CSDL, đúng thứ tự đời thật: lượt đầu hỏng →
// lượt đầu thành công → Office sửa → ai đó chạy lại lệnh ở DEPLOY.md → máy dev nạp đè.
describe('db:seed chỉ nạp CSDL mới', () => {
  it('lượt đầu hỏng giữa chừng không để lại gì, nên lượt sau không bị từ chối', async () => {
    // Món không suy được trạm làm seed ném SAU khi đã ghi chi nhánh, trạm, nhóm và
    // ba món đầu — thiếu transaction thì CSDL kẹt ở nửa thực đơn, mọi lượt sau bị từ chối
    const dir = await fixture({
      'dishes.json': { dishes: [...DISHES, dish('monla', 'khac', 'Món lạ', 50_000)] },
    })
    await expect(seed(db, { dir })).rejects.toThrow('Không suy được trạm cho món: monla')
    expect(await count('branches')).toBe(0)
    expect(await count('dishes')).toBe(0)
  })

  it('CSDL trống: nạp đủ dữ liệu nền trong một lượt', async () => {
    const summary = await seed(db, { dir: await fixture() })
    expect(summary).toMatchObject({ branches: 1, dishes: 3, tables: 2 })
    expect(await misuji()).toEqual({ name: 'Lõi vai bò', price: 380_000 })
    expect(await count(`set_groups WHERE set_dish_id = 'sora'`)).toBe(2)
    expect(await count(`recipe_steps WHERE subject_id = 'misuji'`)).toBeGreaterThan(0)
    prototypeStep = await firstMisujiStep()
  })

  it('chạy lại không cờ: dừng trước khi ghi, sửa ở Office còn nguyên', async () => {
    // Office sửa tên + giá niêm yết (M1), chỗ ngồi (A3), tên chi nhánh (A10), thẻ công thức (M4)
    await pg.exec(`
      UPDATE dishes SET name_vi = 'Lõi vai bò Úc', base_price = 420000 WHERE id = 'misuji';
      UPDATE tables SET seat_max = 6 WHERE code = 'A4';
      UPDATE branches SET name = 'Tokyo Sora Cầu Giấy' WHERE id = 'cg';
      UPDATE recipe_steps SET text = 'Bước của bếp trưởng'
       WHERE subject_id = 'misuji' AND (phase, sort) = (
         SELECT phase, sort FROM recipe_steps WHERE subject_id = 'misuji'
          ORDER BY phase, sort LIMIT 1);
    `)
    // Prototype có thêm một món: từ chối thì món đó cũng không được chèn
    const dir = await fixture({
      'dishes.json': {
        dishes: [...DISHES, dish('karaage2', 'chien', 'Gà chiên sốt cay', 155_000)],
      },
    })

    const run = seed(db, { dir })
    await expect(run).rejects.toThrow(SeedRefused)
    await expect(run).rejects.toThrow(/1 chi nhánh, 6 trạm bếp, 3 nhóm thực đơn, 3 món,.* 2 bàn/)

    expect(await misuji()).toEqual({ name: 'Lõi vai bò Úc', price: 420_000 })
    expect(await a4Seats()).toBe(6)
    expect(await firstMisujiStep()).toBe('Bước của bếp trưởng')
    expect(await count(`branches WHERE name = 'Tokyo Sora Cầu Giấy'`)).toBe(1)
    expect(await count(`dishes WHERE id = 'karaage2'`)).toBe(0)
  })

  it('--ghi-de nạp đè theo prototype như trước — đường của máy dev', async () => {
    const dir = await fixture({
      'dishes.json': {
        dishes: [...DISHES, dish('karaage2', 'chien', 'Gà chiên sốt cay', 155_000)],
      },
    })
    await seed(db, { dir, overwrite: true })

    expect(await misuji()).toEqual({ name: 'Lõi vai bò', price: 380_000 })
    expect(await a4Seats()).toBe(4)
    expect(await firstMisujiStep()).toBe(prototypeStep)
    expect(await count(`branches WHERE name = 'Cầu Giấy'`)).toBe(1)
    expect(await count(`dishes WHERE id = 'karaage2'`)).toBe(1)
  })
})

describe('tham số dòng lệnh', () => {
  const SUPABASE = 'postgresql://postgres:pw@db.abcdefgh.supabase.co:5432/postgres'

  it('không cờ thì nhận mọi CSDL — chặn nằm ở bước đếm dữ liệu', () => {
    expect(parseSeedArgs([], SUPABASE)).toEqual({ overwrite: false })
  })

  it('--ghi-de chỉ nhận CSDL trên máy này', () => {
    expect(() => parseSeedArgs(['--ghi-de'], SUPABASE)).toThrow(
      /^db:seed --ghi-de chỉ chạy trên CSDL ở máy này .* db\.abcdefgh\.supabase\.co\. Nạp đè/,
    )
    expect(parseSeedArgs(['--ghi-de'], 'postgres://postgres:pw@127.0.0.1:5432/sora')).toEqual({
      overwrite: true,
    })
    expect(parseSeedArgs(['--ghi-de'], 'postgres://postgres:pw@localhost/sora')).toEqual({
      overwrite: true,
    })
  })

  it('bỏ qua `--` của pnpm, dừng ở tham số lạ', () => {
    expect(parseSeedArgs(['--', '--ghi-de'], 'postgres://localhost/sora')).toEqual({
      overwrite: true,
    })
    expect(() => parseSeedArgs(['--ghide'], 'postgres://localhost/sora')).toThrow(
      'không hiểu tham số --ghide',
    )
  })
})
