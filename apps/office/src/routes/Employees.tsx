import { formatVnd } from '@sora/contracts'
import { Button, ErrorState, Modal, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type EmployeeInput, type EmployeeRow, type PayKind } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { Field, formatDay } from '../components/report'
import { TextInput as Input, Toggle } from '../components/form'
import { useSession } from '../session-context'

/**
 * H1 — Hồ sơ nhân viên.
 *
 * Màn này chứa ĐƠN GIÁ LƯƠNG, nên nó nằm sau quyền `payroll.configure` chứ không
 * sau quyền xếp lịch: quản lý ca xếp được ca cho người này nhưng không mở được hồ
 * sơ của họ. Đó là nguyên tắc cứng thứ tư của §4.2b, và nó chỉ có nghĩa nếu hai
 * màn tách nhau đúng ở chỗ này.
 *
 * Hồ sơ gắn 1-1 với TÀI KHOẢN ĐĂNG NHẬP đã có: không tạo người mới ở đây, vì một
 * người có hồ sơ lương mà không đăng nhập được thì không ai chấm công cho họ, và
 * một tài khoản có hai hồ sơ thì kỳ lương trả hai lần.
 */

const PAY_KIND_LABELS: Record<PayKind, string> = {
  hourly: 'Theo giờ',
  monthly: 'Theo tháng',
}

const blank = (branchId: string, staffId: number): EmployeeInput => ({
  staffId,
  branchId,
  position: '',
  payKind: 'hourly',
  hourlyRateVnd: 0,
  monthlySalaryVnd: 0,
  fixedAllowanceVnd: 0,
  startedOn: new Date().toISOString().slice(0, 10),
  endedOn: null,
  bankAccount: null,
  active: true,
})

