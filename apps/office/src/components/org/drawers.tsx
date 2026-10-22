import {
  ASSIGNMENT_KIND_LABELS,
  ORG_UNIT_KIND_LABELS,
  ROLE_LABELS,
  ROLES,
  type AssignmentKind,
  type OrgChart,
  type OrgPositionView,
  type OrgUnitKind,
  type OrgUnitView,
  type Role,
} from '@sora/contracts'
import { ApiError } from '@sora/core'
import { Badge, Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState, type ReactNode } from 'react'
import { api } from '../../api'
import { Drawer } from '../Drawer'
import {
  DateInput,
  Field,
  LineList,
  ListHead,
  NumberInput,
  SegmentedControl,
  Select,
  TextInput,
  Toggle,
} from '../form'
import { ancestorsOf, descendantIds, flatten, staffing, staffingLabel, type Forest } from './model'

const ROLE_OPTIONS = ROLES.filter((r) => r !== 'R0').map((r) => ({
  value: r,
  label: `${r} · ${ROLE_LABELS[r]}`,
}))

const CHILD_KINDS: { value: Exclude<OrgUnitKind, 'cong-ty' | 'chi-nhanh'>; label: string }[] = [
  { value: 'khoi', label: ORG_UNIT_KIND_LABELS.khoi },
  { value: 'phong', label: ORG_UNIT_KIND_LABELS.phong },
  { value: 'bo-phan', label: ORG_UNIT_KIND_LABELS['bo-phan'] },
  { value: 'to', label: ORG_UNIT_KIND_LABELS.to },
]

