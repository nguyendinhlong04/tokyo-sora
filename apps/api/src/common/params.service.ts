import { Inject, Injectable } from '@nestjs/common'
import { and, eq, isNull, or } from 'drizzle-orm'
import { DB } from './db.module'
import type { Db } from '../db/client'
import { parameterHistory, parameters } from '../db/schema'

/**
 * Trung tâm tham số A6 — engine đọc lúc chạy, sửa không cần triển khai lại.
 *
 * Cache in-process vì tham số đọc rất nhiều (mỗi lần tính tiền, mỗi lần dựng vé)
 * nhưng đổi rất ít. Invalidate bằng `reload()` khi có sự kiện `param.updated`.
 */
@Injectable()
export class ParamsService {
  /** key → (branchId | '*') → value */
  private cache = new Map<string, Map<string, unknown>>()
  private loaded = false

  constructor(@Inject(DB) private readonly db: Db) {}

  async reload(): Promise<void> {
    const rows = await this.db.select().from(parameters)
    const next = new Map<string, Map<string, unknown>>()
    for (const row of rows) {
      const scopes = next.get(row.key) ?? new Map<string, unknown>()
      scopes.set(row.branchId ?? '*', row.value)
      next.set(row.key, scopes)
    }
    this.cache = next
    this.loaded = true
  }

  private async ensureLoaded() {
    if (!this.loaded) await this.reload()
  }

  /** Giá trị của chi nhánh nếu có ghi đè, ngược lại lấy mặc định cấp chuỗi */
  async get<T>(key: string, branchId?: string | null): Promise<T | undefined> {
    await this.ensureLoaded()
    const scopes = this.cache.get(key)
    if (!scopes) return undefined
    const scoped = branchId ? scopes.get(branchId) : undefined
    return (scoped ?? scopes.get('*')) as T | undefined
  }

  async getNumber(key: string, fallback: number, branchId?: string | null): Promise<number> {
    const value = await this.get<unknown>(key, branchId)
    return typeof value === 'number' ? value : fallback
  }

  /** Đọc nhiều tham số một lượt — tránh chuỗi await rời rạc ở nơi gọi */
  async bundle<K extends string>(
    keys: Record<K, number>,
    branchId?: string | null,
  ): Promise<Record<K, number>> {
    await this.ensureLoaded()
    const out = {} as Record<K, number>
    for (const key of Object.keys(keys) as K[]) {
      out[key] = await this.getNumber(key, keys[key], branchId)
    }
    return out
  }

  /** Mọi tham số áp dụng cho một chi nhánh — nguồn cho config bundle và màn A6 */
  async allForBranch(branchId: string): Promise<Record<string, unknown>> {
    const rows = await this.db
      .select()
      .from(parameters)
      .where(or(isNull(parameters.branchId), eq(parameters.branchId, branchId)))
    const out: Record<string, unknown> = {}
    // Mặc định trước, ghi đè theo chi nhánh sau
    for (const row of rows.filter((r) => r.branchId === null)) out[row.key] = row.value
    for (const row of rows.filter((r) => r.branchId !== null)) out[row.key] = row.value
    return out
  }

  /** Đổi tham số: ghi giá trị mới + lịch sử append-only, rồi làm mới cache */
  async set(
    key: string,
    value: unknown,
    opts: { branchId?: string | null; changedBy?: number | null } = {},
  ): Promise<void> {
    const branchId = opts.branchId ?? null
    await this.db.transaction(async (tx) => {
      const [existing] = await tx
        .select()
        .from(parameters)
        .where(
          and(
            eq(parameters.key, key),
            branchId === null ? isNull(parameters.branchId) : eq(parameters.branchId, branchId),
          ),
        )

      if (existing) {
        await tx
          .update(parameters)
          .set({ value, updatedBy: opts.changedBy ?? null, updatedAt: new Date() })
          .where(
            and(
              eq(parameters.key, key),
              branchId === null ? isNull(parameters.branchId) : eq(parameters.branchId, branchId),
            ),
          )
      } else {
        await tx.insert(parameters).values({ key, branchId, value, updatedBy: opts.changedBy ?? null })
      }

      await tx.insert(parameterHistory).values({
        key,
        branchId,
        oldValue: existing?.value ?? null,
        newValue: value,
        changedBy: opts.changedBy ?? null,
      })
    })
    await this.reload()
  }
}
