import {
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_LABELS,
  type IncidentCategory,
  type IncidentSeverity,
} from '@sora/contracts'
import { Button, Sheet, useToast } from '@sora/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api'

const CONTROL =
  'w-full rounded-sm border border-line-3 bg-canvas px-3 text-[length:var(--fs-b1)] text-ink-hi placeholder:text-ink-mute'

/**
 * Báo sự cố từ điện thoại — báo SỚM quan trọng hơn báo ĐỦ. Bốn ô: loại, mức,
 * chuyện gì, đã làm gì ngay. Giờ xảy ra mặc định là bây giờ; người xử lý ở Office
 * bổ sung nguyên nhân và cách khắc phục.
 */
export function IncidentSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [category, setCategory] = useState<IncidentCategory | ''>('')
  const [severity, setSeverity] = useState<IncidentSeverity>('trung-binh')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [immediate, setImmediate] = useState('')

  const send = useMutation({
    mutationFn: () =>
      api.reportIncident({
        category: category as IncidentCategory,
        severity,
        occurredAt: new Date().toISOString(),
        title: title.trim(),
        description: description.trim() || title.trim(),
        immediateAction: immediate.trim() || null,
        injuredCount: 0,
        customerInvolved: false,
        evidenceUrls: [],
      }),
    onSuccess: (r) => {
      toast(`Đã báo sự cố ${r.code} — quản lý đã nhận`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['my-incidents'] })
      setCategory('')
      setTitle('')
      setDescription('')
      setImmediate('')
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <Sheet open={open} onClose={onClose} full>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pt-3 pb-4">
        <h2 className="text-[length:var(--fs-t1)] font-semibold text-ink-hi">Báo sự cố</h2>
        <p className="mt-1 text-[length:var(--fs-b2)] text-ink-body">
          Có người bị thương, cháy nổ, ngộ độc: gọi ngay quản lý và cấp cứu trước — báo ở đây sau.
        </p>
        <div className="mt-5 flex flex-col gap-4">
          <label className="flex flex-col gap-2">
            <span className="text-[length:var(--fs-b2)] text-ink-body">Loại sự cố</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as IncidentCategory)}
              className={`${CONTROL} h-[var(--hit-target)]`}
            >
              <option value="">Chọn…</option>
              {INCIDENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {INCIDENT_CATEGORY_LABELS[c]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[length:var(--fs-b2)] text-ink-body">Mức độ</span>
            <select
              value={severity}
              onChange={(e) => setSeverity(e.target.value as IncidentSeverity)}
              className={`${CONTROL} h-[var(--hit-target)]`}
            >
              {INCIDENT_SEVERITIES.map((s) => (
                <option key={s} value={s}>
                  {INCIDENT_SEVERITY_LABELS[s]}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[length:var(--fs-b2)] text-ink-body">Chuyện gì xảy ra</span>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Vỡ đường ống nước khu rửa"
              className={`${CONTROL} h-[var(--hit-target)]`}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[length:var(--fs-b2)] text-ink-body">Chi tiết</span>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className={`${CONTROL} py-2`}
            />
          </label>
          <label className="flex flex-col gap-2">
            <span className="text-[length:var(--fs-b2)] text-ink-body">Đã làm gì ngay</span>
            <textarea
              value={immediate}
              onChange={(e) => setImmediate(e.target.value)}
              rows={2}
              className={`${CONTROL} py-2`}
            />
          </label>
        </div>
      </div>
      <div className="border-t border-line-2 bg-surface-2 px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
        <Button
          block
          variant="primary"
          disabled={!category || !title.trim() || send.isPending}
          onClick={() => send.mutate()}
        >
          Báo sự cố
        </Button>
      </div>
    </Sheet>
  )
}
