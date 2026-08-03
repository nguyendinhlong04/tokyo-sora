'use client'

import { useCallback, useEffect, useState } from 'react'
import { SEAT_KINDS, type SeatKindId } from '../../../../../content/site'
import {
  fetchMyReservation,
  reconfirmReservation,
  type MyReservation,
} from '../../../../../lib/reservations'

const DAY_NAMES = ['Chủ nhật', 'Thứ hai', 'Thứ ba', 'Thứ tư', 'Thứ năm', 'Thứ sáu', 'Thứ bảy']

/**
 * Màn khách bấm "một chạm" của R4.
 *
 * Lời nhắc 24h/2h dẫn về đây. Nên trang này phải trả lời đúng ba câu trong một
 * màn hình điện thoại: đặt lúc mấy giờ, còn hiệu lực không, và tôi xác nhận ở
 * đâu. Không có form, không có đăng nhập — chìa nằm trong đường dẫn.
 */
export function ConfirmReservation({ token }: { token: string }) {
  const [row, setRow] = useState<MyReservation | null>(null)
  const [notFound, setNotFound] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      setRow(await fetchMyReservation(token))
    } catch {
      setNotFound(true)
    }
  }, [token])

  useEffect(() => {
    void load()
  }, [load])

  const confirm = async () => {
    setSending(true)
    setError(null)
    try {
      setRow(await reconfirmReservation(token))
    } catch {
      setError('Chưa gửi được xác nhận. Gọi thẳng cho chi nhánh sẽ chắc hơn.')
    } finally {
      setSending(false)
    }
  }

  if (notFound) {
    return (
      <main className="mx-auto max-w-2xl px-5 pt-16 pb-24 text-center">
        <span className="font-jp text-[56px] leading-none text-gold-900">空</span>
        <p className="mt-6 text-[length:var(--fs-t2)] font-medium text-ink-hi">
          Liên kết này không mở đặt chỗ nào.
        </p>
        <p className="mt-3 text-[length:var(--fs-b1)] text-ink-body">
          Kiểm tra lại đường dẫn trong tin nhắn, hoặc{' '}
          <a href="/dat-ban" className="text-accent-ink underline underline-offset-4">
            đặt bàn lại
          </a>
          .
        </p>
      </main>
    )
  }

  if (!row) {
    return <main className="mx-auto max-w-2xl px-5 pt-16 pb-24 text-ink-mute">Đang mở…</main>
  }

  const closed = row.status === 'cancelled' || row.status === 'no_show'
  const done = row.status === 'seated' || row.status === 'done'

  return (
    <main className="mx-auto max-w-2xl animate-[sora-fade_0.4s_ease-out_both] px-5 pt-14 pb-24 lg:pt-24">
      <p className="text-[length:var(--fs-c1)] tracking-[0.18em] text-ink-mute uppercase">
        Đặt chỗ của bạn
      </p>
      <p className="mt-4 font-mono text-[length:var(--fs-t1)] tracking-[0.08em] text-accent-ink">
        {row.displayCode}
      </p>

      <h1 className="mt-6 font-display text-[30px] leading-tight font-light text-ink-hi lg:text-[38px]">
        {closed
          ? 'Suất này đã đóng.'
          : done
            ? 'Cảm ơn bạn đã tới.'
            : `${row.customerName}, hẹn gặp lúc ${hhmm(row.slotAt)}.`}
      </h1>

      <div className="mt-9 rounded-md border border-accent/16 bg-surface-2 p-6">
        <dl className="grid gap-4 text-[length:var(--fs-b1)]">
          <Row label="Chi nhánh" value={`Tokyo Sora — ${row.branchName}`} />
          {row.branchAddress ? <Row label="Địa chỉ" value={row.branchAddress} /> : null}
          <Row label="Ngày & giờ" value={`${longDate(row.slotAt)} · ${hhmm(row.slotAt)}`} mono />
          <Row label="Số khách" value={String(row.guestCount)} mono />
          <Row label="Kiểu chỗ" value={seatLabel(row.seatKind)} />
          {row.note ? <Row label="Ghi chú" value={row.note} /> : null}
        </dl>
      </div>

      {row.status === 'pending' ? (
        <p className="mt-6 inline-flex h-8 items-center rounded-pill border border-warn px-4 text-[length:var(--fs-c1)] font-medium text-warn">
          Nhà hàng đang xác nhận suất này
        </p>
      ) : null}

      {closed ? (
        <p className="mt-8 text-[length:var(--fs-b1)] leading-relaxed text-ink-body">
          Nếu bạn vẫn muốn tới, nhờ bạn{' '}
          <a href="/dat-ban" className="text-accent-ink underline underline-offset-4">
            đặt lại một suất mới
          </a>
          {row.branchPhone ? ' hoặc gọi thẳng chi nhánh.' : '.'}
        </p>
      ) : done ? null : (
        <div className="mt-9 flex flex-col gap-3">
          {row.guestConfirmedAt ? (
            <div className="flex h-14 items-center justify-center gap-3 rounded-sm border border-ok text-[length:var(--fs-b1)] text-ink-hi">
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="var(--sora-ok)"
                strokeWidth="1.8"
                strokeLinecap="round"
              >
                <path d="M4 12.5 9.5 18 20 7" />
              </svg>
              Đã nhận xác nhận lúc {hhmm(row.guestConfirmedAt)}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => void confirm()}
              disabled={sending}
              className="flex h-14 items-center justify-center rounded-sm bg-accent-strong text-[length:var(--fs-b1)] font-semibold text-on-accent transition-colors hover:bg-accent disabled:opacity-60"
            >
              {sending ? 'Đang gửi…' : 'Tôi sẽ đến đúng giờ'}
            </button>
          )}

          {/* Đổi giờ hay huỷ thì gọi — một cú bấm huỷ nhầm là một bàn trống cả tối */}
          {row.branchPhone ? (
            <a
              href={`tel:${row.branchPhone.replace(/\s/g, '')}`}
              className="flex h-14 items-center justify-center rounded-sm border border-line-3 text-[length:var(--fs-b1)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi"
            >
              Đổi giờ hoặc huỷ — gọi {row.branchPhone}
            </a>
          ) : null}

          <p className="mt-1 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Chúng tôi giữ bàn {row.tableHoldMinutes} phút sau giờ hẹn. Tới muộn hơn thì nhờ bạn gọi
            trước để bàn không bị nhả.
          </p>
        </div>
      )}

      {error ? <p className="mt-5 text-[length:var(--fs-b2)] text-danger">{error}</p> : null}
    </main>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-mute">{label}</dt>
      <dd className={`m-0 text-right text-ink-hi ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

function hhmm(iso: string): string {
  return new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
}

function longDate(iso: string): string {
  const d = new Date(iso)
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`
}

function seatLabel(id: SeatKindId): string {
  return SEAT_KINDS.find((s) => s.id === id)?.label ?? id
}