export function Employees() {
  const { branchId } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{ input: EmployeeInput; id?: number } | null>(null)
  const [issued, setIssued] = useState<{ fullName: string; url: string } | null>(null)

  const rows = useQuery({
    queryKey: ['employees', branchId],
    queryFn: () => api.employees(branchId!),
    enabled: Boolean(branchId),
  })
  const candidates = useQuery({
    queryKey: ['employee-candidates', branchId],
    queryFn: () => api.employeeCandidates(branchId!),
    enabled: Boolean(branchId),
  })

  /**
   * Cấp link Kênh nhân viên (H8 · H9).
   *
   * Token chỉ trả về một lần nên nó phải hiện ra ngay và hiện đủ lâu để chép đi
   * gửi. Máy chủ chỉ giữ bản băm — không có màn nào xem lại được, mất thì cấp lại.
   */
  const link = useMutation({
    mutationFn: (row: EmployeeRow) => api.issueChannelLink(row.id),
    onSuccess: ({ token, fullName }) => setIssued({ fullName, url: channelUrl(token) }),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const save = useMutation({
    mutationFn: ({ input, id }: { input: EmployeeInput; id?: number }) =>
      api.saveEmployee(input, id),
    onSuccess: () => {
      toast('Đã lưu hồ sơ', 'ok')
      setDraft(null)
      void queryClient.invalidateQueries({ queryKey: ['employees'] })
      void queryClient.invalidateQueries({ queryKey: ['employee-candidates'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const list = rows.data ?? []
  const available = candidates.data ?? []

  return (
    <>
      <PageHeader
        title="Hồ sơ nhân viên"
        subtitle="Vị trí, cách trả lương và đơn giá. Mỗi hồ sơ gắn với một tài khoản đăng nhập đã có."
        action={
          available.length > 0 ? (
            <select
              value=""
              onChange={(e) =>
                e.target.value && setDraft({ input: blank(branchId!, Number(e.target.value)) })
              }
              className="h-[var(--hit-target)] rounded-sm border border-line-3 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
            >
              <option value="">Thêm hồ sơ cho…</option>
              {available.map((person) => (
                <option key={person.id} value={person.id}>
                  {person.fullName} ({person.code})
                </option>
              ))}
            </select>
          ) : null
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {rows.isError ? <ErrorState message={(rows.error as Error).message} /> : null}

        {draft ? (
          <EmployeeForm
            draft={draft.input}
            onChange={(input) => setDraft({ ...draft, input })}
            onCancel={() => setDraft(null)}
            onSave={() => save.mutate(draft)}
            saving={save.isPending}
          />
        ) : null}

        <div className="mt-5">
          <DataTable
            rows={list}
            rowKey={(row) => row.id}
            loading={rows.isPending}
            empty="Chưa có hồ sơ nào. Chọn một tài khoản ở nút phía trên để bắt đầu."
            columns={[
              {
                key: 'name',
                header: 'Nhân viên',
                width: 'minmax(200px, 1fr)',
                cell: (row) => (
                  <span className={row.active ? '' : 'opacity-60'}>
                    <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                      {row.fullName}
                    </span>
                    <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
                      {row.code}
                    </span>
                  </span>
                ),
              },
              {
                key: 'position',
                header: 'Vị trí',
                width: '150px',
                cell: (row) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-body">{row.position}</span>
                ),
              },
              {
                key: 'payKind',
                header: 'Trả lương',
                width: '130px',
                cell: (row) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {PAY_KIND_LABELS[row.payKind]}
                  </span>
                ),
              },
              {
                key: 'rate',
                header: 'Đơn giá / lương',
                width: '170px',
                numeric: true,
                cell: (row) => (
                  <span className="text-[length:var(--fs-b2)] text-ink-hi">
                    {row.payKind === 'hourly'
                      ? `${formatVnd(row.hourlyRateVnd)}/giờ`
                      : `${formatVnd(row.monthlySalaryVnd)}/tháng`}
                  </span>
                ),
              },
              {
                key: 'allowance',
                header: 'Phụ cấp',
                width: '150px',
                numeric: true,
                cell: (row) => (
                  <span className="text-ink-mute">
                    {row.fixedAllowanceVnd === 0 ? '—' : formatVnd(row.fixedAllowanceVnd)}
                  </span>
                ),
              },
              {
                key: 'startedOn',
                header: 'Vào từ',
                width: '110px',
                cell: (row) => (
                  <span className="text-[length:var(--fs-c1)] text-ink-mute">
                    {formatDay(row.startedOn)}
                  </span>
                ),
              },
              {
                key: 'actions',
                header: '',
                width: '150px',
                cell: (row) => (
                  <span className="flex justify-end gap-1.5">
                    <Button
                      onClick={() => link.mutate(row)}
                      disabled={link.isPending || !row.active}
                      title="Cấp link Kênh nhân viên (H8 · H9) — link cũ ngừng hoạt động ngay"
                      size="sm"
                    >
                      Link
                    </Button>
                    <Button onClick={() => setDraft({ input: toInput(row), id: row.id })} size="sm">
                      Sửa
                    </Button>
                  </span>
                ),
              },
            ]}
          />
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Chưa có trong bản dựng này: giấy tờ đính kèm, và luồng nghỉ việc có bàn giao. Hồ sơ ngừng
          hoạt động thì không vào lưới xếp lịch và không vào kỳ lương mới.
        </p>
      </div>

      <ChannelLinkDialog issued={issued} onClose={() => setIssued(null)} />
    </>
  )
}

/**
 * Sora Staff nằm ở tên miền khác Office nên gốc lấy từ `VITE_STAFF_ORIGIN`; máy
 * dev không đặt biến này thì lấy chính gốc của Office — link vẫn đọc được để thử,
 * chỉ là chưa mở đúng app.
 */
function channelUrl(token: string): string {
  const origin = import.meta.env.VITE_STAFF_ORIGIN ?? window.location.origin
  return `${origin}/nv/${token}`
}

function ChannelLinkDialog({
  issued,
  onClose,
}: {
  issued: { fullName: string; url: string } | null
  onClose: () => void
}) {
  const toast = useToast()

  return (
    <Modal
      open={issued !== null}
      title={issued ? `Link cá nhân của ${issued.fullName}` : ''}
      onClose={onClose}
      footer={
        <>
          <Button
            onClick={() => {
              if (!issued) return
              void navigator.clipboard
                .writeText(issued.url)
                .then(() => toast('Đã chép link', 'ok'))
                .catch(() => toast('Không chép được — chọn tay rồi copy', 'danger'))
            }}
          >
            Chép link
          </Button>
          <Button variant="primary" onClick={onClose}>
            Xong
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-[length:var(--fs-b2)] text-ink-body">
          Gửi cho nhân viên qua Zalo. Mở link một lần trên điện thoại của họ là máy nhớ, sau đó chỉ
          cần PIN.
        </p>
        <code className="rounded-sm border border-line-2 bg-canvas px-3 py-2 font-mono text-[length:var(--fs-c1)] break-all text-ink-hi">
          {issued?.url}
        </code>
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          Link chỉ hiện đúng một lần — đóng hộp này là không xem lại được, mất thì cấp lại. Cấp lại
          làm link cũ ngừng hoạt động ngay, kể cả khi nó đang mở trên một máy khác.
        </p>
      </div>
    </Modal>
  )
}

function toInput(row: EmployeeRow): EmployeeInput {
  const { id: _id, fullName: _name, code: _code, ...input } = row
  return input
}

function EmployeeForm({
  draft,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: EmployeeInput
  onChange: (next: EmployeeInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof EmployeeInput>(key: K, value: EmployeeInput[K]) =>
    onChange({ ...draft, [key]: value })

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Vị trí">
          <Input
            value={draft.position}
            onChange={(v) => set('position', v)}
            placeholder="Bếp chính"
          />
        </Field>

        <Field label="Cách trả lương">
          <select
            value={draft.payKind}
            onChange={(e) => set('payKind', e.target.value as PayKind)}
            className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
          >
            <option value="hourly">Theo giờ</option>
            <option value="monthly">Theo tháng</option>
          </select>
        </Field>

        {draft.payKind === 'hourly' ? (
          <Field label="Đơn giá giờ (₫)">
            <Input
              type="number"
              value={String(draft.hourlyRateVnd)}
              onChange={(v) => set('hourlyRateVnd', Number(v) || 0)}
            />
          </Field>
        ) : (
          <Field label="Lương cơ bản tháng (₫)">
            <Input
              type="number"
              value={String(draft.monthlySalaryVnd)}
              onChange={(v) => set('monthlySalaryVnd', Number(v) || 0)}
            />
          </Field>
        )}

        <Field label="Phụ cấp cố định mỗi kỳ (₫)">
          <Input
            type="number"
            value={String(draft.fixedAllowanceVnd)}
            onChange={(v) => set('fixedAllowanceVnd', Number(v) || 0)}
          />
        </Field>

        <Field label="Ngày vào làm">
          <Input type="date" value={draft.startedOn} onChange={(v) => set('startedOn', v)} />
        </Field>
        <Field label="Tài khoản nhận lương">
          <Input
            value={draft.bankAccount ?? ''}
            onChange={(v) => set('bankAccount', v || null)}
            placeholder="0021000123456"
          />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <Toggle onChange={() => set('active', !draft.active)} on={draft.active} tone="ok">
          {draft.active ? 'Đang làm việc' : 'Đã nghỉ'}
        </Toggle>
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel}>Bỏ</Button>
          <Button variant="primary" onClick={onSave} disabled={saving}>
            Lưu hồ sơ
          </Button>
        </div>
      </div>

      <p className="mt-4 text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Trả theo tháng thì lương cơ bản vẫn đủ dù công thiếu, nhưng tăng ca tính theo đơn giá giờ
        quy đổi từ số giờ chuẩn tháng (đặt ở Trung tâm tham số A6).
      </p>
    </section>
  )
}
