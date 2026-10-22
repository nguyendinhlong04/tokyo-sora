import { ROLE_LABELS, ROLES, type DocTarget, type OrgChart, type Role } from '@sora/contracts'
import { Button } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from '../../api'
import { IconClose } from '../icons'
import { Field, ListHead, SegmentedControl, Select, Toggle } from '../form'
import { buildForest, flatten } from './model'

type TargetKind = DocTarget['kind']

const KINDS: { value: TargetKind; label: string }[] = [
  { value: 'toan-chuoi', label: 'Toàn chuỗi' },
  { value: 'chi-nhanh', label: 'Chi nhánh' },
  { value: 'don-vi', label: 'Đơn vị' },
  { value: 'chuc-danh', label: 'Chức danh' },
  { value: 'vai-tro', label: 'Vai trò' },
  { value: 'ca-nhan', label: 'Cá nhân' },
]

const ROLE_OPTIONS = ROLES.filter((r) => r !== 'R0').map((r) => ({
  value: r,
  label: `${r} · ${ROLE_LABELS[r]}`,
}))

/** Mô tả một quy tắc bằng chữ — dùng cả ở chip lẫn trang xem văn bản */
export function describeTarget(t: DocTarget, chart: OrgChart | undefined): string {
  const unit = (id: number) => chart?.units.find((u) => u.id === id)?.name ?? `đơn vị #${id}`
  const branch = (id: string) => chart?.units.find((u) => u.branchId === id)?.name ?? id
  switch (t.kind) {
    case 'toan-chuoi':
      return 'Toàn chuỗi'
    case 'chi-nhanh':
      return `Chi nhánh ${branch(t.branchId)}`
    case 'don-vi':
      return `${unit(t.unitId)}${t.includeChildren ? ' (gồm đơn vị con)' : ''}`
    case 'chuc-danh': {
      const p = chart?.positions.find((x) => x.id === t.positionId)
      return p ? `${p.title} · ${unit(p.unitId)}` : `chức danh #${t.positionId}`
    }
    case 'vai-tro':
      return `${ROLE_LABELS[t.role]}${t.branchId ? ` · ${branch(t.branchId)}` : ' · mọi chi nhánh'}`
    case 'ca-nhan': {
      const holder = chart?.positions.flatMap((p) => p.holders).find((h) => h.staffId === t.staffId)
      const free = chart?.unassigned.find((p) => p.staffId === t.staffId)
      return holder?.fullName ?? free?.fullName ?? `người #${t.staffId}`
    }
  }
}

const sameTarget = (a: DocTarget, b: DocTarget) => JSON.stringify(a) === JSON.stringify(b)

/**
 * Chọn nơi nhận văn bản bằng QUY TẮC (chi nhánh, đơn vị, chức danh, vai trò,
 * cá nhân) chứ không bằng danh sách tên: danh sách người cụ thể được máy chủ chụp
 * lúc ký, theo đúng sơ đồ ngày hôm đó. Dòng "ước tính" hỏi máy chủ cùng quy tắc.
 */
