import { ORG_UNIT_KIND_LABELS, type OrgPositionView, type OrgUnitView } from '@sora/contracts'
import { EmberBar } from '@sora/ui'
import { IconChevron } from '../icons'
import { staffing, staffingHeat, staffingLabel, type Forest } from './model'

export type TreeLayout = 'doc' | 'ngang'

/**
 * Cây đơn vị của N2. Mỗi nút là một ĐƠN VỊ; chức danh nằm TRONG thẻ đơn vị như
 * các dòng — không phải nút riêng. Một chi nhánh có ~15 đơn vị nhưng ~40 chức
 * danh: vẽ chức danh thành nút thì cây rộng gấp ba và chẳng còn đọc được ở 1440.
 */
export function OrgTree({
  forest,
  positions,
  layout,
  expanded,
  highlight,
  onToggle,
  onOpenUnit,
  onOpenPosition,
}: {
  forest: Forest
  positions: Map<number, OrgPositionView[]>
  layout: TreeLayout
  expanded: Set<number>
  highlight: number | null
  onToggle: (unitId: number) => void
  onOpenUnit: (unit: OrgUnitView) => void
  onOpenPosition: (position: OrgPositionView) => void
}) {
  const node = (unit: OrgUnitView) => {
    const kids = forest.childrenOf.get(unit.id) ?? []
    const open = expanded.has(unit.id)
    return (
      <li key={unit.id} role="treeitem" aria-expanded={kids.length > 0 ? open : undefined}>
        <UnitCard
          unit={unit}
          positions={positions.get(unit.id) ?? []}
          childCount={kids.length}
          open={open}
          highlighted={highlight === unit.id}
          onToggle={() => onToggle(unit.id)}
          onOpenUnit={() => onOpenUnit(unit)}
          onOpenPosition={onOpenPosition}
        />
        {open && kids.length > 0 ? <ul role="group">{kids.map(node)}</ul> : null}
      </li>
    )
  }

  return (
    <div className={layout === 'doc' ? 'org-tree-v' : 'org-tree-h'}>
      <ul role="tree" aria-label="Sơ đồ tổ chức">
        {forest.roots.map(node)}
      </ul>
    </div>
  )
}

function UnitCard({
  unit,
  positions,
  childCount,
  open,
  highlighted,
  onToggle,
  onOpenUnit,
  onOpenPosition,
}: {
  unit: OrgUnitView
  positions: OrgPositionView[]
  childCount: number
  open: boolean
  highlighted: boolean
  onToggle: () => void
  onOpenUnit: () => void
  onOpenPosition: (position: OrgPositionView) => void
}) {
  return (
    <div
      id={`org-unit-${unit.id}`}
      className={[
        'w-[248px] flex-none rounded-md border bg-surface-1 text-left transition-shadow',
        highlighted
          ? 'border-accent ring-2 ring-accent ring-offset-2 ring-offset-canvas'
          : 'border-line-2',
      ].join(' ')}
    >
      <button
        type="button"
        onClick={onOpenUnit}
        className="block w-full rounded-t-md px-3 pt-2.5 pb-2 text-left transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
      >
        <span className="block text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-ink-mute uppercase">
          {ORG_UNIT_KIND_LABELS[unit.kind]}
          {unit.stationId ? ` · ${unit.stationId}` : ''}
        </span>
        <span className="mt-0.5 block truncate text-[length:var(--fs-b2)] font-semibold text-ink-hi">
          {unit.name}
        </span>
      </button>

      {positions.length > 0 ? (
        <div className="border-t border-line-1">
          {positions.map((p) => (
            <PositionRow key={p.id} position={p} onOpen={() => onOpenPosition(p)} />
          ))}
        </div>
      ) : (
        <p className="border-t border-line-1 px-3 py-2 text-[length:var(--fs-c1)] text-ink-mute">
          Chưa có chức danh
        </p>
      )}

      {childCount > 0 ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          className="flex w-full items-center gap-1 rounded-b-md border-t border-line-1 px-3 py-1.5 text-[length:var(--fs-c1)] text-ink-mute transition-colors hover:bg-surface-3 hover:text-ink-hi focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent print:hidden"
        >
          <IconChevron open={open} />
          {open ? 'Thu' : 'Mở'} {childCount} đơn vị
        </button>
      ) : null}
    </div>
  )
}

function PositionRow({ position, onOpen }: { position: OrgPositionView; onOpen: () => void }) {
  const s = staffing(position)
  const heat = staffingHeat(position)
  const names = position.holders.filter((h) => !h.upcoming).map((h) => h.fullName)
  const label = staffingLabel(position)
  return (
    <button
      type="button"
      onClick={onOpen}
      className="block w-full px-3 py-2 text-left transition-colors hover:bg-surface-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent"
    >
      <span className="flex items-baseline gap-2">
        <span className="min-w-0 flex-1 truncate text-[length:var(--fs-c1)] font-medium text-ink-hi">
          {position.isHead ? <span className="text-accent-ink">Trưởng · </span> : null}
          {position.title}
        </span>
        <span className="flex-none font-mono text-[length:var(--fs-c1)] text-ink-body tabular-nums">
          {s.filled}/{position.headcount}
        </span>
      </span>
      <span className="mt-0.5 block truncate text-[length:var(--fs-c1)] text-ink-mute">
        {names.length > 0 ? names.slice(0, 2).join(', ') : 'Trống — cần người'}
        {names.length > 2 ? ` +${names.length - 2}` : ''}
        {label !== 'Đủ' ? ` · ${label}` : ''}
      </span>
      {heat !== null ? (
        <EmberBar
          className="mt-1.5"
          fill={position.headcount > 0 ? s.filled / position.headcount : 0}
          heat={heat}
          label={`${position.title}: ${s.filled} trên ${position.headcount} — ${label}`}
        />
      ) : null}
    </button>
  )
}
