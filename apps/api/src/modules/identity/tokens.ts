import { createHash, randomBytes, randomInt, timingSafeEqual } from 'node:crypto'

/**
 * Token đục (device, phiên nhân viên, phiên bàn) là chuỗi ngẫu nhiên entropy cao
 * nên băm SHA-256 là đủ — không dùng argon2 ở đây vì không có gì để brute-force
 * và mỗi request đều phải băm một lần.
 *
 * PIN thì NGƯỢC LẠI: entropy thấp (4–6 số) nên bắt buộc argon2id, xem pin.ts.
 */
export function newToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url')
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function tokensMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  return ba.length === bb.length && timingSafeEqual(ba, bb)
}

/** Mã ghép thiết bị 6 số (K1, A4) */
export function newPairingCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0')
}
