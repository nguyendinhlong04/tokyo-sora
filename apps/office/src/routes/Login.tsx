import { ApiError } from '@sora/core'
import { Button } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import type { Role } from '@sora/contracts'
import { api } from '../api'
import { useSession } from '../session-context'

/**
 * Cửa vào Sora Office.
 *
 * Email và mật khẩu, KHÔNG phải PIN: Office chạy trên máy tính của quản lý và kế
 * toán, không có thiết bị nào của chi nhánh để ghép. Chọn chi nhánh ngay tại đây
 * vì phiên mở đúng một chi nhánh — vai trò cấp chuỗi vẫn vào được cả ba.
 */
export function Login() {
  const { signIn } = useSession()
  const [branchId, setBranchId] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const branches = useQuery({ queryKey: ['public-branches'], queryFn: api.publicBranches })

  const branchOptions = branches.data ?? []
  const chosen = branchId || branchOptions[0]?.id || ''

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const result = await api.officeLogin({ branchId: chosen, email, password })
      signIn(chosen, {
        fullName: result.staff.fullName ?? email,
        roles: (result.staff.roles ?? []) as Role[],
      })
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đăng nhập được')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-canvas px-6">
      <form
        onSubmit={submit}
        className="w-full max-w-[420px] rounded-md border border-line-1 bg-surface-1 p-8 shadow-sm"
      >
        <div className="flex items-baseline gap-2.5">
          <span className="font-jp text-[length:var(--fs-b2)] text-accent">東京空</span>
          <span className="text-[length:var(--fs-c1)] font-semibold tracking-[0.16em] text-ink-hi">
            TOKYO SORA
          </span>
        </div>
        <h1 className="mt-5 text-[length:var(--fs-t1)] font-semibold text-ink-hi">Sora Office</h1>
        <p className="mt-2 text-[length:var(--fs-b2)] text-ink-mute">
          Quản trị, kho, nhân sự và tài chính của chuỗi.
        </p>

        <label className="mt-7 block">
          <span className="mb-2 block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Chi nhánh
          </span>
          <select
            value={chosen}
            onChange={(e) => setBranchId(e.target.value)}
            className="h-11 w-full rounded-sm border border-line-1 bg-surface-2 px-3 text-[length:var(--fs-b2)] text-ink-hi"
          >
            {branchOptions.map((branch) => (
              <option key={branch.id} value={branch.id}>
                {branch.name}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Email
          </span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="ten@tokyosora.vn"
            className="h-11 w-full rounded-sm border border-line-1 bg-surface-2 px-3 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </label>

        <label className="mt-4 block">
          <span className="mb-2 block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
            Mật khẩu
          </span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="h-11 w-full rounded-sm border border-line-1 bg-surface-2 px-3 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </label>

        {error ? (
          <p className="mt-4 rounded-sm border border-danger px-3 py-2 text-[length:var(--fs-b2)] text-danger">
            {error}
          </p>
        ) : null}

        <Button
          type="submit"
          variant="primary"
          block
          className="mt-6"
          disabled={busy || !chosen || email.length === 0 || password.length === 0}
        >
          {busy ? 'Đang vào…' : 'Vào Office'}
        </Button>
      </form>
    </main>
  )
}
