/**
 * Nhận diện lỗi ràng buộc của Postgres.
 *
 * Drizzle bọc lỗi gốc của `pg` vào `DrizzleQueryError`, nên tên ràng buộc KHÔNG
 * nằm trong thông điệp lỗi ở tầng ngoài — phải đi theo chuỗi `cause`. So chuỗi
 * bằng `String(err).includes(...)` trông thì chạy nhưng thực ra luôn trượt, và
 * hậu quả là người dùng nhận 500 thay vì lời giải thích.
 */
interface PgLikeError {
  code?: string
  constraint?: string
  cause?: unknown
}

function walkCauses(err: unknown, depth = 0): PgLikeError[] {
  if (!err || typeof err !== 'object' || depth > 5) return []
  const current = err as PgLikeError
  return [current, ...walkCauses(current.cause, depth + 1)]
}

/** Mã 23505 = unique_violation */
export function isUniqueViolation(err: unknown, constraint?: string): boolean {
  return walkCauses(err).some(
    (e) => e.code === '23505' && (!constraint || e.constraint === constraint),
  )
}

/** Mã 23514 = check_violation */
export function isCheckViolation(err: unknown, constraint?: string): boolean {
  return walkCauses(err).some(
    (e) => e.code === '23514' && (!constraint || e.constraint === constraint),
  )
}
