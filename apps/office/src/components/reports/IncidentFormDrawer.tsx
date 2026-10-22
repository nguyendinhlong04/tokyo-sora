import {
  INCIDENT_CATEGORIES,
  INCIDENT_CATEGORY_LABELS,
  INCIDENT_EXTERNAL_CATEGORIES,
  INCIDENT_SEVERITIES,
  INCIDENT_SEVERITY_LABELS,
  type IncidentCategory,
  type IncidentSeverity,
} from '@sora/contracts'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api'
import { Drawer } from '../Drawer'
import { Checkbox, DateInput, Field, NumberInput, Select, TextArea, TextInput } from '../form'

const nowLocal = () => {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date())
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00'
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    time: `${get('hour')}:${get('minute')}`,
  }
}

/**
 * Báo sự cố — ai cũng báo được. Báo SỚM quan trọng hơn báo ĐỦ: người xử lý bổ
 * sung nguyên nhân, biện pháp sau. Mức nghiêm trọng của TNLĐ, ATTP, cháy nổ tự
 * nhắc khai báo ra ngoài.
 */
export function IncidentFormDrawer({ onClose }: { onClose: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const start = nowLocal()
  const [category, setCategory] = useState<IncidentCategory | ''>('')
  const [severity, setSeverity] = useState<IncidentSeverity>('trung-binh')
  const [date, setDate] = useState(start.date)
  const [time, setTime] = useState(start.time)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [immediate, setImmediate] = useState('')
  const [injured, setInjured] = useState<number | null>(0)
  const [customer, setCustomer] = useState(false)

  const external =
    category !== '' &&
    INCIDENT_EXTERNAL_CATEGORIES.includes(category) &&
    (severity === 'nghiem-trong' || severity === 'rat-nghiem-trong')

  const send = useMutation({
    mutationFn: () =>
      api.reportIncident({
        category: category as IncidentCategory,
        severity,
        occurredAt: new Date(`${date}T${time}:00+07:00`).toISOString(),
        title: title.trim(),
        description: description.trim(),
        immediateAction: immediate.trim() || null,
        injuredCount: injured ?? 0,
        customerInvolved: customer,
        evidenceUrls: [],
      }),
    onSuccess: (r) => {
      toast(`Đã báo sự cố ${r.code}`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['incidents'] })
      void queryClient.invalidateQueries({ queryKey: ['org-inbox'] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const ready = category !== '' && title.trim() && description.trim()

  return (
    <Drawer
      open
      onClose={onClose}
      title="Báo sự cố"
      subtitle="Báo ngay khi xảy ra — nguyên nhân và cách khắc phục người xử lý bổ sung sau."
      footer={
        <div className="flex justify-end gap-2">
          <Button onClick={onClose}>Thôi</Button>
          <Button
            variant="primary"
            disabled={!ready || send.isPending}
            onClick={() => send.mutate()}
          >
            Báo sự cố
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <div className="grid grid-cols-2 gap-4">
          <Field label="Loại">
            <Select
              value={category}
              placeholder="Chọn loại…"
              options={INCIDENT_CATEGORIES.map((c) => ({
                value: c,
                label: INCIDENT_CATEGORY_LABELS[c],
              }))}
              onChange={setCategory}
            />
          </Field>
          <Field label="Mức độ">
            <Select
              value={severity}
              options={INCIDENT_SEVERITIES.map((s) => ({
                value: s,
                label: INCIDENT_SEVERITY_LABELS[s],
              }))}
              onChange={setSeverity}
            />
          </Field>
          <Field label="Ngày xảy ra">
            <DateInput value={date} onChange={setDate} className="w-full" />
          </Field>
          <Field label="Giờ">
            <TextInput type="time" mono value={time} onChange={setTime} />
          </Field>
        </div>
        {external ? (
          <p className="rounded-sm border border-warn px-4 py-3 text-[length:var(--fs-b2)] text-ink-hi">
            Sự cố loại này ở mức nghiêm trọng phải khai báo với cơ quan chức năng. Báo ngay cho quản
            lý chi nhánh và quản lý chuỗi.
          </p>
        ) : null}
        <Field label="Chuyện gì xảy ra">
          <TextInput
            value={title}
            onChange={setTitle}
            placeholder="Khách bị bỏng nhẹ khi thay vỉ"
          />
        </Field>
        <Field label="Mô tả">
          <TextArea value={description} onChange={setDescription} rows={4} />
        </Field>
        <Field label="Đã làm gì ngay">
          <TextArea value={immediate} onChange={setImmediate} rows={2} />
        </Field>
        <div className="flex items-end gap-6">
          <Field label="Số người bị thương">
            <NumberInput value={injured} onChange={setInjured} min={0} width={120} />
          </Field>
          <Checkbox checked={customer} onChange={setCustomer} label="Có khách liên quan" />
        </div>
      </div>
    </Drawer>
  )
}
