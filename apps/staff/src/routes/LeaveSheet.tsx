import { ApiError } from '@sora/core'
import { Button, Modal, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type LeaveKind, type Profile } from '../api'
import { todayIso } from '../time'

const KINDS: { id: LeaveKind; label: string }[] = [
  { id: 'nghi-phep', label: 'Nghỉ phép' },
  { id: 'nghi-om', label: 'Nghỉ ốm' },
  { id: 'nghi-khong-luong', label: 'Nghỉ không lương' },
  { id: 'doi-ca', label: 'Đổi ca' },
]

/**
 * Nút "gửi yêu cầu" của H8 — đổ thẳng vào hàng đợi duyệt H5.
 *
 * Đổi ca bắt buộc chọn người nhận: quản lý duyệt CẢ CẶP trong một lần bấm, nên
 * một yêu cầu thiếu người nhận là một yêu cầu không duyệt được.
 */
export function LeaveSheet({
  open,
  me,
  onClose,
}: {
  open: boolean
  me: Profile
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [kind, setKind] = useState<LeaveKind>('nghi-phep')
  const [fromDate, setFromDate] = useState(todayIso())
  const [toDate, setToDate] = useState(todayIso())
  const [counterpartId, setCounterpartId] = useState<number | null>(null)
  const [reason, setReason] = useState('')

  const colleagues = useQuery({
    queryKey: ['colleagues'],
    queryFn: api.colleagues,
    enabled: open && kind === 'doi-ca',
  })

  const send = useMutation({
    mutationFn: () =>
      api.sendLeave({
        branchId: me.branchId,
        employeeId: me.employeeId,
        kind,
        fromDate,
        toDate: kind === 'doi-ca' ? fromDate : toDate,
        counterpartId: kind === 'doi-ca' ? counterpartId : null,
        reason: reason.trim(),
      }),
    onSuccess: () => {
      toast('Đã gửi — quản lý sẽ duyệt', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['leaves'] })
      setReason('')
      onClose()
    },
    onError: (err: Error) =>
      toast(err instanceof ApiError ? err.message : 'Không gửi được', 'danger'),
  })

  const ready =
    reason.trim().length > 0 &&
    (kind !== 'doi-ca' || counterpartId !== null) &&
    (kind === 'doi-ca' || toDate >= fromDate)

  return (
    <Modal
      open={open}
      title="Gửi yêu cầu"
      onClose={onClose}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="primary" disabled={!ready || send.isPending} onClick={() => send.mutate()}>
            {send.isPending ? 'Đang gửi…' : 'Gửi'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="grid grid-cols-2 gap-2">
          {KINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setKind(item.id)}
              className={[
                'flex h-[var(--hit-target)] items-center justify-center rounded-sm border text-[length:var(--fs-b2)]',
                kind === item.id
                  ? 'border-accent bg-surface-3 text-accent-ink'
                  : 'border-line-2 text-ink-body',
              ].join(' ')}
            >
              {item.label}
            </button>
          ))}
        </div>

        <Field label={kind === 'doi-ca' ? 'Ngày ca cần đổi' : 'Từ ngày'}>
          <DateInput
            value={fromDate}
            onChange={(value) => {
              setFromDate(value)
              if (toDate < value) setToDate(value)
            }}
          />
        </Field>

        {kind === 'doi-ca' ? (
          <Field label="Người nhận ca">
            <select
              value={counterpartId ?? ''}
              onChange={(e) => setCounterpartId(e.target.value ? Number(e.target.value) : null)}
              className="h-[var(--hit-target)] w-full rounded-sm border border-line-3 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
            >
              <option value="">Chọn người…</option>
              {colleagues.data?.map((person) => (
                <option key={person.employeeId} value={person.employeeId}>
                  {person.fullName}
                </option>
              ))}
            </select>
          </Field>
        ) : (
          <Field label="Đến ngày">
            <DateInput value={toDate} min={fromDate} onChange={setToDate} />
          </Field>
        )}

        <Field label="Lý do">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Viết ngắn gọn để quản lý duyệt nhanh"
            className="w-full rounded-sm border border-line-3 bg-canvas px-3 py-2 text-[length:var(--fs-b2)] text-ink-hi placeholder:text-ink-mute"
          />
        </Field>
      </div>
    </Modal>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-2">
      <span className="text-[length:var(--fs-c1)] tracking-[0.1em] text-ink-mute uppercase">
        {label}
      </span>
      {children}
    </label>
  )
}

function DateInput({
  value,
  min,
  onChange,
}: {
  value: string
  min?: string
  onChange: (value: string) => void
}) {
  return (
    <input
      type="date"
      value={value}
      min={min}
      onChange={(e) => onChange(e.target.value)}
      className="h-[var(--hit-target)] w-full rounded-sm border border-line-3 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
    />
  )
}
