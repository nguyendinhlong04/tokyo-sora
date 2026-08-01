import 'reflect-metadata'
import fastifyCookie from '@fastify/cookie'
import { Test } from '@nestjs/testing'
import { FastifyAdapter, type NestFastifyApplication } from '@nestjs/platform-fastify'
import { hash } from '@node-rs/argon2'
import { Pool } from 'pg'
import { AppModule } from '../app.module'
import { ZodExceptionFilter } from '../common/zod-exception.filter'
import { createDb } from '../db/client'
import { runMigrations } from '../db/migrate'
import * as s from '../db/schema'

/**
 * Dựng API thật trên CSDL test thật (Postgres riêng, không phải DB dev).
 * Cố ý KHÔNG mock tầng nào: cái cần chứng minh ở đây là các mảnh ghép nối đúng.
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
  await app.register(fastifyCookie)
  app.useGlobalFilters(new ZodExceptionFilter())
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
  // Xoá cả event trigger vì nó sống ngoài schema public
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
}

async function seedFixtures(db: ReturnType<typeof createDb>): Promise<Fixtures> {
  const branchId = 'cg'
  await db.insert(s.branches).values({ id: branchId, name: 'Cầu Giấy' })
  await db.insert(s.stations).values([
    { id: 'ST-02', name: 'Quầy sống', ticketPrefix: 'B', columns: 6 },
    { id: 'ST-06', name: 'Bếp nướng', ticketPrefix: 'A', columns: 4 },
  ])

  const pins: Record<number, string> = {}
  const make = async (code: string, name: string, role: string, pin: string) => {
    const [row] = await db
      .insert(s.staff)
      .values({ code, fullName: name, pinHash: await hash(pin) })
      .returning({ id: s.staff.id })
    await db.insert(s.staffRoles).values({ staffId: row!.id, roleCode: role, branchId })
    pins[row!.id] = pin
    return row!.id
  }

  return {
    branchId,
    cashierId: await make('TN01', 'Hoa', 'R2', '1101'),
    waiterId: await make('PV01', 'Minh', 'R1', '1102'),
    managerId: await make('QL01', 'Lan', 'R7', '1103'),
    chefId: await make('BE01', 'Đức', 'R4', '1104'),
    pins,
  }
}
