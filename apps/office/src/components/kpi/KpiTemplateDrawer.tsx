import {
  KPI_METRICS,
  KPI_UNIT_LABELS,
  type KpiMetricCode,
  type KpiTemplateView,
} from '@sora/contracts'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../../api'
import { Drawer } from '../Drawer'
import { Field, ListHead, NumberInput, Select } from '../form'
import { IconClose } from '../icons'
import { metricGroup, SOURCE_LABELS } from './kpi-ui'

const METRIC_OPTIONS = (Object.keys(KPI_METRICS) as KpiMetricCode[]).map((code) => ({
  value: code,
  label: `${metricGroup(code)} · ${KPI_METRICS[code].label}`,
}))

type Row = { metricCode: KpiMetricCode | ''; weight: number | null; target: number | null }

/**
 * N9 — Bộ KPI của một chức danh: 3–6 chỉ số trong danh mục, trọng số cộng đúng
 * 100%, chỉ tiêu mặc định theo đơn vị của chỉ số.
 *
 * Lưu là tạo PHIÊN BẢN MỚI: kỳ đã mở vẫn chấm theo bộ lúc mở kỳ, nên sửa ở đây
 * không đổi điểm của người đang được chấm. Chỉ tiêu 0 chỉ có nghĩa với chỉ số đếm
 * (số lần vắng, QR treo…) — chia cho 0 ở chỉ số tỉ lệ thì chỉ số đó không bao giờ
 * có điểm, nên chặn ngay ở đây.
 */
export function KpiTemplateDrawer({
  seat,
  template,
  onClose,
}: {
  seat: { positionId: number; title: string; unitName: string }
  template: KpiTemplateView | null
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [rows, setRows] = useState<Row[]>(() =>
    template
      ? template.items.map((i) => ({
          metricCode: i.metricCode,
          weight: i.weightPct,
          target: i.defaultTargetMilli / 1000,
        }))
      : [0, 1, 2].map(() => ({ metricCode: '', weight: null, target: null })),
  )

  const total = rows.reduce((sum, r) => sum + (r.weight ?? 0), 0)
  const chosen = rows.map((r) => r.metricCode).filter(Boolean)
  const problems = [
    rows.length < 3 || rows.length > 6 ? 'Bộ KPI có từ 3 đến 6 chỉ số.' : '',
    rows.some((r) => !r.metricCode) ? 'Chọn chỉ số cho mọi dòng.' : '',
    new Set(chosen).size !== chosen.length ? 'Mỗi chỉ số chỉ xuất hiện một lần.' : '',
    rows.some((r) => r.weight === null || r.weight < 1 || !Number.isInteger(r.weight))
      ? 'Trọng số là số nguyên từ 1%.'
      : '',
    total !== 100 ? `Tổng trọng số đang là ${total}% — phải đúng 100%.` : '',
    rows.some((r) => r.target === null || r.target < 0) ? 'Nhập chỉ tiêu cho mọi chỉ số.' : '',
    rows.some((r) => r.metricCode && r.target === 0 && KPI_METRICS[r.metricCode].unit !== 'lan')
      ? 'Chỉ tiêu 0 chỉ dùng cho chỉ số đếm (lần).'
      : '',
  ].filter(Boolean)

  const save = useMutation({
    mutationFn: () =>
      api.saveKpiTemplate({
        positionId: seat.positionId,
        items: rows.map((r) => ({
          metricCode: r.metricCode as KpiMetricCode,
          weightPct: r.weight!,
          defaultTargetMilli: Math.round(r.target! * 1000),
        })),
      }),
    onSuccess: () => {
      toast(`Đã lưu bộ KPI cho ${seat.title}`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['kpi-templates'] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const patch = (idx: number, next: Partial<Row>) =>
    setRows((list) => list.map((r, i) => (i === idx ? { ...r, ...next } : r)))

  return (
    <Drawer
      open
      onClose={onClose}
      width={720}
      title={`Bộ KPI · ${seat.title}`}
      subtitle={
        <>
          {seat.unitName}
          {template ? ` · đang dùng phiên bản ${template.version}` : ' · chưa có bộ KPI'}. Lưu là
          tạo phiên bản mới; kỳ đã mở vẫn chấm theo bộ cũ.
        </>
      }
      footer={
        <>
          <Button onClick={onClose}>Bỏ</Button>
          <Button
            variant="primary"
            disabled={problems.length > 0 || save.isPending}
            onClick={() => save.mutate()}
          >
            Lưu bộ KPI
          </Button>
        </>
      }
    >
      <ListHead label={`Chỉ số · ${rows.length}/6`}>
        <span
          className={`font-mono text-[length:var(--fs-b2)] tabular-nums ${
            total === 100 ? 'text-ok' : 'text-danger-line'
          }`}
        >
          Tổng {total}%
        </span>
      </ListHead>
      <div className="grid gap-3">
        {rows.map((row, idx) => {
          const def = row.metricCode ? KPI_METRICS[row.metricCode] : null
          return (
            <div key={idx} className="rounded-md border border-line-1 bg-surface-2 px-4 py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_96px_170px_36px] items-end gap-3">
                <Field label="Chỉ số">
                  <Select
                    value={row.metricCode}
                    placeholder="Chọn chỉ số…"
                    options={METRIC_OPTIONS}
                    onChange={(code) =>
                      patch(idx, { metricCode: code, target: KPI_METRICS[code].defaultTarget })
                    }
                  />
                </Field>
                <Field label="Trọng số %">
                  <NumberInput
                    value={row.weight}
                    min={1}
                    max={100}
                    onChange={(weight) => patch(idx, { weight })}
                  />
                </Field>
                <Field label={def ? `Chỉ tiêu (${KPI_UNIT_LABELS[def.unit]})` : 'Chỉ tiêu'}>
                  <NumberInput
                    value={row.target}
                    min={0}
                    disabled={!def}
                    onChange={(target) => patch(idx, { target })}
                  />
                </Field>
                <button
                  type="button"
                  aria-label="Bỏ chỉ số này"
                  disabled={rows.length <= 3}
                  onClick={() => setRows((list) => list.filter((_, i) => i !== idx))}
                  className="grid size-9 place-items-center rounded-sm text-ink-mute transition-colors hover:bg-surface-3 hover:text-ink-hi focus-visible:outline-2 focus-visible:outline-accent disabled:opacity-40"
                >
                  <IconClose />
                </button>
              </div>
              {def ? (
                <p className="mt-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
                  {def.direction === 'cao' ? 'Cao là tốt' : 'Thấp là tốt'} ·{' '}
                  {SOURCE_LABELS[def.source]} · {def.formula}
                  {'need' in def ? ' · người không xem được số tiền chỉ thấy % đạt' : ''}
                </p>
              ) : null}
            </div>
          )
        })}
      </div>
      <div className="mt-3">
        <Button
          size="sm"
          disabled={rows.length >= 6}
          onClick={() =>
            setRows((list) => [...list, { metricCode: '', weight: null, target: null }])
          }
        >
          Thêm chỉ số
        </Button>
      </div>
      {problems.length > 0 ? (
        <ul className="mt-4 grid gap-1 text-[length:var(--fs-c1)] text-danger-line">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
      ) : null}
    </Drawer>
  )
}
