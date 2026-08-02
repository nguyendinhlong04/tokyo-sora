'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ApiError } from '../lib/api'
import {
  confirmReservation,
  createHold,
  fetchAvailability,
  releaseHold,
  type Availability,
  type Reservation,
} from '../lib/reservations'
import { BRANCH_EXTRAS, SEAT_KINDS, SITE, type SeatKindId } from '../content/site'
import type { SiteBranch } from '../lib/site'

const DAY_NAMES = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
const HORIZON_DAYS = 14

interface Props {
  branches: SiteBranch[]
  initial: { branchId?: string; date?: string; guestCount?: number }
}

/**
 * W6 — Đặt bàn ba bước.
 *
 * Ba điều làm nên khác biệt với một form mù:
 *  1. Lưới khung giờ là sức chứa THẬT — khung kín thì mờ đi ngay, không để khách
 *     điền xong mới báo lỗi.
 *  2. Sang bước 3 là suất được giữ mềm và đồng hồ chạy; hết giờ thì trả suất về
 *     lưới và nói rõ, chứ không im lặng giữ mãi.
 *  3. Bấm Quay lại là nhả suất ngay, không bắt người sau đợi mười phút.
 */
export function BookingFlow({ branches, initial }: Props) {
  const [step, setStep] = useState(initial.branchId ? 2 : 1)
  const [branchId, setBranchId] = useState(initial.branchId ?? branches[0]?.id ?? '')
  const [date, setDate] = useState(initial.date ?? isoDate(0))
  const [guestCount, setGuestCount] = useState(initial.guestCount ?? 2)
  const [seatKind, setSeatKind] = useState<SeatKindId>('grill')
  const [minute, setMinute] = useState<number | null>(null)

  const [availability, setAvailability] = useState<Availability | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const [holdToken, setHoldToken] = useState<string | null>(null)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [note, setNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<Reservation | null>(null)

  const branch = branches.find((b) => b.id === branchId)
  const days = Array.from({ length: HORIZON_DAYS }, (_, i) => isoDate(i))
  const slots = availability?.slots ?? []
  const freeCount = slots.filter((s) => s.open).length
  const picked = slots.find((s) => s.minute === minute) ?? null

  // ---------------------------------------------------------- lưới khung giờ
  useEffect(() => {
    if (!branchId || step === 1 || done) return
    let cancelled = false
    setLoading(true)
    setError(null)
    fetchAvailability({ branchId, date, guestCount, seatKind })
      .then((next) => {
        if (cancelled) return
        setAvailability(next)
        // Suất đang chọn có thể vừa bị người khác lấy mất
        setMinute((current) =>
          current !== null && next.slots.some((s) => s.minute === current && s.open)
            ? current
            : null,
        )
      })
      .catch((err) => {
        if (cancelled) return
        setAvailability(null)
        setError(err instanceof ApiError ? err.message : 'Chưa xem được giờ trống lúc này')
      })
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [branchId, date, guestCount, seatKind, step, done])

  // ------------------------------------------------------------ đồng hồ giữ chỗ
  const dropHold = useCallback(() => {
    if (holdToken) releaseHold(holdToken)
    setHoldToken(null)
    setSecondsLeft(0)
  }, [holdToken])

  useEffect(() => {
    if (secondsLeft <= 0) return
    const timer = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000)
    return () => clearInterval(timer)
  }, [secondsLeft])

  // Hết giờ giữ: trả suất về lưới và nói thẳng, không để khách điền tiếp vô ích
  const expired = useRef(false)
  useEffect(() => {
    if (holdToken && secondsLeft === 0 && !expired.current && !done) {
      expired.current = true
      setHoldToken(null)
      setMinute(null)
      setStep(2)
      setError('Hết mười phút giữ chỗ — suất đã trả về lưới, bạn chọn lại giúp nhé.')
    }
  }, [holdToken, secondsLeft, done])

  // Rời trang giữa chừng cũng nhả suất
  useEffect(() => {
    if (!holdToken) return
    const handler = () => releaseHold(holdToken)
    window.addEventListener('pagehide', handler)
    return () => window.removeEventListener('pagehide', handler)
  }, [holdToken])

  // ----------------------------------------------------------------- hành động
  async function goToForm() {
    if (minute === null || !branchId) return
    setSaving(true)
    setError(null)
    try {
      const hold = await createHold({ branchId, date, guestCount, seatKind, minute })
      expired.current = false
      setHoldToken(hold.token)
      setSecondsLeft(hold.holdSeconds)
      setStep(3)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Không giữ được suất này')
      // Suất vừa bị lấy mất — nạp lại lưới để khách thấy trạng thái thật
      setMinute(null)
      setAvailability(null)
      setStep(2)
    } finally {
      setSaving(false)
    }
  }

  function backToSlots() {
    dropHold()
    expired.current = false
    setStep(2)
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (minute === null || !branchId) return
    setSaving(true)
    setError(null)
    try {
      const reservation = await confirmReservation({
        branchId,
        date,
        guestCount,
        seatKind,
        minute,
        name,
        phone,
        note: note.trim() || undefined,
        holdToken: holdToken ?? undefined,
      })
      setDone(reservation)
      setHoldToken(null)
      setSecondsLeft(0)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Chưa đặt được bàn, thử lại giúp bạn')
    } finally {
      setSaving(false)
    }
  }

  function reset() {
    setDone(null)
    setStep(1)
    setMinute(null)
    setName('')
    setPhone('')
    setNote('')
    setError(null)
  }

  // -------------------------------------------------------------- màn thành công
  if (done) {
    return (
      <DoneScreen
        reservation={done}
        summary={{
          branchName: branch?.name ?? '',
          date,
          slotLabel: picked?.label ?? '',
          guestCount,
          seatLabel: seatLabel(seatKind),
        }}
        onReset={reset}
      />
    )
  }

  const seatUnavailable = availability !== null && availability.capacity === 0

  return (
    <div className="mx-auto max-w-[1000px] px-5 pt-14 pb-20 lg:px-10 lg:pt-20 lg:pb-32">
      <div className="flex items-start justify-between gap-8">
        <div>
          <span className="font-jp text-[length:var(--fs-b1)] tracking-[0.3em] text-accent">
            御予約
          </span>
          <h1 className="mt-4 font-display text-[34px] font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
            Đặt bàn
          </h1>
        </div>
        {holdToken && secondsLeft > 0 ? (
          <div className="flex-none text-right">
            <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Đang giữ chỗ cho bạn
            </p>
            <p
              className="mt-2 font-mono text-[26px] lg:text-[length:var(--fs-d3)]"
              style={{
                color:
                  secondsLeft <= 60
                    ? 'var(--sora-danger)'
                    : secondsLeft <= 180
                      ? 'var(--sora-warn)'
                      : 'var(--sora-gold-300)',
              }}
            >
              {clock(secondsLeft)}
            </p>
          </div>
        ) : null}
      </div>

      <ol className="mt-10 flex items-center lg:mt-14">
        {['Chi nhánh', 'Ngày & giờ', 'Xác nhận'].map((label, index) => {
          const n = index + 1
          const state = n === step ? 'now' : n < step ? 'done' : 'next'
          return (
            <li key={label} className={`flex items-center ${n < 3 ? 'flex-1' : ''}`}>
              <span
                className={`grid size-9 flex-none place-items-center rounded-full border font-mono text-[length:var(--fs-b2)] ${
                  state === 'now'
                    ? 'border-accent bg-gold-900 text-gold-200'
                    : state === 'done'
                      ? 'border-accent text-accent-ink'
                      : 'border-line-3 text-ink-mute'
                }`}
              >
                {n}
              </span>
              <span
                className={`ml-3 hidden text-[length:var(--fs-b2)] lg:inline ${
                  state === 'next' ? 'text-ink-mute' : 'text-ink-hi'
                }`}
              >
                {label}
              </span>
              {n < 3 ? <span className="mx-4 h-px flex-1 bg-line-3" /> : null}
            </li>
          )
        })}
      </ol>

      {error ? (
        <p className="mt-8 rounded-md border border-warn bg-warn/8 px-5 py-4 text-[length:var(--fs-b1)] text-gold-200">
          {error}
        </p>
      ) : null}

      <div className="mt-10 lg:mt-16">
        {/* ------------------------------------------------ Bước 1: chi nhánh */}
        {step === 1 ? (
          <div>
            <h2 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Chọn chi nhánh</h2>
            <div className="mt-7 grid gap-5 lg:grid-cols-3">
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBranchId(b.id)
                    setMinute(null)
                    setStep(2)
                  }}
                  className={`rounded-md border p-6 text-left transition-colors hover:border-accent ${
                    b.id === branchId ? 'border-accent bg-surface-3' : 'border-line-3 bg-surface-2'
                  }`}
                >
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
                      {b.name}
                    </span>
                    <span className="font-jp text-[length:var(--fs-t1)] leading-none text-gold-900">
                      {BRANCH_EXTRAS[b.id]?.kanji}
                    </span>
                  </div>
                  <p className="mt-3 text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
                    {b.address}
                  </p>
                  <p className="mt-3.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
                    {b.openHours}
                  </p>
                  <p className="mt-2 text-[length:var(--fs-c1)] text-ink-mute">
                    {b.seats.total} bàn · {b.seats.grill} bàn có bếp
                  </p>
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {/* -------------------------------------------- Bước 2: ngày, giờ, chỗ */}
        {step === 2 ? (
          <div>
            <p className="mb-3.5 text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
              Chi nhánh
            </p>
            <div className="flex flex-wrap gap-2">
              {branches.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    setBranchId(b.id)
                    setMinute(null)
                  }}
                  className={`inline-flex h-11 items-center rounded-sm border px-4 text-[length:var(--fs-b2)] transition-colors ${
                    b.id === branchId
                      ? 'border-accent bg-gold-900 text-gold-200'
                      : 'border-line-3 text-ink-body hover:border-accent'
                  }`}
                >
                  {b.name}
                </button>
              ))}
            </div>

            <p className="mt-10 mb-3.5 text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
              Ngày
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {days.map((day) => {
                const d = new Date(`${day}T12:00:00`)
                const active = day === date
                return (
                  <button
                    key={day}
                    type="button"
                    onClick={() => {
                      setDate(day)
                      setMinute(null)
                    }}
                    className={`flex size-19 flex-none flex-col items-center justify-center gap-0.5 rounded-sm border transition-colors ${
                      active
                        ? 'border-accent bg-gold-900 text-gold-200'
                        : 'border-line-3 text-ink-body hover:border-accent'
                    }`}
                  >
                    <span className="text-[length:var(--fs-c2)] font-semibold tracking-[0.08em] uppercase opacity-70">
                      {DAY_NAMES[d.getDay()]}
                    </span>
                    <span className="font-mono text-[length:var(--fs-t2)]">{d.getDate()}</span>
                    <span className="text-[length:var(--fs-c2)] opacity-60">
                      Th{d.getMonth() + 1}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="mt-10 grid items-start gap-8 lg:grid-cols-[220px_1fr] lg:gap-12">
              <div>
                <p className="mb-3.5 text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
                  Số khách
                </p>
                <div className="flex h-14 w-50 items-center rounded-sm border border-line-3">
                  <button
                    type="button"
                    aria-label="Bớt một khách"
                    onClick={() => {
                      setGuestCount((g) => Math.max(1, g - 1))
                      setMinute(null)
                    }}
                    className="h-full w-14 text-[22px] text-accent-ink"
                  >
                    −
                  </button>
                  <span className="flex-1 text-center font-mono text-[22px] text-ink-hi">
                    {guestCount}
                  </span>
                  <button
                    type="button"
                    aria-label="Thêm một khách"
                    onClick={() => {
                      setGuestCount((g) => Math.min(10, g + 1))
                      setMinute(null)
                    }}
                    className="h-full w-14 text-[22px] text-accent-ink"
                  >
                    +
                  </button>
                </div>
                <p className="mt-3 text-[length:var(--fs-c1)] text-ink-mute">
                  Trên 10 khách,{' '}
                  {branch?.phone ? (
                    <a href={`tel:${branch.phone.replace(/\s/g, '')}`} className="text-accent-ink">
                      gọi giúp chúng tôi
                    </a>
                  ) : (
                    'gọi giúp chúng tôi'
                  )}
                  .
                </p>
              </div>

              <div>
                <p className="mb-3.5 text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
                  Kiểu chỗ
                </p>
                <div className="flex flex-wrap gap-2.5">
                  {SEAT_KINDS.map((seat) => (
                    <button
                      key={seat.id}
                      type="button"
                      onClick={() => {
                        setSeatKind(seat.id)
                        setMinute(null)
                      }}
                      className={`inline-flex h-13 items-center gap-2.5 rounded-pill border px-5.5 text-[length:var(--fs-b1)] transition-colors ${
                        seat.id === seatKind
                          ? 'border-accent bg-gold-900 text-gold-200'
                          : 'border-line-3 text-ink-body hover:border-accent'
                      }`}
                    >
                      {seat.fire ? (
                        <svg
                          width="15"
                          height="15"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="1.6"
                        >
                          <path d="M12 3c1.6 3.2.4 4.6-.8 6-1 1.2-1.6 2.3-1.6 3.7a2.4 2.4 0 0 0 4.8 0c0-.9-.3-1.6-.7-2.2 1.9 1 3.3 2.7 3.3 5A5 5 0 0 1 7 15.5C7 10 12 9 12 3Z" />
                        </svg>
                      ) : null}
                      {seat.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-12 border-t border-accent/16 pt-9">
              <div className="flex flex-wrap items-baseline justify-between gap-4">
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
                  Giờ còn trống · {freeCount} khung
                </p>
                <div className="flex items-center gap-5">
                  {[
                    { label: 'Còn bàn', className: 'border-accent' },
                    { label: 'Kín', className: 'border-line-1 bg-surface-4' },
                  ].map((legend) => (
                    <span
                      key={legend.label}
                      className="inline-flex items-center gap-2 text-[length:var(--fs-c1)] text-ink-mute"
                    >
                      <span className={`size-3 rounded-[2px] border ${legend.className}`} />
                      {legend.label}
                    </span>
                  ))}
                </div>
              </div>

              {loading ? (
                <div className="mt-6 grid grid-cols-3 gap-3 lg:grid-cols-7">
                  {Array.from({ length: 14 }, (_, i) => (
                    <div
                      key={i}
                      className="h-14 animate-[sora-pulse_1.6s_ease-in-out_infinite] rounded-sm bg-surface-4"
                    />
                  ))}
                </div>
              ) : seatUnavailable ? (
                <div className="mt-6 rounded-md border border-warn bg-warn/8 p-8">
                  <p className="text-[length:var(--fs-b1)] font-medium text-ink-hi">
                    {seatLabel(seatKind)} ở {branch?.name} không có chỗ nào đủ cho {guestCount}{' '}
                    khách.
                  </p>
                  <p className="mt-2.5 text-[length:var(--fs-b1)] text-ink-body">
                    Đổi sang kiểu chỗ khác, hoặc gọi để chúng tôi ghép bàn giúp bạn.
                  </p>
                </div>
              ) : freeCount === 0 ? (
                <div className="mt-6 rounded-md border border-warn bg-warn/8 p-8">
                  <p className="text-[length:var(--fs-b1)] font-medium text-ink-hi">
                    Ngày này đã kín chỗ với {guestCount} khách.
                  </p>
                  <p className="mt-2.5 text-[length:var(--fs-b1)] text-ink-body">
                    Thử ngày khác, hoặc đổi sang bàn thường.
                  </p>
                </div>
              ) : (
                <div className="mt-6 grid grid-cols-3 gap-3 lg:grid-cols-7">
                  {slots.map((slot) => {
                    const active = slot.minute === minute
                    return (
                      <button
                        key={slot.minute}
                        type="button"
                        disabled={!slot.open}
                        onClick={() => setMinute(slot.minute)}
                        className={`flex h-14 flex-col items-center justify-center rounded-sm border font-mono text-[17px] transition-colors ${
                          active
                            ? 'border-accent bg-gold-900 text-gold-200'
                            : slot.open
                              ? 'border-accent/45 text-ink-hi hover:border-accent'
                              : 'cursor-not-allowed border-line-1 bg-surface-4 text-line-4'
                        }`}
                      >
                        {slot.label}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="mt-12 flex gap-3">
              <button
                type="button"
                onClick={() => setStep(1)}
                className="h-14 rounded-sm border border-line-3 px-7 text-[length:var(--fs-b1)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi"
              >
                Quay lại
              </button>
              <button
                type="button"
                disabled={minute === null || saving}
                onClick={goToForm}
                className="h-14 rounded-sm bg-accent-strong px-8 text-[length:var(--fs-b1)] font-semibold text-on-accent transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:bg-surface-4 disabled:text-line-4"
              >
                {picked ? `Tiếp tục · ${picked.label}` : 'Chọn một giờ trống'}
              </button>
            </div>
          </div>
        ) : null}

        {/* ---------------------------------------------- Bước 3: thông tin */}
        {step === 3 ? (
          <div className="grid items-start gap-10 lg:grid-cols-[1fr_360px] lg:gap-16">
            <form onSubmit={submit}>
              <h2 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">
                Thông tin của bạn
              </h2>
              <div className="mt-8 grid gap-6">
                <label className="block">
                  <span className="mb-2.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                    Tên người đặt
                  </span>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Nguyễn Minh"
                    className="h-14 w-full rounded-sm border border-line-3 bg-surface-2 px-4 text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-2.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                    Số điện thoại
                  </span>
                  <input
                    type="tel"
                    required
                    inputMode="tel"
                    pattern="[\d\s+.()-]{8,20}"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    placeholder="09xx xxx xxx"
                    className="h-14 w-full rounded-sm border border-line-3 bg-surface-2 px-4 font-mono text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute focus:border-accent focus:outline-none"
                  />
                </label>
                <label className="block">
                  <span className="mb-2.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
                    Ghi chú{' '}
                    <span className="font-normal tracking-normal normal-case">(tuỳ chọn)</span>
                  </span>
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Sinh nhật, dị ứng, cần ghế em bé…"
                    className="w-full resize-y rounded-sm border border-line-3 bg-surface-2 px-4 py-3.5 text-[length:var(--fs-b1)] leading-relaxed text-ink-hi placeholder:text-ink-mute focus:border-accent focus:outline-none"
                  />
                </label>
              </div>
              <div className="mt-10 flex gap-3">
                <button
                  type="button"
                  onClick={backToSlots}
                  className="h-14 rounded-sm border border-line-3 px-7 text-[length:var(--fs-b1)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi"
                >
                  Quay lại
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="h-14 rounded-sm bg-accent-strong px-8 text-[length:var(--fs-b1)] font-semibold text-on-accent transition-colors hover:bg-accent disabled:bg-surface-4 disabled:text-line-4"
                >
                  {saving ? 'Đang giữ bàn…' : 'Xác nhận đặt bàn'}
                </button>
              </div>
            </form>

            <aside className="rounded-md border border-accent/16 bg-surface-2 p-7">
              <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.16em] text-ink-mute uppercase">
                Tóm tắt
              </p>
              <dl className="mt-5 grid gap-4 text-[length:var(--fs-b1)]">
                <SummaryRow label="Chi nhánh" value={`Tokyo Sora — ${branch?.name ?? ''}`} />
                <SummaryRow label="Ngày" value={longDate(date)} />
                <SummaryRow label="Giờ" value={picked?.label ?? '—'} mono />
                <SummaryRow label="Số khách" value={String(guestCount)} mono />
                <SummaryRow label="Kiểu chỗ" value={seatLabel(seatKind)} />
              </dl>
              <p className="mt-6 border-t border-line-1 pt-5 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                Chúng tôi giữ bàn {availability?.tableHoldMinutes ?? 15} phút sau giờ hẹn. Đến muộn
                hơn, nhắn giúp chúng tôi.
              </p>
            </aside>
          </div>
        ) : null}
      </div>
    </div>
  )
}

// ------------------------------------------------------------------ màn xong

function DoneScreen({
  reservation,
  summary,
  onReset,
}: {
  reservation: Reservation
  summary: {
    branchName: string
    date: string
    slotLabel: string
    guestCount: number
    seatLabel: string
  }
  onReset: () => void
}) {
  const manual = reservation.status === 'pending'

  return (
    <div className="mx-auto max-w-[1000px] animate-[sora-fade_0.4s_ease-out_both] px-5 pt-16 pb-24 lg:px-10 lg:pt-32 lg:pb-40">
      <div className="max-w-[560px]">
        <div className="grid size-16 place-items-center rounded-full border border-ok">
          <svg
            width="26"
            height="26"
            viewBox="0 0 24 24"
            fill="none"
            stroke="var(--sora-ok)"
            strokeWidth="1.8"
            strokeLinecap="round"
          >
            <path d="M4 12.5 9.5 18 20 7" />
          </svg>
        </div>

        {manual ? (
          <span className="mt-7 inline-flex h-7 items-center rounded-pill border border-warn px-3 text-[length:var(--fs-c1)] font-medium text-warn">
            Chờ nhà hàng xác nhận
          </span>
        ) : null}

        <h1 className="mt-7 font-display text-[34px] leading-tight font-light text-ink-hi lg:text-[length:var(--fs-d2)]">
          {manual ? 'Đã nhận yêu cầu đặt bàn.' : 'Đã giữ bàn cho bạn.'}
        </h1>
        <p className="mt-6 font-mono text-[length:var(--fs-t1)] tracking-[0.08em] text-accent-ink">
          {reservation.displayCode}
        </p>

        <div className="mt-10 rounded-md border border-accent/16 bg-surface-2 p-7">
          <dl className="grid gap-4 text-[length:var(--fs-b1)]">
            <SummaryRow label="Chi nhánh" value={`Tokyo Sora — ${summary.branchName}`} />
            <SummaryRow
              label="Ngày & giờ"
              value={`${longDate(summary.date)} · ${summary.slotLabel}`}
              mono
            />
            <SummaryRow label="Số khách" value={String(summary.guestCount)} mono />
            <SummaryRow label="Kiểu chỗ" value={summary.seatLabel} />
          </dl>
        </div>

        <div className="mt-9 flex flex-col gap-3">
          {/* Ghép hội thoại Messenger với đặt chỗ bằng ref — bot xác nhận và nhắc
              hẹn 24h/2h trước giờ (§30.3) */}
          <a
            href={`https://m.me/${SITE.messengerPage}?ref=DATBAN_${reservation.displayCode}`}
            target="_blank"
            rel="noreferrer"
            className="flex h-14 items-center justify-center gap-3 rounded-sm bg-accent-strong text-[length:var(--fs-b1)] font-semibold text-on-accent transition-colors hover:bg-accent"
          >
            <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 2C6.3 2 2 6.2 2 11.4c0 2.9 1.4 5.5 3.6 7.2v3.1l3.2-1.7c.9.2 1.9.4 3 .4 5.7 0 10-4.2 10-9.4C21.8 6.2 17.6 2 12 2Zm1 12.4-2.4-2.6-4.6 2.6 5-5.4 2.5 2.5 4.4-2.5-4.9 5.4Z" />
            </svg>
            Nhận xác nhận &amp; nhắc hẹn qua Messenger
          </a>
          <a
            href={icsHref(reservation, summary)}
            download={`tokyo-sora-${reservation.displayCode}.ics`}
            className="flex h-14 items-center justify-center rounded-sm border border-line-3 text-[length:var(--fs-b1)] text-ink-body transition-colors hover:border-accent hover:text-ink-hi"
          >
            Thêm vào lịch
          </a>
          <button
            type="button"
            onClick={onReset}
            className="h-11 text-left text-[length:var(--fs-b2)] text-ink-mute transition-colors hover:text-accent-ink"
          >
            Đặt thêm một bàn nữa
          </button>
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-mute">{label}</dt>
      <dd className={`m-0 text-right text-ink-hi ${mono ? 'font-mono' : ''}`}>{value}</dd>
    </div>
  )
}

// -------------------------------------------------------------------- tiện ích

function isoDate(offsetDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + offsetDays)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
    d.getDate(),
  ).padStart(2, '0')}`
}

function longDate(iso: string): string {
  const d = new Date(`${iso}T12:00:00`)
  return `${DAY_NAMES[d.getDay()]}, ${d.getDate()}/${d.getMonth() + 1}`
}

function clock(seconds: number): string {
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
}

function seatLabel(id: SeatKindId): string {
  return SEAT_KINDS.find((s) => s.id === id)?.label ?? id
}

/** Thẻ lịch tải thẳng từ trình duyệt — không cần dịch vụ ngoài nào */
function icsHref(
  reservation: Reservation,
  summary: { branchName: string; guestCount: number },
): string {
  const start = new Date(reservation.slotAt)
  const end = new Date(start.getTime() + 120 * 60_000)
  const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Tokyo Sora//Dat ban//VI',
    'BEGIN:VEVENT',
    `UID:${reservation.displayCode}@${SITE.domain}`,
    `DTSTAMP:${stamp(new Date(reservation.slotAt))}`,
    `DTSTART:${stamp(start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:Tokyo Sora ${summary.branchName} · ${summary.guestCount} khách`,
    `DESCRIPTION:Mã đặt chỗ ${reservation.displayCode}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `data:text/calendar;charset=utf-8,${encodeURIComponent(lines.join('\r\n'))}`
}
