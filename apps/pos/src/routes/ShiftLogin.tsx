import { ApiError } from '@sora/core'
import { Button, Card, PinPad, SectionLabel } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api, type StaffOption } from '../api'
import { useSession } from '../session-context'

/**
 * P1 Đăng nhập ca.
 *
 * Hai bước: chọn người rồi nhập PIN. Cố tình không cho gõ tên — nhân viên đang
 * vội, chạm một cái vào ô có sẵn nhanh hơn hẳn gõ.
 */
export function ShiftLogin() {
  const { branchId, signIn } = useSession()
  const navigate = useNavigate()
  const [picked, setPicked] = useState<StaffOption | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const staffQuery = useQuery({
    queryKey: ['staff', branchId],
    queryFn: () => api.staffList(branchId!),
    enabled: Boolean(branchId),
  })

  const submit = async (pin: string) => {
    if (!picked || !branchId) return
    setBusy(true)
    setError(null)
    try {
      const result = await api.login({ branchId, staffId: picked.id, pin })
      signIn(result.staff)
      void navigate('/floor')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không đăng nhập được')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-canvas p-8">
      <Card className="w-full max-w-2xl p-8">
        <div className="mb-8 flex flex-col items-center gap-1">
          <span className="font-jp text-accent-ink">東京空</span>
          <h1 className="font-display text-[length:var(--fs-d3)] font-semibold text-ink-hi">
            Sora POS
          </h1>
        </div>

        {!picked ? (
          <div className="flex flex-col gap-4">
            <SectionLabel>Chọn nhân viên vào ca</SectionLabel>
            {staffQuery.isPending ? (
              <p className="text-ink-mute">Đang tải danh sách…</p>
            ) : staffQuery.isError ? (
              <p className="text-danger">
                Không tải được danh sách nhân viên. Kiểm tra máy đã ghép với chi nhánh chưa.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {staffQuery.data?.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    onClick={() => setPicked(person)}
                    className="flex min-h-[88px] flex-col justify-center gap-1 rounded-md border border-line-2 bg-surface-3 p-3 hover:bg-surface-4"
                  >
                    <span className="text-[length:var(--fs-b1)] font-semibold text-ink-hi">
                      {person.fullName}
                    </span>
                    <span className="font-mono text-[length:var(--fs-c2)] text-ink-mute">
                      {person.roles.join(' · ')}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-col items-center gap-6">
            <SectionLabel>Nhập PIN của {picked.fullName}</SectionLabel>
            <PinPad onComplete={submit} disabled={busy} error={error} />
            <Button
              variant="ghost"
              onClick={() => {
                setPicked(null)
                setError(null)
              }}
            >
              Chọn người khác
            </Button>
          </div>
        )}
      </Card>
    </main>
  )
}
