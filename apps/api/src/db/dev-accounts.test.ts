/**
 * Rào của db:dev-bootstrap: tài khoản, PIN và token thiết bị dev công khai trong
 * repo, nên chỉ được ghi vào CSDL nằm trên chính máy đang chạy.
 */
import { describe, expect, it } from 'vitest'
import { assertLocalDatabase } from './dev-accounts'

const messageOf = (url: string) => {
  try {
    assertLocalDatabase(url)
    return null
  } catch (err) {
    return err instanceof Error ? err.message : String(err)
  }
}

describe('db:dev-bootstrap chỉ chạy trên CSDL ở máy này', () => {
  it.each([
    'postgres://sora_app:pw@localhost:5432/sora',
    'postgres://postgres:pw@127.0.0.1:54329/postgres',
    'postgres://postgres:pw@[::1]:5432/sora',
    'postgresql:///sora?host=/var/run/postgresql',
  ])('cho chạy: %s', (url) => {
    expect(messageOf(url)).toBeNull()
  })

  it.each([
    // Hai dạng URL Supabase của DEPLOY.md và .env.example
    'postgres://postgres.abc:pw@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres',
    'postgres://postgres:pw@db.abc.supabase.co:5432/postgres',
    'postgres://postgres:pw@10.0.0.5:5432/sora',
    // `?host=` thắng tên máy trong URL — pg nối tới Supabase dù URL ghi localhost
    'postgres://postgres:pw@localhost:5432/sora?host=db.abc.supabase.co',
  ])('từ chối: %s', (url) => {
    expect(messageOf(url)).toMatch(/chỉ chạy trên CSDL ở máy này/)
  })

  it('báo tên máy đích nhưng không in mật khẩu trong URL', () => {
    const message = messageOf('postgres://postgres:bi-mat-that@db.abc.supabase.co:5432/postgres')
    expect(message).toContain('db.abc.supabase.co')
    expect(message).not.toContain('bi-mat-that')
  })
})
