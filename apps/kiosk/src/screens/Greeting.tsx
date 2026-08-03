import type { PunchResult } from '../api'

/**
 * Màn chào sau khi chấm — "Chào Hoa · Vào ca 15:02 · lịch 15:00" (§26 H10).
 *
 * Ba con số đứng cạnh nhau là có chủ ý: giờ vừa chấm, giờ theo lịch, và chênh
 * lệch giữa hai cái đó. Người đi muộn biết ngay tại chỗ mình muộn bao nhiêu, thay
 * vì biết vào cuối tháng khi bảng công đã chốt và không cãi được nữa.
 */
export function Greeting({ result, onDone }: { result: PunchResult; onDone: () => void }) {
  const at = new Date(result.at)
  const clock = at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })

  return (
    <main
      className="flex h-dvh flex-col items-center justify-center gap-6 bg-canvas px-10 text-center"
      onClick={onDone}
    >
      <span className="font-jp text-[length:var(--fs-d2)] leading-none text-accent-ink">空</span>

      <h1 className="text-[length:var(--fs-d3)] font-semibold text-ink-hi">
        {result.direction === 'in' ? `Chào ${result.fullName}` : `Tạm biệt ${result.fullName}`}
      </h1>

      <p className="font-mono text-[length:var(--fs-d1)] tabular-nums text-ink-hi">
        {result.direction === 'in' ? 'Vào ca' : 'Ra ca'} {clock}
      </p>

      {result.direction === 'in' ? <Punctuality at={at} scheduled={result.scheduledStartMinute} /> : null}

      {result.direction === 'out' ? (
        <p className="text-[length:var(--fs-t1)] text-ink-body">
          Hôm nay {Math.floor(result.workedMinutes / 60)} giờ {result.workedMinutes % 60} phút
        </p>
      ) : null}
    </main>
  )
}

/**
 * Muộn bao nhiêu so với ca đã xếp.
 *
 * Khoan dung 5 phút, ĐÚNG bằng `punctualityOf` của máy chủ — hai con số lệch nhau
 * thì màn này nói "đúng giờ" còn bảng lương trừ tiền, và người bị trừ có lý.
 */
function Punctuality({ at, scheduled }: { at: Date; scheduled: number | null }) {
  if (scheduled === null) {
    return (
      <p className="text-[length:var(--fs-t1)] text-ink-mute">
        Hôm nay bạn không có ca trong lịch — quản lý sẽ đối chiếu lại
      </p>
    )
  }

  const hh = String(Math.floor(scheduled / 60) % 24).padStart(2, '0')
  const mm = String(scheduled % 60).padStart(2, '0')
  // Máy đứng tại quán nên giờ máy chính là giờ treo tường của chi nhánh
  const late = at.getHours() * 60 + at.getMinutes() - scheduled

  return (
    <div className="flex flex-col items-center gap-2">
      <p className="text-[length:var(--fs-t1)] text-ink-mute">
        Lịch {hh}:{mm}
      </p>
      {late > 5 ? (
        <p className="text-[length:var(--fs-t1)] font-semibold text-warn">Muộn {late} phút</p>
      ) : (
        <p className="text-[length:var(--fs-t1)] text-ok">Đúng giờ</p>
      )}
    </div>
  )
}
