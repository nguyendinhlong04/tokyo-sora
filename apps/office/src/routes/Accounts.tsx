import { ROLES, ROLE_LABELS, type Role } from '@sora/contracts'
import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type AccountInput, type AccountRow, type RoleGrant } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Field } from '../components/report'

/**
 * A1 — Tài khoản.
 *
 * Đây là cửa DUY NHẤT tạo người trong hệ thống: H1 (hồ sơ nhân viên) cố ý không
 * tạo người mới, vì một người có hồ sơ lương mà không đăng nhập được thì không ai
 * chấm công cho họ. Thứ tự đúng là tạo tài khoản ở đây, rồi mở H1 gắn hồ sơ lương.
 *
 * Hai cửa đăng nhập tách nhau và một tài khoản có thể có cả hai:
 * **email + mật khẩu** vào Office (máy tính của quản lý), **PIN** vào POS/KDS/kiosk
 * (chỉ chạy được trên thiết bị đã ghép ở A4). Người pha chế cần PIN mà không cần
 * email; kế toán thì ngược lại.
 *
 * Không có nút xoá. Người nghỉ việc thì chuyển sang ngừng hoạt động — đơn cũ,
 * phiếu chi cũ và phiếu lương cũ đều trỏ về tài khoản này, xoá là cắt mất tên
 * người thao tác trên hàng nghìn bản ghi lịch sử.
 */

const blank = (): AccountInput => ({
  code: '',
  fullName: '',
  phone: null,
  email: null,
  active: true,
  password: null,
  pin: null,
  roles: [],
})

