import { Button, useToast } from '@sora/ui'
import { useMutation } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type RequestKind } from '../api'
import { useTable } from '../table-context'
import { Sheet } from './Sheet'

const KINDS: { kind: RequestKind; label: string }[] = [
  { kind: 'phuc-vu', label: 'Gọi phục vụ' },
  { kind: 'them-than', label: 'Thêm than' },
  { kind: 'da-nuoc', label: 'Đá · nước' },
  { kind: 'tinh-tien', label: 'Xin tính tiền' },
  { kind: 'khac', label: 'Việc khác' },
]

/**
 * T9 Gọi nhân viên → hàng đợi P12 của POS.
 *
 * KHÔNG đi qua hàng đợi offline: gọi người mà lệnh nằm chờ có mạng thì khách cứ
 * ngồi đợi một cái chuông không kêu. Mất mạng thì nói thẳng là chưa gọi được.
 */
export function CallStaffSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { session } = useTable()
  const toast = useToast()
  const [sent, setSent] = useState<string | null>(null)

  const call = useMutation({
    mutationFn: (kind: RequestKind) => api.callStaff(session!.id, kind),
    onSuccess: (result) => setSent(result.label),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const close = () => {
    setSent(null)
    onClose()
  }

  return (
    <Sheet open={open} onClose={close}>
      {sent ? (
        <div className="px-5 pt-8 pb-7 text-center">
          <div className="mx-auto grid h-16 w-16 place-items-center rounded-pill border border-ok">
            <svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className="text-ok">
              <path d="M4 12.5 9.5 18 20 7" />
            </svg>
          </div>
          <p className="mt-6 text-[length:var(--fs-t1)] font-semibold text-ink-hi">
            Nhân viên đang tới
          </p>
          <p className="mt-2.5 text-[length:var(--fs-b1)] text-ink-body">{sent}</p>
          <Button block className="mt-7" onClick={() => setSent(null)}>
            Gọi việc khác
          </Button>
          <Button variant="ghost" block className="mt-2" onClick={close}>
            Đóng
          </Button>
        </div>
      ) : (
        <div className="px-4 pb-5">
          <p className="px-1 pt-4 text-[length:var(--fs-t1)] font-semibold text-ink-hi">Cần gì ạ?</p>
          <div className="mt-4 grid gap-2.5">
            {KINDS.map((item) => (
              <Button
                key={item.kind}
                size="lg"
                block
                className="justify-start"
                disabled={call.isPending || !session}
                onClick={() => call.mutate(item.kind)}
              >
                {item.label}
              </Button>
            ))}
          </div>
        </div>
      )}
    </Sheet>
  )
}