const formatDay = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`

/** Sau mọi thao tác sửa sơ đồ: sơ đồ, bảng chức danh, H1 cùng đọc lại */
function useOrgRefresh() {
  const queryClient = useQueryClient()
  return () => {
    void queryClient.invalidateQueries({ queryKey: ['org'] })
    void queryClient.invalidateQueries({ queryKey: ['employees'] })
  }
}

const Section = ({ children }: { children: ReactNode }) => (
  <section className="border-t border-line-1 pt-5 first:border-t-0 first:pt-0">{children}</section>
)

// ======================================================================= Đơn vị

/**
 * Ngăn kéo đơn vị: chức danh trong đơn vị, sửa tên/đơn vị cha/thứ tự, thêm đơn
 * vị con và chức danh, ngừng đơn vị.
 *
 * Đổi đơn vị cha bằng Ô CHỌN chứ không kéo thả: đổi cha là đổi phạm vi của mọi
 * quản lý phía trên — thả nhầm một lần là âm thầm mở hoặc đóng dữ liệu của cả
 * bộ phận. Ô chọn loại sẵn chính nó và cây con (thả vào cháu là vòng).
 */
export function UnitDrawer({
  unit,
  chart,
  forest,
  onClose,
  onOpenPosition,
}: {
  unit: OrgUnitView
  chart: OrgChart
  forest: Forest
  onClose: () => void
  onOpenPosition: (position: OrgPositionView) => void
}) {
  const toast = useToast()
  const refresh = useOrgRefresh()
  const canManage = chart.canManage
  const isRoot = unit.parentId === null
  const path = ancestorsOf(unit.id, forest)
    .reverse()
    .map((u) => u.name)
    .join(' › ')
  const positions = chart.positions.filter((p) => p.unitId === unit.id)

  const [form, setForm] = useState({
    name: unit.name,
    parentId: unit.parentId,
    sort: unit.sort,
    stationId: unit.stationId ?? '',
  })
  const [child, setChild] = useState<{
    kind: (typeof CHILD_KINDS)[number]['value']
    name: string
  } | null>(null)
  const [newPosition, setNewPosition] = useState<{
    title: string
    isHead: boolean
    headcount: number
    suggestedRole: Role | ''
  } | null>(null)
  const [confirmStop, setConfirmStop] = useState(false)

  const fail = (err: Error) => toast(err.message, 'danger')

  const save = useMutation({
    mutationFn: () =>
      api.updateOrgUnit(unit.id, {
        name: form.name.trim(),
        sort: form.sort,
        stationId: form.stationId.trim() || null,
        ...(isRoot || form.parentId === null ? {} : { parentId: form.parentId }),
      }),
    onSuccess: () => {
      toast('Đã lưu đơn vị', 'ok')
      refresh()
    },
    onError: fail,
  })

  const addChild = useMutation({
    mutationFn: () =>
      api.createOrgUnit({
        parentId: unit.id,
        kind: child!.kind,
        name: child!.name.trim(),
        branchId: null,
        stationId: null,
        sort: (forest.childrenOf.get(unit.id) ?? []).length,
      }),
    onSuccess: () => {
      toast('Đã thêm đơn vị con', 'ok')
      setChild(null)
      refresh()
    },
    onError: fail,
  })

  const addPosition = useMutation({
    mutationFn: () =>
      api.createPosition({
        unitId: unit.id,
        title: newPosition!.title.trim(),
        isHead: newPosition!.isHead,
        headcount: newPosition!.isHead ? 1 : newPosition!.headcount,
        suggestedRole: newPosition!.suggestedRole || null,
        duties: [],
        authorities: [],
        requirements: [],
        sort: positions.length,
      }),
    onSuccess: () => {
      toast('Đã thêm chức danh', 'ok')
      setNewPosition(null)
      refresh()
    },
    onError: fail,
  })

  const stop = useMutation({
    mutationFn: () => api.updateOrgUnit(unit.id, { active: false }),
    onSuccess: () => {
      toast('Đã ngừng đơn vị', 'ok')
      refresh()
      onClose()
    },
    onError: fail,
  })

  const excluded = descendantIds(unit.id, forest)
  const parentOptions = flatten(forest)
    .filter(({ unit: u }) => !excluded.has(u.id))
    .map(({ unit: u, depth }) => ({ value: String(u.id), label: `${'— '.repeat(depth)}${u.name}` }))

  return (
    <Drawer
      open
      onClose={onClose}
      title={unit.name}
      subtitle={
        <>
          {ORG_UNIT_KIND_LABELS[unit.kind]}
          {path ? ` · ${path}` : ''}
        </>
      }
      footer={
        canManage ? (
          <>
            <Button onClick={onClose}>Đóng</Button>
            <Button
              variant="primary"
              disabled={!form.name.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              Lưu đơn vị
            </Button>
          </>
        ) : (
          <Button onClick={onClose}>Đóng</Button>
        )
      }
    >
      <div className="grid gap-6">
        <Section>
          <ListHead
            label="Chức danh trong đơn vị"
            hint="Bấm một chức danh để xem mô tả công việc và người giữ."
          >
            {canManage ? (
              <Button
                size="sm"
                onClick={() =>
                  setNewPosition({ title: '', isHead: false, headcount: 1, suggestedRole: '' })
                }
              >
                + Thêm chức danh
              </Button>
            ) : null}
          </ListHead>
          <div className="grid gap-1.5">
            {positions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onOpenPosition(p)}
                className="flex items-center gap-3 rounded-sm border border-line-1 px-3 py-2 text-left transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:outline-accent"
              >
                <span className="min-w-0 flex-1 truncate text-[length:var(--fs-b2)] text-ink-hi">
                  {p.title}
                </span>
                {p.isHead ? <Badge tone="accent">Trưởng</Badge> : null}
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-body tabular-nums">
                  {staffing(p).filled}/{p.headcount}
                </span>
                <span className="w-[96px] text-right text-[length:var(--fs-c1)] text-ink-mute">
                  {staffingLabel(p)}
                </span>
              </button>
            ))}
            {positions.length === 0 ? (
              <p className="text-[length:var(--fs-c1)] text-ink-mute">
                Đơn vị chưa có chức danh nào.
              </p>
            ) : null}
          </div>

          {newPosition ? (
            <div className="mt-3 grid gap-3 rounded-md border border-accent bg-canvas p-4">
              <Field label="Tên chức danh">
                <TextInput
                  value={newPosition.title}
                  placeholder="Phục vụ"
                  onChange={(title) => setNewPosition({ ...newPosition, title })}
                />
              </Field>
              <div className="grid grid-cols-[auto_120px_1fr] items-end gap-3">
                <Toggle
                  on={newPosition.isHead}
                  onChange={() => setNewPosition({ ...newPosition, isHead: !newPosition.isHead })}
                >
                  Trưởng đơn vị
                </Toggle>
                <Field label="Định biên">
                  <NumberInput
                    value={newPosition.isHead ? 1 : newPosition.headcount}
                    disabled={newPosition.isHead}
                    onChange={(v) => setNewPosition({ ...newPosition, headcount: v ?? 0 })}
                  />
                </Field>
                <Field label="Vai trò gợi ý (A1)">
                  <Select
                    value={newPosition.suggestedRole}
                    placeholder="Không gợi ý"
                    options={ROLE_OPTIONS}
                    onChange={(suggestedRole) => setNewPosition({ ...newPosition, suggestedRole })}
                  />
                </Field>
              </div>
              <div className="flex justify-end gap-2">
                <Button size="sm" onClick={() => setNewPosition(null)}>
                  Bỏ
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  disabled={!newPosition.title.trim() || addPosition.isPending}
                  onClick={() => addPosition.mutate()}
                >
                  Thêm chức danh
                </Button>
              </div>
            </div>
          ) : null}
        </Section>

        {canManage ? (
          <Section>
            <ListHead label="Thông tin đơn vị" />
            <div className="grid gap-3">
              <Field label="Tên đơn vị">
                <TextInput value={form.name} onChange={(name) => setForm({ ...form, name })} />
              </Field>
              {!isRoot ? (
                <Field
                  label="Đơn vị cha"
                  hint="Đổi cha là đổi phạm vi của mọi quản lý phía trên — người, việc, văn bản đi theo cây."
                >
                  <Select
                    value={form.parentId === null ? '' : String(form.parentId)}
                    options={parentOptions}
                    onChange={(v) => setForm({ ...form, parentId: Number(v) })}
                  />
                </Field>
              ) : null}
              <div className="grid grid-cols-2 gap-3">
                <Field label="Thứ tự">
                  <NumberInput
                    value={form.sort}
                    onChange={(v) => setForm({ ...form, sort: v ?? 0 })}
                  />
                </Field>
                {unit.kind === 'to' || unit.kind === 'bo-phan' ? (
                  <Field label="Trạm bếp (nếu có)" hint="Để số đo bếp quy về đúng tổ.">
                    <TextInput
                      value={form.stationId}
                      placeholder="ST-06"
                      mono
                      onChange={(stationId) => setForm({ ...form, stationId })}
                    />
                  </Field>
                ) : null}
              </div>
            </div>
          </Section>
        ) : null}

        {canManage ? (
          <Section>
            <ListHead label="Đơn vị con">
              {!child ? (
                <Button size="sm" onClick={() => setChild({ kind: 'bo-phan', name: '' })}>
                  + Thêm đơn vị con
                </Button>
              ) : null}
            </ListHead>
            {(forest.childrenOf.get(unit.id) ?? []).map((u) => (
              <p key={u.id} className="text-[length:var(--fs-b2)] text-ink-body">
                {ORG_UNIT_KIND_LABELS[u.kind]} · {u.name}
              </p>
            ))}
            {child ? (
              <div className="mt-3 grid grid-cols-[160px_1fr] items-end gap-3 rounded-md border border-accent bg-canvas p-4">
                <Field label="Loại">
                  <Select
                    value={child.kind}
                    options={CHILD_KINDS}
                    onChange={(kind) => setChild({ ...child, kind })}
                  />
                </Field>
                <Field label="Tên">
                  <TextInput
                    value={child.name}
                    placeholder="Tổ lạnh"
                    onChange={(name) => setChild({ ...child, name })}
                  />
                </Field>
                <div className="col-span-2 flex justify-end gap-2">
                  <Button size="sm" onClick={() => setChild(null)}>
                    Bỏ
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!child.name.trim() || addChild.isPending}
                    onClick={() => addChild.mutate()}
                  >
                    Thêm đơn vị
                  </Button>
                </div>
              </div>
            ) : null}
          </Section>
        ) : null}

        {canManage && !isRoot ? (
          <Section>
            <ListHead
              label="Ngừng đơn vị"
              hint="Chỉ ngừng được khi không còn đơn vị con và không còn ai giữ chức danh. Không có xoá — lịch sử giữ lại."
            />
            {confirmStop ? (
              <div className="flex items-center gap-2">
                <span className="flex-1 text-[length:var(--fs-c1)] text-ink-body">
                  Ngừng “{unit.name}”? Đơn vị sẽ không còn hiện trên sơ đồ.
                </span>
                <Button size="sm" onClick={() => setConfirmStop(false)}>
                  Thôi
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  disabled={stop.isPending}
                  onClick={() => stop.mutate()}
                >
                  Ngừng đơn vị
                </Button>
              </div>
            ) : (
              <Button size="sm" variant="ghost" onClick={() => setConfirmStop(true)}>
                Ngừng đơn vị…
              </Button>
            )}
          </Section>
        ) : null}
      </div>
    </Drawer>
  )
}

// ==================================================================== Chức danh

type PositionTab = 'mo-ta' | 'nguoi-giu' | 'lich-su'

/**
 * Ngăn kéo chức danh: mô tả công việc chuẩn ba phần, người giữ (gán, điều chuyển,
 * kết thúc), lịch sử giữ chức.
 *
 * Vai trò gợi ý CHỈ để cảnh báo — sơ đồ không cấp quyền. Người được gán mà chưa
 * có vai trò đó thì hiện nhắc "cấp ở A1", không tự cấp.
 */
export function PositionDrawer({
  position,
  chart,
  forest,
  onClose,
}: {
  position: OrgPositionView
  chart: OrgChart
  forest: Forest
  onClose: () => void
}) {
  const [tab, setTab] = useState<PositionTab>('mo-ta')
  const unit = forest.byId.get(position.unitId)
  return (
    <Drawer
      open
      onClose={onClose}
      title={position.title}
      subtitle={
        <>
          {unit ? `${ORG_UNIT_KIND_LABELS[unit.kind]} ${unit.name}` : ''}
          {position.isHead ? ' · trưởng đơn vị' : ''} · {staffingLabel(position)}
        </>
      }
    >
      <div className="mb-5">
        <SegmentedControl
          value={tab}
          onChange={setTab}
          options={[
            { value: 'mo-ta', label: 'Mô tả công việc' },
            { value: 'nguoi-giu', label: `Người giữ (${position.holders.length})` },
            { value: 'lich-su', label: 'Lịch sử' },
          ]}
        />
      </div>
      {tab === 'mo-ta' ? <JobDescription position={position} canManage={chart.canManage} /> : null}
      {tab === 'nguoi-giu' ? <Holders position={position} chart={chart} /> : null}
      {tab === 'lich-su' ? <History positionId={position.id} /> : null}
    </Drawer>
  )
}

function JobDescription({
  position,
  canManage,
}: {
  position: OrgPositionView
  canManage: boolean
}) {
  const toast = useToast()
  const refresh = useOrgRefresh()
  const [form, setForm] = useState({
    title: position.title,
    isHead: position.isHead,
    headcount: position.headcount,
    suggestedRole: (position.suggestedRole ?? '') as Role | '',
    duties: position.duties,
    authorities: position.authorities,
    requirements: position.requirements,
  })
  const save = useMutation({
    mutationFn: () =>
      api.updatePosition(position.id, {
        ...form,
        title: form.title.trim(),
        headcount: form.isHead ? 1 : form.headcount,
        suggestedRole: form.suggestedRole || null,
        // Dòng trống là dòng người dùng bấm "+ Thêm dòng" rồi bỏ đó — không lưu
        duties: form.duties.map((l) => l.trim()).filter(Boolean),
        authorities: form.authorities.map((l) => l.trim()).filter(Boolean),
        requirements: form.requirements.map((l) => l.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      toast('Đã lưu chức danh', 'ok')
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  if (!canManage) {
    const block = (label: string, lines: string[]) => (
      <div>
        <ListHead label={label} />
        {lines.length > 0 ? (
          <div className="grid gap-1.5">
            {lines.map((line, i) => (
              <p key={i} className="text-[length:var(--fs-b2)] leading-relaxed text-ink-body">
                · {line}
              </p>
            ))}
          </div>
        ) : (
          <p className="text-[length:var(--fs-c1)] text-ink-mute">Chưa khai.</p>
        )}
      </div>
    )
    return (
      <div className="grid gap-5">
        {block('Trách nhiệm', position.duties)}
        {block('Quyền hạn', position.authorities)}
        {block('Tiêu chuẩn', position.requirements)}
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <Field label="Tên chức danh">
        <TextInput value={form.title} onChange={(title) => setForm({ ...form, title })} />
      </Field>
      <div className="grid grid-cols-[auto_120px_1fr] items-end gap-3">
        <Toggle on={form.isHead} onChange={() => setForm({ ...form, isHead: !form.isHead })}>
          Trưởng đơn vị
        </Toggle>
        <Field label="Định biên">
          <NumberInput
            value={form.isHead ? 1 : form.headcount}
            disabled={form.isHead}
            onChange={(v) => setForm({ ...form, headcount: v ?? 0 })}
          />
        </Field>
        <Field label="Vai trò gợi ý (A1)" hint="Chỉ để cảnh báo — quyền vẫn cấp ở A1.">
          <Select
            value={form.suggestedRole}
            placeholder="Không gợi ý"
            options={ROLE_OPTIONS}
            onChange={(suggestedRole) => setForm({ ...form, suggestedRole })}
          />
        </Field>
      </div>
      <LineList
        label="Trách nhiệm"
        hint="Việc người giữ ghế phải làm — mỗi dòng một việc."
        value={form.duties}
        max={20}
        disabled={false}
        onChange={(duties) => setForm({ ...form, duties })}
      />
      <LineList
        label="Quyền hạn"
        hint="Những gì người giữ ghế được quyết."
        value={form.authorities}
        max={20}
        disabled={false}
        onChange={(authorities) => setForm({ ...form, authorities })}
      />
      <LineList
        label="Tiêu chuẩn"
        hint="Kinh nghiệm, chứng chỉ, kỹ năng cần có."
        value={form.requirements}
        max={20}
        disabled={false}
        onChange={(requirements) => setForm({ ...form, requirements })}
      />
      <div className="flex justify-end">
        <Button
          variant="primary"
          disabled={!form.title.trim() || save.isPending}
          onClick={() => save.mutate()}
        >
          Lưu chức danh
        </Button>
      </div>
    </div>
  )
}

function Holders({ position, chart }: { position: OrgPositionView; chart: OrgChart }) {
  const toast = useToast()
  const refresh = useOrgRefresh()
  const [ending, setEnding] = useState<{ id: number; toDate: string; note: string } | null>(null)
  const end = useMutation({
    mutationFn: () =>
      api.endAssignment(ending!.id, { toDate: ending!.toDate, note: ending!.note.trim() }),
    onSuccess: () => {
      toast('Đã kết thúc chức danh', 'ok')
      setEnding(null)
      refresh()
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        {position.holders.map((h) => (
          <div key={h.assignmentId} className="rounded-sm border border-line-1 px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[length:var(--fs-b2)] font-medium text-ink-hi">
                {h.fullName}
              </span>
              {h.kind === 'kiem-nhiem' ? <Badge>Kiêm nhiệm</Badge> : null}
              {h.upcoming ? <Badge tone="info">Từ {formatDay(h.fromDate)}</Badge> : null}
              {chart.canManage && !h.toDate ? (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEnding({ id: h.assignmentId, toDate: chart.date, note: '' })}
                >
                  Kết thúc
                </Button>
              ) : null}
            </div>
            <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
              {ASSIGNMENT_KIND_LABELS[h.kind]} · từ {formatDay(h.fromDate)}
              {h.toDate ? ` · đến hết ${formatDay(h.toDate)} (không gồm)` : ''}
              {h.note ? ` · ${h.note}` : ''}
            </p>
            {h.roleMismatch && position.suggestedRole ? (
              <p className="mt-1 text-[length:var(--fs-c1)] text-ink-body">
                Chưa có vai trò {position.suggestedRole} ({ROLE_LABELS[position.suggestedRole]}) —
                cấp ở A1 Tài khoản nếu người này cần dùng quyền của ghế.
              </p>
            ) : null}
            {h.branchMismatch ? (
              <p className="mt-1 text-[length:var(--fs-c1)] text-ink-body">
                Hồ sơ H1 ghi chi nhánh khác với chi nhánh của đơn vị — kỳ lương vẫn tính theo hồ sơ.
              </p>
            ) : null}
            {ending?.id === h.assignmentId ? (
              <div className="mt-3 grid grid-cols-[160px_1fr] items-end gap-3">
                <Field label="Ngày thôi giữ">
                  <DateInput
                    value={ending.toDate}
                    onChange={(toDate) => setEnding({ ...ending, toDate })}
                  />
                </Field>
                <Field label="Lý do">
                  <TextInput
                    value={ending.note}
                    placeholder="Nghỉ việc, chuyển chi nhánh…"
                    onChange={(note) => setEnding({ ...ending, note })}
                  />
                </Field>
                <div className="col-span-2 flex justify-end gap-2">
                  <Button size="sm" onClick={() => setEnding(null)}>
                    Bỏ
                  </Button>
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={!ending.note.trim() || end.isPending}
                    onClick={() => end.mutate()}
                  >
                    Kết thúc chức danh
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        ))}
        {position.holders.length === 0 ? (
          <p className="text-[length:var(--fs-b2)] text-ink-mute">Ghế đang trống.</p>
        ) : null}
      </div>
      {chart.canManage ? <AssignmentForm position={position} chart={chart} /> : null}
    </div>
  )
}

/**
 * Gán người vào ghế. Người đang giữ chức chính khác thì máy chủ trả 409 kèm tên
 * ghế cũ — hiện câu hỏi điều chuyển rồi gửi lại với `replaceMain`, đúng mẫu xác
 * nhận hai lần của cả hệ thống (§5.2).
 */
function AssignmentForm({ position, chart }: { position: OrgPositionView; chart: OrgChart }) {
  const toast = useToast()
  const refresh = useOrgRefresh()
  const [form, setForm] = useState({
    staffId: '',
    kind: 'chinh' as AssignmentKind,
    fromDate: chart.date,
    note: '',
  })
  const [replace, setReplace] = useState<string | null>(null)

  const holding = new Set(position.holders.map((h) => h.staffId))
  const people = new Map<number, string>()
  for (const p of chart.unassigned) people.set(p.staffId, `${p.fullName} — chưa có ghế`)
  for (const p of chart.positions) {
    for (const h of p.holders) {
      if (!people.has(h.staffId)) people.set(h.staffId, `${h.fullName} — đang là ${p.title}`)
    }
  }
  const options = [...people.entries()]
    .filter(([id]) => !holding.has(id))
    .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
    .map(([id, label]) => ({ value: String(id), label }))

  const assign = useMutation({
    mutationFn: (replaceMain: boolean) =>
      api.assignPosition({
        staffIds: [Number(form.staffId)],
        positionId: position.id,
        kind: form.kind,
        fromDate: form.fromDate,
        note: form.note.trim(),
        replaceMain,
      }),
    onSuccess: () => {
      toast('Đã gán chức danh', 'ok')
      setForm({ ...form, staffId: '', note: '' })
      setReplace(null)
      refresh()
    },
    onError: (err: Error) => {
      if (err instanceof ApiError && err.code === 'assignment_main_exists') {
        setReplace(err.message)
        return
      }
      toast(err.message, 'danger')
    },
  })

  const ready = form.staffId && form.fromDate && form.note.trim()

  return (
    <div className="rounded-md border border-line-1 bg-canvas p-4">
      <ListHead
        label="Gán người vào ghế"
        hint="Gán tay khi dựng sơ đồ phải ghi lý do. Bổ nhiệm chính thức đi qua quyết định ở N4."
      />
      <div className="grid gap-3">
        <Field label="Người">
          <Select
            value={form.staffId}
            placeholder="Chọn người…"
            options={options}
            onChange={(staffId) => {
              setForm({ ...form, staffId })
              setReplace(null)
            }}
          />
        </Field>
        <div className="grid grid-cols-[auto_160px] items-end gap-3">
          <SegmentedControl
            value={form.kind}
            onChange={(kind) => setForm({ ...form, kind })}
            options={[
              { value: 'chinh', label: 'Chức danh chính' },
              { value: 'kiem-nhiem', label: 'Kiêm nhiệm' },
            ]}
          />
          <Field label="Từ ngày">
            <DateInput
              value={form.fromDate}
              onChange={(fromDate) => setForm({ ...form, fromDate })}
            />
          </Field>
        </div>
        <Field label="Lý do / căn cứ">
          <TextInput
            value={form.note}
            placeholder="Dựng sơ đồ lần đầu"
            onChange={(note) => setForm({ ...form, note })}
          />
        </Field>
        {replace ? (
          <div className="flex items-center gap-2 rounded-sm border border-warn px-3 py-2">
            <span className="flex-1 text-[length:var(--fs-c1)] text-ink-body">{replace}</span>
            <Button size="sm" onClick={() => setReplace(null)}>
              Thôi
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={assign.isPending}
              onClick={() => assign.mutate(true)}
            >
              Điều chuyển
            </Button>
          </div>
        ) : (
          <div className="flex justify-end">
            <Button
              variant="primary"
              disabled={!ready || assign.isPending}
              onClick={() => assign.mutate(false)}
            >
              Gán chức danh
            </Button>
          </div>
        )}
      </div>
    </div>
  )
}

function History({ positionId }: { positionId: number }) {
  const history = useQuery({
    queryKey: ['org', 'history', positionId],
    queryFn: () => api.orgPositionHistory(positionId),
  })
  if (history.isPending) return <p className="text-ink-mute">Đang tải…</p>
  if (history.isError) return <p className="text-ink-body">{(history.error as Error).message}</p>
  const rows = history.data
  if (rows.length === 0) {
    return (
      <p className="text-[length:var(--fs-b2)] text-ink-mute">Chưa ai từng giữ chức danh này.</p>
    )
  }
  return (
    <ol className="grid gap-2">
      {rows.map((r) => (
        <li key={r.assignmentId} className="rounded-sm border border-line-1 px-3 py-2">
          <p className="text-[length:var(--fs-b2)] text-ink-hi">
            {r.fullName}
            {r.kind === 'kiem-nhiem' ? ' · kiêm nhiệm' : ''}
          </p>
          <p className="mt-0.5 font-mono text-[length:var(--fs-c1)] text-ink-mute">
            {formatDay(r.fromDate)} → {r.toDate ? formatDay(r.toDate) : 'nay'}
          </p>
          {r.note ? (
            <p className="mt-0.5 text-[length:var(--fs-c1)] text-ink-mute">{r.note}</p>
          ) : null}
        </li>
      ))}
    </ol>
  )
}
