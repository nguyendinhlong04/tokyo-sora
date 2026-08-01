import { Button } from '@sora/ui'
import { useNavigate } from 'react-router'
import { useTableSession } from '../table-context'
import { useCallStaff } from './Shell'

/**
 * T1 Chào và xác nhận bàn.
 *
 * Bản thiết kế có ô "mấy người ăn?" vì giả định khách tự mở bàn. Ở đây bàn do
 * nhân viên mở ở P3 và số khách đã nhập từ lúc đó, nên màn này CHỈ xác nhận —
 * hỏi lại một câu đã có câu trả lời chỉ tạo cơ hội cho hai con số lệch nhau.
 */
export function Welcome() {
  const session = useTableSession()
  const navigate = useNavigate()
  const callStaff = useCallStaff()

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
          <p className="mt-3 text-[length:var(--fs-b2)] text-ink-body">
            {[session.table.area, `${session.guestCount} khách`].filter(Boolean).join(' · ')}
          </p>
          <p className="mt-3 text-[length:var(--fs-b2)] text-ember-2">
            {session.table.hasGrill
              ? 'Bàn có bếp than — món sống mang ra để bạn tự nướng.'
              : 'Bàn không có bếp — bếp nướng sẵn, món ra chậm hơn khoảng 8 phút.'}
          </p>
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