export function Accounts() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<AccountInput | null>(null)
  const [editing, setEditing] = useState<number | null>(null)

  const accounts = useQuery({ queryKey: ['accounts'], queryFn: api.accounts })
  const branches = useQuery({ queryKey: ['admin-branches'], queryFn: api.branches })

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: ['accounts'] })
    void queryClient.invalidateQueries({ queryKey: ['role-assignments'] })
  }

  const create = useMutation({
    mutationFn: (input: AccountInput) => api.createAccount(input),
    onSuccess: (row) => {
      toast(`Đã lập tài khoản ${row.fullName}`, 'ok')
      setDraft(null)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const list = accounts.data ?? []
  const branchList = branches.data ?? []

  return (
    <>
      <PageHeader
        title="Tài khoản"
        subtitle="Ai đăng nhập được, bằng cửa nào, với vai trò gì ở chi nhánh nào. Lập tài khoản ở đây trước, rồi mở H1 gắn hồ sơ lương."
        action={
          draft ? null : (
            <Button variant="primary" onClick={() => setDraft(blank())}>
              Lập tài khoản
            </Button>
          )
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {accounts.isError ? <ErrorState message={(accounts.error as Error).message} /> : null}

        {draft ? (
          <AccountForm
            draft={draft}
            branches={branchList}
            onChange={setDraft}
            onCancel={() => setDraft(null)}
            onSave={() => create.mutate(draft)}
            saving={create.isPending}
          />
        ) : null}

        <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
          <div className="grid grid-cols-[200px_1fr_190px_150px_90px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
            <span>Người</span>
            <span>Vai trò đã phân</span>
            <span>Đăng nhập bằng</span>
            <span>Email</span>
            <span />
          </div>

          {accounts.isPending ? (
            <p className="px-5 py-4 text-ink-mute">Đang tải…</p>
          ) : list.length === 0 ? (
            <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
              Chưa có tài khoản nào.
            </p>
          ) : (
            list.map((row) => (
              <AccountLine
                key={row.id}
                row={row}
                branches={branchList}
                open={editing === row.id}
                onToggle={() => setEditing(editing === row.id ? null : row.id)}
                onChanged={refresh}
              />
            ))
          )}
        </div>

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Chưa có trong bản dựng này: người dùng tự đổi mật khẩu của mình, và 2FA cho vai trò nhạy
          cảm. Đổi mật khẩu hay PIN ở đây sẽ cắt mọi phiên đang mở của người đó — họ phải đăng nhập
          lại, và đó là điều đúng khi lý do đổi là nghi lộ.
        </p>
      </div>
    </>
  )
}

function AccountLine({
  row,
  branches,
  open,
  onToggle,
  onChanged,
}: {
  row: AccountRow
  branches: { id: string; name: string }[]
  open: boolean
  onToggle: () => void
  onChanged: () => void
}) {
  const toast = useToast()

  const run = <T,>(fn: () => Promise<T>, ok: string) =>
    fn()
      .then(() => {
        toast(ok, 'ok')
        onChanged()
      })
      .catch((err: Error) => toast(err.message, 'danger'))

  return (
    <div className={`border-b border-line-1 last:border-b-0 ${row.active ? '' : 'opacity-60'}`}>
      <div className="grid grid-cols-[200px_1fr_190px_150px_90px] items-center gap-3 px-5 py-2.5">
        <span className="min-w-0">
          <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
            {row.fullName}
          </span>
          <span className="mt-0.5 block font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {row.code}
            {row.active ? '' : ' · đã ngừng'}
          </span>
        </span>

        <span className="flex flex-wrap gap-1.5">
          {row.roles.length === 0 ? (
            <span className="text-[length:var(--fs-c1)] text-danger">Chưa có vai trò</span>
          ) : (
            row.roles.map((grant) => (
              <span
                key={`${grant.roleCode}:${grant.branchId ?? '*'}`}
                className="inline-flex h-[22px] items-center rounded-pill border border-line-3 px-2 text-[length:var(--fs-c2)] text-ink-body"
              >
                {grant.roleCode}
                <span className="ml-1 text-ink-mute">
                  {grant.branchId ?? 'toàn chuỗi'}
                </span>
              </span>
            ))
          )}
        </span>

        <span className="flex gap-1.5">
          {row.hasPassword ? <Badge tone="accent">Office</Badge> : null}
          {row.hasPin ? <Badge tone="info">PIN</Badge> : null}
          {!row.hasPassword && !row.hasPin ? <Badge tone="danger">Không vào được</Badge> : null}
        </span>

        <span className="truncate text-[length:var(--fs-c1)] text-ink-mute">{row.email ?? '—'}</span>

        <span className="flex justify-end">
          <button
            type="button"
            onClick={onToggle}
            className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
          >
            {open ? 'Đóng' : 'Sửa'}
          </button>
        </span>
      </div>

      {open ? (
        <AccountEditor
          row={row}
          branches={branches}
          onSaveInfo={(patch) => run(() => api.updateAccount(row.id, patch), 'Đã lưu tài khoản')}
          onSetRoles={(roles) => run(() => api.setAccountRoles(row.id, roles), 'Đã đổi vai trò')}
          onSetPassword={(value) =>
            run(() => api.setAccountPassword(row.id, value), 'Đã đặt mật khẩu Office')
          }
          onSetPin={(value) => run(() => api.setAccountPin(row.id, value), 'Đã đặt PIN')}
        />
      ) : null}
    </div>
  )
}

function AccountEditor({
  row,
  branches,
  onSaveInfo,
  onSetRoles,
  onSetPassword,
  onSetPin,
}: {
  row: AccountRow
  branches: { id: string; name: string }[]
  onSaveInfo: (patch: Partial<AccountRow>) => void
  onSetRoles: (roles: RoleGrant[]) => void
  onSetPassword: (value: string) => void
  onSetPin: (value: string) => void
}) {
  const [info, setInfo] = useState({
    code: row.code,
    fullName: row.fullName,
    phone: row.phone,
    email: row.email,
    active: row.active,
  })
  const [roles, setRoles] = useState<RoleGrant[]>(row.roles)
  const [password, setPassword] = useState('')
  const [pin, setPin] = useState('')

  return (
    <div className="border-t border-line-1 bg-canvas px-5 py-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Mã nhân viên">
          <Input value={info.code} onChange={(v) => setInfo({ ...info, code: v })} mono />
        </Field>
        <Field label="Họ tên">
          <Input value={info.fullName} onChange={(v) => setInfo({ ...info, fullName: v })} />
        </Field>
        <Field label="Điện thoại">
          <Input value={info.phone ?? ''} onChange={(v) => setInfo({ ...info, phone: v || null })} mono />
        </Field>
        <Field label="Email đăng nhập Office">
          <Input value={info.email ?? ''} onChange={(v) => setInfo({ ...info, email: v || null })} />
        </Field>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={() => setInfo({ ...info, active: !info.active })}
          className={`h-9 rounded-sm border px-3 text-[length:var(--fs-c1)] ${
            info.active ? 'border-ok text-ok' : 'border-line-3 text-ink-mute'
          }`}
        >
          {info.active ? 'Đang hoạt động' : 'Đã ngừng'}
        </button>
        <Button onClick={() => onSaveInfo(info)}>Lưu thông tin</Button>
      </div>

      <div className="mt-6 border-t border-line-1 pt-5">
        <RolePicker branches={branches} value={roles} onChange={setRoles} />
        <Button className="mt-4" onClick={() => onSetRoles(roles)}>
          Lưu vai trò
        </Button>
      </div>

      <div className="mt-6 grid gap-4 border-t border-line-1 pt-5 lg:grid-cols-2">
        <div>
          <Field label="Đặt lại mật khẩu Office (tối thiểu 8 ký tự)">
            <Input value={password} onChange={setPassword} type="password" />
          </Field>
          <Button
            className="mt-3"
            disabled={password.length < 8}
            onClick={() => {
              onSetPassword(password)
              setPassword('')
            }}
          >
            Đặt mật khẩu
          </Button>
        </div>
        <div>
          <Field label="Đặt lại PIN vận hành (4–6 chữ số)">
            <Input value={pin} onChange={(v) => setPin(v.replace(/\D/g, '').slice(0, 6))} mono />
          </Field>
          <Button
            className="mt-3"
            disabled={pin.length < 4}
            onClick={() => {
              onSetPin(pin)
              setPin('')
            }}
          >
            Đặt PIN
          </Button>
        </div>
      </div>
    </div>
  )
}

function AccountForm({
  draft,
  branches,
  onChange,
  onCancel,
  onSave,
  saving,
}: {
  draft: AccountInput
  branches: { id: string; name: string }[]
  onChange: (next: AccountInput) => void
  onCancel: () => void
  onSave: () => void
  saving: boolean
}) {
  const set = <K extends keyof AccountInput>(key: K, value: AccountInput[K]) =>
    onChange({ ...draft, [key]: value })

  const ready =
    draft.code.trim() !== '' &&
    draft.fullName.trim() !== '' &&
    draft.roles.length > 0 &&
    (draft.pin !== null || (draft.password !== null && draft.email !== null))

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-5">
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Mã nhân viên">
          <Input value={draft.code} onChange={(v) => set('code', v)} placeholder="PV07" mono />
        </Field>
        <Field label="Họ tên">
          <Input value={draft.fullName} onChange={(v) => set('fullName', v)} placeholder="Nguyễn Văn A" />
        </Field>
        <Field label="Điện thoại">
          <Input value={draft.phone ?? ''} onChange={(v) => set('phone', v || null)} mono />
        </Field>
        <Field label="Email (chỉ cần nếu vào Office)">
          <Input value={draft.email ?? ''} onChange={(v) => set('email', v || null)} />
        </Field>
        <Field label="Mật khẩu Office">
          <Input
            value={draft.password ?? ''}
            onChange={(v) => set('password', v || null)}
            type="password"
          />
        </Field>
        <Field label="PIN vận hành (4–6 số)">
          <Input
            value={draft.pin ?? ''}
            onChange={(v) => set('pin', v.replace(/\D/g, '').slice(0, 6) || null)}
            mono
          />
        </Field>
      </div>

      <div className="mt-5 border-t border-line-1 pt-5">
        <RolePicker branches={branches} value={draft.roles} onChange={(roles) => set('roles', roles)} />
      </div>

      <div className="mt-5 flex items-center gap-2">
        <p className="text-[length:var(--fs-c1)] text-ink-mute">
          Cần ít nhất một vai trò và một cách đăng nhập.
        </p>
        <div className="ml-auto flex gap-2">
          <Button onClick={onCancel}>Bỏ</Button>
          <Button variant="primary" disabled={!ready || saving} onClick={onSave}>
            Lập tài khoản
          </Button>
        </div>
      </div>
    </section>
  )
}

/**
 * Lưới vai trò × chi nhánh.
 *
 * Cột "Toàn chuỗi" là phạm vi thật của hệ thống (`staff_roles.branch_id` để
 * trống), không phải nút tắt chọn hết chi nhánh: chủ quán và quản lý chuỗi giữ
 * vai trò ở cấp chuỗi nên chi nhánh mở sau này họ vẫn có quyền ngay.
 */
function RolePicker({
  branches,
  value,
  onChange,
}: {
  branches: { id: string; name: string }[]
  value: RoleGrant[]
  onChange: (next: RoleGrant[]) => void
}) {
  const has = (role: Role, branchId: string | null) =>
    value.some((g) => g.roleCode === role && g.branchId === branchId)

  const toggle = (role: Role, branchId: string | null) => {
    onChange(
      has(role, branchId)
        ? value.filter((g) => !(g.roleCode === role && g.branchId === branchId))
        : [...value, { roleCode: role, branchId }],
    )
  }

  // R0 là khách quét QR, không phải người có tài khoản
  const assignable = ROLES.filter((r) => r !== 'R0')

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-[length:var(--fs-c1)]">
        <thead>
          <tr>
            <th className="w-[240px] px-2 py-2 text-left font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Vai trò
            </th>
            <th className="w-[110px] px-2 py-2 font-semibold tracking-[0.1em] text-ink-mute uppercase">
              Toàn chuỗi
            </th>
            {branches.map((b) => (
              <th
                key={b.id}
                className="w-[110px] px-2 py-2 font-semibold tracking-[0.1em] text-ink-mute uppercase"
              >
                {b.name}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {assignable.map((role) => (
            <tr key={role} className="border-t border-line-1">
              <td className="px-2 py-1.5 text-ink-body">
                <span className="font-mono text-ink-mute">{role}</span> {ROLE_LABELS[role]}
              </td>
              {[null, ...branches.map((b) => b.id)].map((branchId) => (
                <td key={branchId ?? '*'} className="px-2 py-1.5 text-center">
                  <input
                    type="checkbox"
                    checked={has(role, branchId)}
                    onChange={() => toggle(role, branchId)}
                    className="size-4 accent-[var(--color-accent-strong)]"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
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