export function RecipientPicker({
  value,
  onChange,
  chart,
  disabled = false,
}: {
  value: DocTarget[]
  onChange: (next: DocTarget[]) => void
  chart: OrgChart | undefined
  disabled?: boolean
}) {
  const [kind, setKind] = useState<TargetKind>('chi-nhanh')
  const [pick, setPick] = useState('')
  const [role, setRole] = useState<Role | ''>('')
  const [includeChildren, setIncludeChildren] = useState(true)

  const forest = useMemo(() => buildForest(chart?.units ?? []), [chart])
  const people = useMemo(() => {
    const out = new Map<number, string>()
    for (const p of chart?.positions ?? []) {
      for (const h of p.holders)
        if (!out.has(h.staffId)) out.set(h.staffId, `${h.fullName} — ${p.title}`)
    }
    for (const p of chart?.unassigned ?? []) if (!out.has(p.staffId)) out.set(p.staffId, p.fullName)
    return [...out.entries()]
      .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
      .map(([id, label]) => ({ value: String(id), label }))
  }, [chart])
  const branches = (chart?.units ?? [])
    .filter((u) => u.kind === 'chi-nhanh')
    .map((u) => ({ value: u.branchId!, label: u.name }))

  const options =
    kind === 'chi-nhanh'
      ? branches
      : kind === 'don-vi'
        ? flatten(forest).map(({ unit, depth }) => ({
            value: String(unit.id),
            label: `${'— '.repeat(depth)}${unit.name}`,
          }))
        : kind === 'chuc-danh'
          ? (chart?.positions ?? []).map((p) => ({
              value: String(p.id),
              label: `${p.title} · ${forest.byId.get(p.unitId)?.name ?? ''}`,
            }))
          : kind === 'ca-nhan'
            ? people
            : []

  const build = (): DocTarget | null => {
    switch (kind) {
      case 'toan-chuoi':
        return { kind }
      case 'chi-nhanh':
        return pick ? { kind, branchId: pick } : null
      case 'don-vi':
        return pick ? { kind, unitId: Number(pick), includeChildren } : null
      case 'chuc-danh':
        return pick ? { kind, positionId: Number(pick) } : null
      case 'vai-tro':
        return role ? { kind, role, branchId: pick || null } : null
      case 'ca-nhan':
        return pick ? { kind, staffId: Number(pick) } : null
    }
  }
  const next = build()

  const audience = useQuery({
    queryKey: ['doc-audience', JSON.stringify(value)],
    queryFn: () => api.documentAudience(value),
    enabled: value.length > 0,
    placeholderData: (previous) => previous,
  })

  return (
    <div>
      <ListHead
        label="Nơi nhận"
        hint="Khai theo quy tắc — danh sách người cụ thể chụp lại lúc ký, đúng sơ đồ ngày ký."
      />
      <div className="flex flex-wrap gap-2">
        {value.map((t, i) => (
          <span
            key={i}
            className="inline-flex items-center gap-1 rounded-sm border border-line-2 py-1 pr-1 pl-2.5 text-[length:var(--fs-c1)] text-ink-hi"
          >
            {describeTarget(t, chart)}
            {!disabled ? (
              <button
                type="button"
                aria-label={`Bỏ ${describeTarget(t, chart)}`}
                onClick={() => onChange(value.filter((_, j) => j !== i))}
                className="grid size-6 place-items-center rounded-sm text-ink-mute hover:bg-surface-3 hover:text-ink-hi"
              >
                <IconClose />
              </button>
            ) : null}
          </span>
        ))}
        {value.length === 0 ? (
          <span className="text-[length:var(--fs-c1)] text-ink-mute">Chưa chọn nơi nhận.</span>
        ) : null}
      </div>

      {!disabled ? (
        <div className="mt-3 grid gap-3 rounded-md border border-line-1 bg-canvas p-3">
          <SegmentedControl
            value={kind}
            onChange={(k) => {
              setKind(k)
              setPick('')
              setRole('')
            }}
            options={KINDS}
          />
          <div className="flex flex-wrap items-end gap-3">
            {kind === 'vai-tro' ? (
              <>
                <Field label="Vai trò">
                  <Select
                    value={role}
                    width={220}
                    placeholder="Chọn vai trò"
                    options={ROLE_OPTIONS}
                    onChange={setRole}
                  />
                </Field>
                <Field label="Ở chi nhánh">
                  <Select
                    value={pick}
                    width={200}
                    placeholder="Mọi chi nhánh"
                    options={branches}
                    onChange={setPick}
                  />
                </Field>
              </>
            ) : kind !== 'toan-chuoi' ? (
              <Field label={KINDS.find((k) => k.value === kind)!.label}>
                <Select
                  value={pick}
                  width={320}
                  placeholder="Chọn…"
                  options={options}
                  onChange={setPick}
                />
              </Field>
            ) : null}
            {kind === 'don-vi' ? (
              <Toggle on={includeChildren} onChange={setIncludeChildren}>
                Gồm đơn vị con
              </Toggle>
            ) : null}
            <Button
              size="sm"
              disabled={!next || value.some((t) => sameTarget(t, next))}
              onClick={() => {
                if (!next) return
                onChange([...value, next])
                setPick('')
              }}
            >
              + Thêm nơi nhận
            </Button>
          </div>
        </div>
      ) : null}

      {value.length > 0 ? (
        <p className="mt-2 text-[length:var(--fs-c1)] text-ink-body">
          Ước tính <span className="font-mono tabular-nums">{audience.data?.count ?? '…'}</span>{' '}
          người nhận (không tính người soạn và người ký).
        </p>
      ) : null}
    </div>
  )
}
