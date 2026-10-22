import { Button } from '@sora/ui'
import { useState } from 'react'
import type { Approval } from '../api'
import { TextInput as Input } from './form'
import { Field } from './report'

/**
 * Dải xin duyệt △ — người có quyền đứng cạnh nhập mã nhân viên và PIN của mình.
 *
 * Tách khỏi B11 vì mọi ô △ trong Office đều cần đúng dải này. Hiện dải chỉ khi
 * `mustApprove(action)` — đừng suy △ từ `!can(action)`, vì `can` trả true cho cả
 * người ở ô △ (đó chính là lỗi đã làm dải này không bao giờ hiện ở B11).
 *
 * Máy chủ vẫn là nơi kiểm: người duyệt phải có ✓ cho đúng hành động và không phải
 * chính người xin. Dải này chỉ gom ba thứ máy chủ cần.
 */
export function ApprovalPrompt({
  note,
  confirmLabel,
  onCancel,
  onConfirm,
}: {
  note: string
  confirmLabel: string
  onCancel: () => void
  onConfirm: (approval: Approval) => void
}) {
  const [form, setForm] = useState({ approverStaffId: '', approverPin: '', reason: '' })
  const ready = form.approverStaffId && form.approverPin.length >= 4 && form.reason.trim()

  return (
    <div className="flex flex-wrap items-end gap-3 border-t border-accent bg-canvas px-5 py-4">
      <p className="w-full text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">{note}</p>
      <Field label="Mã nhân viên duyệt">
        <Input
          type="number"
          value={form.approverStaffId}
          onChange={(v) => setForm({ ...form, approverStaffId: v })}
          mono
        />
      </Field>
      <Field label="PIN">
        <Input
          type="password"
          value={form.approverPin}
          onChange={(v) => setForm({ ...form, approverPin: v })}
          mono
        />
      </Field>
      <Field label="Lý do">
        <Input value={form.reason} onChange={(v) => setForm({ ...form, reason: v })} />
      </Field>
      <Button onClick={onCancel}>Bỏ</Button>
      <Button
        variant="primary"
        disabled={!ready}
        onClick={() =>
          onConfirm({
            approverStaffId: Number(form.approverStaffId),
            approverPin: form.approverPin,
            reason: form.reason.trim(),
          })
        }
      >
        {confirmLabel}
      </Button>
    </div>
  )
}
