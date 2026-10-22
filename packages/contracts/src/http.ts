/**
 * Hằng HTTP mà client và API cùng đọc.
 *
 * Để riêng, KHÔNG chung file với schema zod: `apiFetch` của mọi app import hằng
 * này, mà bundler chỉ bỏ được cả một file khi không ai dùng export nào của nó —
 * dùng một hằng là giữ luôn các lệnh dựng schema ở cấp module, kéo cả zod vào
 * mọi app dù không app nào parse gì (CLAUDE.md §8).
 */

/** Header idempotency — bắt buộc trên mọi POST/PATCH ghi từ client có outbox */
export const IDEMPOTENCY_HEADER = 'idempotency-key'
