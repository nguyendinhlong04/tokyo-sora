import { Button, SectionLabel, useToast } from '@sora/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { api } from '../api'
import { useTableSession } from '../table-context'
import { useCallStaff } from './Shell'

/**
 * T1 Chào và xác nhận bàn.
 *
 * Số khách do nhân viên nhập lúc mở bàn ở P3, nhưng người ngồi xuống mới biết
 * chắc bàn có mấy người — và con số này đi thẳng vào báo cáo doanh thu trên đầu
 * khách. Sửa ở đây gửi thẳng lên máy chủ, không đợi tới lúc gọi món.
 */
export function Welcome() {
  const session = useTableSession()
  const navigate = useNavigate()
  const callStaff = useCallStaff()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [guests, setGuests] = useState(session.guestCount)

  const save = useMutation({
    mutationFn: (next: number) => api.setGuestCount(session.id, next),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['session', session.id] }),
    onError: (err: Error, next) => {
      // Máy chủ từ chối (quá sức chứa bàn) thì trả con số về đúng cái đang có
      void next
      setGuests(session.guestCount)
      toast(err.message, 'danger')
    },
  })

  const change = (next: number) => {
    if (next < 1 || next > session.table.seatMax) return
    setGuests(next)
    save.mutate(next)
  }

  return (
    <main className="relative flex min-h-[calc(100dvh-3rem)] flex-col px-5 pb-6">
      <span className="pointer-events-none absolute top-16 right-2 font-jp text-[180px] leading-none text-ink-hi opacity-6">
        空
      </span>

      <div className="relative flex flex-1 flex-col justify-center pt-6">
        <div className="text-center">
          <p className="font-jp tracking-[0.3em] text-[length:var(--fs-t2)] text-accent">東京空</p>
          <p className="mt-2.5 font-display text-[length:var(--fs-d3)] font-light tracking-[0.06em] text-ink-hi">
            TOKYO SORA
          </p>
        </div>

        <div className="mt-11 rounded-md border border-accent/16 bg-surface-4 p-6">
          <p className="font-display text-[length:var(--fs-d3)] leading-none font-semibold text-ink-hi">
            Bàn {session.table.code}
          </p>
          {session.table.area ? (
            <p className="mt-3 text-[length:var(--fs-b2)] text-ink-body">{session.table.area}</p>
          ) : null}
          <p className="mt-3 text-[length:var(--fs-b2)] text-ember-2">
            {session.table.hasGrill
              ? 'Bàn có bếp than — món sống mang ra để bạn tự nướng.'
              : 'Bàn không có bếp — bếp nướng sẵn, món ra chậm hơn khoảng 8 phút.'}
          </p>
        </div>

        <div className="mt-8">
          <SectionLabel>Mấy người ăn?</SectionLabel>
          <div className="mt-3.5 flex h-16 items-center rounded-sm border border-line-3">
            <button
              type="button"
              aria-label="Bớt một khách"
              disabled={guests <= 1}
              onClick={() => change(guests - 1)}
              className="h-full w-16 text-[length:var(--fs-t1)] text-accent-ink disabled:text-ink-mute"
            >
              −
            </button>
            <span className="flex-1 text-center font-mono text-[length:var(--fs-t1)] text-ink-hi">
              {guests}
            </span>
            <button
              type="button"
              aria-label="Thêm một khách"
              disabled={guests >= session.table.seatMax}
              onClick={() => change(guests + 1)}
              className="h-full w-16 text-[length:var(--fs-t1)] text-accent-ink disabled:text-ink-mute"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* `flex-none`: máy màn ngắn thì phần chào bàn ở trên co lại, hai nút giữ
          nguyên chiều cao — vùng chạm không phải chỗ để lấy lại chỗ trống */}
      <div className="relative grid flex-none gap-2.5">
        <Button variant="primary" size="lg" block onClick={() => void navigate('/thuc-don')}>
          Bắt đầu gọi món
        </Button>
        <Button size="lg" block onClick={callStaff}>
          Gọi nhân viên
        </Button>
      </div>
    </main>
  )
}
