import { ApiError, getDeviceToken } from '@sora/core'
import { Button, Card, PinPad, SectionLabel } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
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
  /**
   * Máy chưa ghép thì màn này không có gì để hiện — lưới nhân viên lấy theo chi
   * nhánh, mà chi nhánh do việc ghép máy quyết định. Trước đây nó dừng ở một
   * dòng báo lỗi không lối thoát; giờ đưa thẳng sang màn ghép.
   */
  const chuaGhep = getDeviceToken() === null
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

  if (chuaGhep) return <Navigate to="/ghep-may" replace />

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
              /* Token còn trong máy nhưng máy chủ không nhận — thường là đã bị
                 thu hồi từ xa ở A4. Không có nút này thì máy kẹt vĩnh viễn. */
              <div className="flex flex-col items-start gap-3">
                <p className="text-danger">
                  Máy này chưa ghép với chi nhánh nào, hoặc đã bị thu hồi từ xa.
                </p>
                <Button onClick={() => void navigate('/ghep-may')}>Ghép lại máy</Button>
              </div>
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
