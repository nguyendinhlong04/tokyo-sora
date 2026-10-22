import {
  REPORT_AUTO_FIELDS,
  REPORT_CADENCE_LABELS,
  REPORT_CADENCES,
  REPORT_FIELD_TYPE_LABELS,
  REPORT_FIELD_TYPES,
  REPORT_REVIEW_MODE_LABELS,
  REPORT_REVIEW_MODES,
  type OrgChart,
  type ReportAutoKey,
  type ReportField,
  type ReportFieldType,
  type ReportTemplateView,
} from '@sora/contracts'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api, type ReportTemplateInput } from '../../api'
import { Drawer } from '../Drawer'
import { Checkbox, Field, ListHead, NumberInput, Select, TextInput, Toggle } from '../form'

/** Khoá trường từ nhãn tiếng Việt: "Giải trình két" → "giai-trinh-ket" */
export const slugOf = (label: string) =>
  label
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)

const AUTO_KEYS = Object.keys(REPORT_AUTO_FIELDS) as ReportAutoKey[]

/**
 * N7 · Mẫu báo cáo của một chi nhánh: trường, lịch nộp, ghế nộp, người xác nhận.
 * Đổi danh sách trường là lên phiên bản — bản đã nộp vẫn đọc theo trường của nó.
 */
export function ReportTemplateDrawer({
  template,
  branchId,
  chart,
  onClose,
}: {
  template: ReportTemplateView | null
  branchId: string
  chart: OrgChart | undefined
  onClose: () => void
}) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [form, setForm] = useState<ReportTemplateInput>(() =>
    template
      ? {
          code: template.code,
          name: template.name,
          cadence: template.cadence,
          branchId: template.branchId,
          fields: template.fields,
          shiftTemplateIds: template.shiftTemplateIds,
          dueOffsetMinutes: template.dueOffsetMinutes,
          reviewMode: template.reviewMode,
          kenhNv: template.kenhNv,
          active: template.active,
          positions: template.positions.map((p) => ({ positionId: p.positionId, role: p.role })),
        }
      : {
          code: '',
          name: '',
          cadence: 'ngay',
          branchId,
          fields: [],
          shiftTemplateIds: [],
          dueOffsetMinutes: 23 * 60,
          reviewMode: 'cap-tren',
          kenhNv: false,
          active: true,
          positions: [],
        },
  )
  const set = <K extends keyof ReportTemplateInput>(key: K, value: ReportTemplateInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }))
  const setField = (i: number, patch: Partial<ReportField>) =>
    set(
      'fields',
      form.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)),
    )

  // Ghế trong cây của chi nhánh
  const seats = useMemo(() => {
    if (!chart) return []
    const root = chart.units.find((u) => u.branchId === branchId)
    if (!root) return []
    const inBranch = new Set([root.id])
    let grew = true
    while (grew) {
      grew = false
      for (const u of chart.units) {
        if (u.parentId !== null && inBranch.has(u.parentId) && !inBranch.has(u.id)) {
          inBranch.add(u.id)
          grew = true
        }
      }
    }
    const unitName = new Map(chart.units.map((u) => [u.id, u.name]))
    return chart.positions
      .filter((p) => inBranch.has(p.unitId))
      .map((p) => ({ id: p.id, label: `${p.title} — ${unitName.get(p.unitId)}` }))
  }, [chart, branchId])

  const save = useMutation({
    mutationFn: () => api.saveReportTemplate(template?.id ?? null, form),
    onSuccess: () => {
      toast(template ? 'Đã lưu mẫu báo cáo' : 'Đã tạo mẫu báo cáo', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['report-templates'] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const ready =
    form.name.trim() &&
    /^[a-z0-9]+(-[a-z0-9]+)*$/.test(form.code) &&
    form.fields.length > 0 &&
    form.fields.every((f) => f.label.trim() && f.key) &&
    form.positions.length > 0

  return (
    <Drawer
      open
      onClose={onClose}
      width={720}
      title={template ? `Mẫu · ${template.name}` : 'Mẫu báo cáo mới'}
      subtitle={template ? `Phiên bản ${template.version}` : undefined}
      footer={
        <div className="flex items-center justify-between">
          <Toggle on={form.active} onChange={(v) => set('active', v)} tone="ok">
            {form.active ? 'Đang dùng' : 'Đã tắt'}
          </Toggle>
          <div className="flex gap-2">
            <Button onClick={onClose}>Thôi</Button>
            <Button
              variant="primary"
              disabled={!ready || save.isPending}
              onClick={() => save.mutate()}
            >
              {template ? 'Lưu mẫu' : 'Tạo mẫu'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="grid gap-5">
        <div className="grid grid-cols-[1fr_200px] gap-4">
          <Field label="Tên mẫu">
            <TextInput
              value={form.name}
              onChange={(v) =>
                setForm((f) => ({ ...f, name: v, code: template ? f.code : slugOf(v) }))
              }
            />
          </Field>
          <Field label="Mã">
            <TextInput
              value={form.code}
              onChange={(v) => set('code', v)}
              mono
              disabled={Boolean(template)}
            />
          </Field>
          <Field label="Nộp">
            <Select
              value={form.cadence}
              options={REPORT_CADENCES.map((c) => ({ value: c, label: REPORT_CADENCE_LABELS[c] }))}
              onChange={(v) => set('cadence', v)}
            />
          </Field>
          <Field
            label="Hạn (phút)"
            hint={
              form.cadence === 'ca'
                ? 'Sau giờ kết ca'
                : form.cadence === 'ngay'
                  ? 'Kể từ 00:00 ngày báo cáo (1980 = 9 giờ sáng hôm sau)'
                  : 'Kể từ 00:00 ngày đầu kỳ sau'
            }
          >
            <NumberInput
              value={form.dueOffsetMinutes}
              min={0}
              max={4320}
              onChange={(v) => set('dueOffsetMinutes', v ?? 0)}
            />
          </Field>
          <Field label="Xác nhận">
            <Select
              value={form.reviewMode}
              options={REPORT_REVIEW_MODES.map((m) => ({
                value: m,
                label: REPORT_REVIEW_MODE_LABELS[m],
              }))}
              onChange={(v) => set('reviewMode', v)}
            />
          </Field>
          <div className="pt-6">
            <Checkbox
              checked={form.kenhNv}
              onChange={(v) => set('kenhNv', v)}
              label="Nộp được trên Kênh nhân viên"
            />
          </div>
        </div>

        <div>
          <ListHead
            label="Ghế nộp"
            hint="Người giữ ghế (và đứng đúng ca, với báo cáo theo ca) thấy báo cáo trong mục Cần nộp."
          />
          <div className="grid max-h-[180px] gap-0.5 overflow-y-auto rounded-sm border border-line-1 p-1">
            {seats.map((s) => {
              const current = form.positions.find((p) => p.positionId === s.id)
              return (
                <div
                  key={s.id}
                  className="flex items-center gap-3 px-2 py-1 text-[length:var(--fs-b2)]"
                >
                  <Checkbox
                    checked={Boolean(current)}
                    label={s.label}
                    onChange={(on) =>
                      set(
                        'positions',
                        on
                          ? [...form.positions, { positionId: s.id, role: 'nop' }]
                          : form.positions.filter((p) => p.positionId !== s.id),
                      )
                    }
                  />
                  {current ? (
                    <Select
                      value={current.role}
                      width={150}
                      options={[
                        { value: 'nop', label: 'Người nộp' },
                        { value: 'du-phong', label: 'Nộp thay' },
                      ]}
                      onChange={(role) =>
                        set(
                          'positions',
                          form.positions.map((p) => (p.positionId === s.id ? { ...p, role } : p)),
                        )
                      }
                    />
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>

        <div>
          <ListHead
            label={`Trường · ${form.fields.length}`}
            hint="Trường tự điền máy tính lúc nộp; trường tiền khiến mẫu chỉ nộp được ở Office."
          >
            <div className="flex gap-2">
              <Select
                value=""
                width={220}
                placeholder="+ Trường tự điền…"
                options={AUTO_KEYS.filter((k) => !form.fields.some((f) => f.auto === k)).map(
                  (k) => ({
                    value: k,
                    label: REPORT_AUTO_FIELDS[k].label,
                  }),
                )}
                onChange={(k) =>
                  set('fields', [
                    ...form.fields,
                    {
                      key: slugOf(REPORT_AUTO_FIELDS[k].label),
                      label: REPORT_AUTO_FIELDS[k].label,
                      type: REPORT_AUTO_FIELDS[k].type,
                      auto: k,
                    },
                  ])
                }
              />
              <Button
                size="sm"
                disabled={form.fields.length >= 40}
                onClick={() =>
                  set('fields', [...form.fields, { key: '', label: '', type: 'doan' }])
                }
              >
                + Trường nhập tay
              </Button>
            </div>
          </ListHead>
          <div className="grid gap-2">
            {form.fields.map((f, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(0,1fr)_150px_110px_auto] items-center gap-2"
              >
                <TextInput
                  value={f.label}
                  placeholder="Nhãn"
                  onChange={(label) => setField(i, { label, key: f.auto ? f.key : slugOf(label) })}
                />
                {f.auto ? (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">tự điền</span>
                ) : (
                  <Select
                    value={f.type}
                    options={REPORT_FIELD_TYPES.map((t) => ({
                      value: t,
                      label: REPORT_FIELD_TYPE_LABELS[t],
                    }))}
                    onChange={(type: ReportFieldType) => setField(i, { type })}
                  />
                )}
                {f.auto ? (
                  <span />
                ) : (
                  <Checkbox
                    checked={Boolean(f.required)}
                    label="Bắt buộc"
                    onChange={(required) => setField(i, { required })}
                  />
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    set(
                      'fields',
                      form.fields.filter((_, j) => j !== i),
                    )
                  }
                >
                  Bỏ
                </Button>
                {f.type === 'chon' || f.type === 'nhieu-chon' ? (
                  <div className="col-span-4">
                    <TextInput
                      value={(f.options ?? []).join(', ')}
                      placeholder="Các lựa chọn, ngăn bằng dấu phẩy"
                      onChange={(v) =>
                        setField(i, {
                          options: v
                            .split(',')
                            .map((x) => x.trim())
                            .filter(Boolean),
                        })
                      }
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </div>
    </Drawer>
  )
}
