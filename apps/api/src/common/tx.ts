import type { Db } from '../db/client'

/**
 * Handle transaction của Drizzle. Mọi thao tác ghi nghiệp vụ + outbox phải dùng
 * chung MỘT handle này để hai thứ nằm trong cùng transaction — đó là điều làm cho
 * vé bếp không thể mất khi API chết giữa chừng.
 */
export type Tx = Parameters<Parameters<Db['transaction']>[0]>[0]

/** Nơi nào đọc/ghi được cả ngoài lẫn trong transaction thì nhận kiểu này */
export type DbOrTx = Db | Tx
