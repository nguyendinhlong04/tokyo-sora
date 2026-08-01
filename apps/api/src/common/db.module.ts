import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common'
import { Pool } from 'pg'
import { createDb, createPool, type Db } from '../db/client'

export const DB = Symbol('SORA_DB')
export const PG_POOL = Symbol('SORA_PG_POOL')

@Global()
@Module({
  providers: [
    { provide: PG_POOL, useFactory: () => createPool() },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: Pool) => createDb(pool) },
  ],
  exports: [DB, PG_POOL],
})
export class DbModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  async onApplicationShutdown() {
    await this.pool.end()
  }
}

export type { Db }
