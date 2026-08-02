import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, type EinvoiceConfig } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Field } from '../components/report'
import { useSession } from '../session-context'

/**
 * A9 — Hoá đơn điện tử.
 *
 * Không có bảng riêng: màn này là **cửa vào theo ngữ cảnh** của chính sổ tham số
 * A6, đúng như §29.1 nói — "sửa ở đâu cũng là sửa một chỗ". Miền kế toán vốn đã
 * đọc `einvoice.serial` từ đó lúc phát hành; dựng thêm một bảng là tạo nguồn thứ
 * hai cho con số đã có nguồn.
 *
 * Phạm vi chia đôi theo §30.2: **một mã số thuế cho cả chuỗi** (một hợp đồng
 * HĐĐT), nhưng **mỗi địa điểm kinh doanh một ký hiệu M riêng**. Nên khối trên đổi
 * là ba chi nhánh cùng đổi, khối dưới chỉ đổi chi nhánh đang xem.
 *
 * Sổ phát hành thì không ở đây mà ở F3 — đây là nơi khai, kia là nơi đọc.
 */

interface Draft {
  taxCode: string
  provider: string
  certificateSerial: string
  certificateExpiry: string
  serial: string
  enabled: boolean
}

const toDraft = (config: EinvoiceConfig): Draft => ({
  ...config.chain,
  serial: config.branch.serial,
  enabled: config.branch.enabled,
})

