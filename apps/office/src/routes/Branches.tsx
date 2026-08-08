import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { api, type BranchRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

/**
 * A10 — Chi nhánh.
 *
 * "Sửa một chỗ mọi nơi đổi": địa chỉ và điện thoại ở đây đổ thẳng ra W5, W9, chân
 * trang website và chân hoá đơn. Giờ mở cửa còn đi xa hơn — miền đặt bàn đọc
 * chính chuỗi này để dựng lưới khung giờ của W6, nên gõ sai là chi nhánh ngừng
 * nhận đặt.
 */
export function Branches() {
  const { can } = useSession()
  const mayEdit = can('admin.manage-accounts-roles')
  const [adding, setAdding] = useState(false)

  const branches = useQuery({ queryKey: ['admin-branches'], queryFn: api.branches })

  return (
    <>
      <PageHeader
        title="Chi nhánh"
        subtitle="Thông tin liên hệ đổ ra trang Không gian, trang Liên hệ, chân trang website và chân hoá đơn. Giờ mở cửa còn là nguồn dựng lưới đặt bàn."
        action={
          mayEdit && !adding ? (
            <Button variant="primary" onClick={() => setAdding(true)}>
              Thêm chi nhánh
            </Button>
          ) : null
        }
      />
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-8 pb-8">
        {adding ? <NewBranchCard onDone={() => setAdding(false)} /> : null}
        {branches.isPending ? (
          <p className="text-ink-mute">Đang tải…</p>
        ) : (
          branches.data!.map((branch) => (
            <BranchCard key={branch.id} branch={branch} disabled={!mayEdit} />
          ))
        )}
      </div>
    </>
  )
}

const blankBranch = (): Omit<BranchRow, 'timezone'> => ({
  id: '',
  name: '',
  address: null,
  phone: null,
  email: null,
  openHours: null,
  active: true,
})

/**
 * Mở thêm chi nhánh.
 *
 * Chi nhánh dựng ra là RỖNG — chưa khu, chưa bàn, chưa vùng giao. Nói thẳng điều
 * đó trên màn kèm chỗ phải đi tiếp, vì người vừa tạo xong sẽ mở website ra xem và
 * thấy một chi nhánh không đặt bàn được, rồi tưởng hỏng.
 */
function NewBranchCard({ onDone }: { onDone: () => void }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(blankBranch())
  const set = (patch: Partial<BranchRow>) => setDraft((d) => ({ ...d, ...patch }))

  const create = useMutation({
    mutationFn: () => api.createBranch(draft),
    onSuccess: (row) => {
      toast(`Đã mở chi nhánh ${row.name} — xếp bàn ở A3, khai vùng giao ở O10`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['admin-branches'] })
      onDone()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const maHopLe = /^[a-z0-9-]{2,12}$/.test(draft.id.trim().toLowerCase())
  const dayDu = maHopLe && draft.name.trim() !== ''

  return (
    <section className="rounded-md border border-accent bg-surface-1 p-6">
      <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">Chi nhánh mới</h2>
      <p className="mt-1.5 max-w-[760px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
        Chi nhánh mở ra chưa có khu và bàn nào — xếp sơ đồ ở <b>A3 · Sơ đồ bàn</b>, khai vùng giao
        và phí ở <b>O10 · Vùng giao &amp; phí</b>. Chừng nào chưa có bàn thì trang Đặt bàn chưa
        hiện chỗ trống cho chi nhánh này.
      </p>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Field
          label="Mã chi nhánh"
          hint="Chữ thường không dấu, số và gạch ngang. Mã này đi vào đường dẫn công khai (/dat-mon/ma) nên đặt xong KHÔNG đổi được."
        >
          <input
            value={draft.id}
            onChange={(e) => set({ id: e.target.value })}
            placeholder="ht"
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field label="Tên hiển thị">
          <input
            value={draft.name}
            onChange={(e) => set({ name: e.target.value })}
            placeholder="Hà Tĩnh"
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field label="Địa chỉ">
          <input
            value={draft.address ?? ''}
            onChange={(e) => set({ address: e.target.value })}
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field label="Điện thoại">
          <input
            value={draft.phone ?? ''}
            onChange={(e) => set({ phone: e.target.value })}
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={draft.email ?? ''}
            onChange={(e) => set({ email: e.target.value })}
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field
          label="Giờ mở cửa"
          hint="Mẫu: 11:00–14:00 · 17:00–23:00 — bỏ trống cũng được, khai sau ở thẻ bên dưới"
        >
          <input
            value={draft.openHours ?? ''}
            onChange={(e) => set({ openHours: e.target.value })}
            placeholder="11:00–14:00 · 17:00–23:00"
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Button variant="primary" disabled={!dayDu || create.isPending} onClick={() => create.mutate()}>
          Mở chi nhánh
        </Button>
        <Button onClick={onDone}>Bỏ</Button>
        {draft.id.trim() !== '' && !maHopLe ? (
          <span className="text-[length:var(--fs-c1)] text-danger">
            Mã chỉ gồm chữ thường không dấu, số và gạch ngang, dài 2–12 ký tự
          </span>
        ) : null}
      </div>
    </section>
  )
}

function BranchCard({ branch, disabled }: { branch: BranchRow; disabled: boolean }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState(branch)

  useEffect(() => setDraft(branch), [branch])

  const save = useMutation({
    mutationFn: () =>
      api.updateBranch(branch.id, {
        name: draft.name,
        address: draft.address,
        phone: draft.phone,
        email: draft.email,
        openHours: draft.openHours,
        active: draft.active,
      }),
    onSuccess: () => {
      toast(`Đã lưu ${draft.name}`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['admin-branches'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const dirty = JSON.stringify(draft) !== JSON.stringify(branch)
  const set = (patch: Partial<BranchRow>) => setDraft((d) => ({ ...d, ...patch }))

  return (
    <section className="rounded-md border border-line-1 bg-surface-1 p-6">
      <div className="flex items-baseline gap-3">
        <h2 className="text-[length:var(--fs-t2)] font-semibold text-ink-hi">{branch.name}</h2>
        <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">{branch.id}</span>
        {!branch.active ? (
          <span className="rounded-sm bg-danger/12 px-2 py-0.5 text-[length:var(--fs-c2)] text-danger">
            Đang ngừng hoạt động
          </span>
        ) : null}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        <Field label="Tên hiển thị">
          <input
            value={draft.name}
            disabled={disabled}
            onChange={(e) => set({ name: e.target.value })}
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field label="Điện thoại">
          <input
            value={draft.phone ?? ''}
            disabled={disabled}
            onChange={(e) => set({ phone: e.target.value })}
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field label="Địa chỉ">
          <input
            value={draft.address ?? ''}
            disabled={disabled}
            onChange={(e) => set({ address: e.target.value })}
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field label="Email">
          <input
            type="email"
            value={draft.email ?? ''}
            disabled={disabled}
            onChange={(e) => set({ email: e.target.value })}
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field
          label="Giờ mở cửa"
          hint="Mẫu: 11:00–14:00 · 17:00–23:00 — mỗi ca một khoảng, ngăn nhau bằng dấu ·"
        >
          <input
            value={draft.openHours ?? ''}
            disabled={disabled}
            onChange={(e) => set({ openHours: e.target.value })}
            placeholder="11:00–14:00 · 17:00–23:00"
            className="h-10 w-full rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
          />
        </Field>
        <Field label="Trạng thái">
          <button
            type="button"
            disabled={disabled}
            onClick={() => set({ active: !draft.active })}
            className={`h-10 rounded-sm border px-4 text-[length:var(--fs-b2)] ${
              draft.active ? 'border-ok text-ok' : 'border-line-3 text-ink-mute'
            }`}
          >
            {draft.active ? 'Đang hoạt động' : 'Ngừng hoạt động'}
          </button>
        </Field>
      </div>

      {dirty ? (
        <div className="mt-5 flex gap-2">
          <Button variant="primary" disabled={save.isPending} onClick={() => save.mutate()}>
            Lưu thay đổi
          </Button>
          <Button onClick={() => setDraft(branch)}>Bỏ sửa</Button>
        </div>
      ) : null}
    </section>
  )
}

function Field({
  label,
  hint,
  children,
}: {
  label: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
        {label}
      </span>
      {children}
      {hint ? <span className="mt-1.5 block text-[length:var(--fs-c1)] text-ink-mute">{hint}</span> : null}
    </label>
  )
}
