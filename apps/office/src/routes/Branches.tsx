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

  const branches = useQuery({ queryKey: ['admin-branches'], queryFn: api.branches })

  return (
    <>
      <PageHeader
        title="Chi nhánh"
        subtitle="Thông tin liên hệ đổ ra trang Không gian, trang Liên hệ, chân trang website và chân hoá đơn. Giờ mở cửa còn là nguồn dựng lưới đặt bàn."
      />
      <div className="grid min-h-0 flex-1 gap-4 overflow-y-auto px-8 pb-8">
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