export function EInvoice() {
  const { branchId } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<Draft | null>(null)

  const config = useQuery({
    queryKey: ['einvoice', branchId],
    queryFn: () => api.einvoice(branchId!),
    enabled: Boolean(branchId),
  })

  useEffect(() => {
    if (config.data) setDraft(toDraft(config.data))
  }, [config.data])

  const save = useMutation({
    mutationFn: (patch: Partial<Draft>) => api.setEinvoice(branchId!, patch),
    onSuccess: () => {
      toast('Đã lưu cấu hình hoá đơn điện tử', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['einvoice'] })
      void queryClient.invalidateQueries({ queryKey: ['parameters'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  if (config.isError) {
    return (
      <>
        <PageHeader title="Hoá đơn điện tử" />
        <div className="px-8">
          <ErrorState message={(config.error as Error).message} />
        </div>
      </>
    )
  }
  if (!config.data || !draft) {
    return (
      <>
        <PageHeader title="Hoá đơn điện tử" />
        <p className="px-8 text-ink-mute">Đang tải…</p>
      </>
    )
  }

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft({ ...draft, [key]: value })
  const current = config.data
  const daysLeft = current.certificateDaysLeft

  const chainDirty =
    draft.taxCode !== current.chain.taxCode ||
    draft.provider !== current.chain.provider ||
    draft.certificateSerial !== current.chain.certificateSerial ||
    draft.certificateExpiry !== current.chain.certificateExpiry
  const branchDirty = draft.serial !== current.branch.serial

  return (
    <>
      <PageHeader
        title="Hoá đơn điện tử"
        subtitle="Khai ở đây, phát hành ở F3. Một mã số thuế cho cả chuỗi; mỗi địa điểm kinh doanh một ký hiệu riêng."
        action={
          current.branch.enabled ? (
            <Badge tone="ok">Đang bật cho {current.branchId}</Badge>
          ) : (
            <Badge tone="warn">Đang tắt cho {current.branchId}</Badge>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <section className="rounded-md border border-line-1 bg-surface-1 p-6">
          <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">Của cả chuỗi</h2>
          <p className="mt-1.5 max-w-[720px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Một mã số thuế → một hợp đồng hoá đơn điện tử duy nhất. Sửa ở đây là cả ba chi nhánh
            cùng đổi.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Field label="Mã số thuế">
              <Input
                value={draft.taxCode}
                onChange={(v) => set('taxCode', v)}
                placeholder="0101234567"
                mono
              />
            </Field>
            <Field label="Nhà cung cấp hoá đơn">
              <Input
                value={draft.provider}
                onChange={(v) => set('provider', v)}
                placeholder="Viettel · VNPT · MISA meInvoice…"
              />
            </Field>
            <Field label="Số hiệu chứng thư số">
              <Input
                value={draft.certificateSerial}
                onChange={(v) => set('certificateSerial', v)}
                mono
              />
            </Field>
            <Field label="Chứng thư số hết hạn">
              <Input
                value={draft.certificateExpiry}
                onChange={(v) => set('certificateExpiry', v)}
                type="date"
                mono
              />
            </Field>
          </div>

          {daysLeft !== null ? (
            <p
              className={`mt-4 text-[length:var(--fs-c1)] leading-relaxed ${
                daysLeft < 0 ? 'text-danger' : daysLeft <= 30 ? 'text-warn' : 'text-ink-mute'
              }`}
            >
              {daysLeft < 0
                ? `Chứng thư số đã hết hạn ${Math.abs(daysLeft)} ngày — hoá đơn sẽ không phát hành được, gia hạn với nhà cung cấp trước.`
                : daysLeft <= 30
                  ? `Chứng thư số còn ${daysLeft} ngày. Gia hạn trước khi hết, vì hết hạn là mọi bill rơi vào hàng đợi lỗi của F3.`
                  : `Chứng thư số còn ${daysLeft} ngày.`}
            </p>
          ) : null}

          {chainDirty ? (
            <div className="mt-5 flex gap-2">
              <Button
                variant="primary"
                disabled={save.isPending}
                onClick={() =>
                  save.mutate({
                    taxCode: draft.taxCode,
                    provider: draft.provider,
                    certificateSerial: draft.certificateSerial,
                    certificateExpiry: draft.certificateExpiry,
                  })
                }
              >
                Lưu phần chuỗi
              </Button>
              <Button onClick={() => setDraft(toDraft(current))}>Bỏ sửa</Button>
            </div>
          ) : null}
        </section>

        <section className="mt-5 rounded-md border border-line-1 bg-surface-1 p-6">
          <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">
            Riêng chi nhánh {current.branchId}
          </h2>
          <p className="mt-1.5 max-w-[720px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
            Ký hiệu 6 ký tự và bắt buộc có chữ M — dấu của hoá đơn khởi tạo từ máy tính tiền. Mỗi
            địa điểm kinh doanh đăng ký với cơ quan thuế một ký hiệu riêng.
          </p>

          <div className="mt-5 grid gap-4 lg:grid-cols-2">
            <Field label="Ký hiệu hoá đơn">
              <Input
                value={draft.serial}
                onChange={(v) => set('serial', v.toUpperCase().slice(0, 6))}
                placeholder="C26MAA"
                mono
              />
            </Field>
            <Field label="Trạng thái">
              <button
                type="button"
                disabled={save.isPending}
                onClick={() => save.mutate({ enabled: !current.branch.enabled })}
                className={`h-9 rounded-sm border px-4 text-[length:var(--fs-b2)] ${
                  current.branch.enabled ? 'border-ok text-ok' : 'border-line-3 text-ink-mute'
                }`}
              >
                {current.branch.enabled ? 'Đang phát hành hoá đơn' : 'Chưa bật — bấm để bật'}
              </button>
            </Field>
          </div>

          {branchDirty ? (
            <div className="mt-5 flex gap-2">
              <Button
                variant="primary"
                disabled={save.isPending}
                onClick={() => save.mutate({ serial: draft.serial })}
              >
                Lưu ký hiệu
              </Button>
              <Button onClick={() => setDraft(toDraft(current))}>Bỏ sửa</Button>
            </div>
          ) : null}
        </section>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Bật khi chưa có mã số thuế hoặc chưa có ký hiệu thì hệ thống từ chối — thà không bật được
          còn hơn bật rồi mỗi bill đều rơi vào hàng đợi lỗi. Bản dựng này chưa đấu nối nhà cung cấp
          thật: lượt gọi ra cơ quan thuế nhận mã ngay tại chỗ, còn toàn bộ luồng phát hành, hàng đợi
          lỗi và huỷ / thay thế ở F3 thì đã thật.
        </p>
      </div>
    </>
  )
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  mono = false,
}: {
  value: string
  onChange: (next: string) => void
  placeholder?: string
  type?: string
  mono?: boolean
}) {
  return (
    <input
      type={type}
      value={value}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      className={`h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi ${
        mono ? 'font-mono' : ''
      }`}
    />
  )
}
