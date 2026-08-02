import { ApiError } from '@sora/core'
import { Button, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type ParameterRow } from '../api'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

/** Nhóm tham số theo tiền tố khoá — cùng cách người vận hành nghĩ về chúng */
const GROUP_LABEL: Record<string, string> = {
  sales: 'Bán hàng & thuế',
  kitchen: 'Bếp',
  auth: 'Đăng nhập & thiết bị',
  online: 'Kênh online',
  reservation: 'Đặt bàn',
}

/** Chú thích cho những tham số mà tên khoá chưa nói hết */
const NOTE: Record<string, string> = {
  'online.slotCapacity': 'Trần đơn mỗi khung 15 phút — thứ che bếp khỏi giờ cao điểm.',
  'online.leadMinutes': 'Bếp cần tối thiểu ngần này phút kể từ lúc khách bấm đặt.',
  'reservation.softHoldMinutes': 'Giữ suất trong lúc khách điền tên ở bước 3 của W6.',
  'reservation.tableHoldMinutes': 'Giữ bàn sau giờ hẹn trước khi được đánh no-show.',
  'reservation.mealMinutesSmall': 'Thời lượng bữa của nhóm tới 3 khách.',
  'reservation.mealMinutesLarge': 'Thời lượng bữa của nhóm từ 4 khách.',
  'reservation.turnBufferMinutes': 'Đệm dọn bàn giữa hai lượt khách.',
  'sales.vatRate': 'Đổi số này là đổi tiền trên mọi hoá đơn — kiểm với kế toán trước.',
}

/**
 * A6 — Trung tâm tham số.
 *
 * "Một nơi cho mọi thông số lưu động của hệ thống" (§29.1). Mỗi dòng nói rõ con
 * số engine ĐANG đọc và nó đến từ đâu: mặc định cấp chuỗi hay ghi đè của chi
 * nhánh này. Hai thứ đó khác nhau, và sửa nhầm cấp là đổi luôn cho cả ba chi
 * nhánh mà không ai để ý.
 */
export function Parameters() {
  const { branchId, can } = useSession()
  const toast = useToast()
  const queryClient = useQueryClient()
  const [query, setQuery] = useState('')
  const [historyKey, setHistoryKey] = useState<string | null>(null)
  const mayEdit = can('admin.manage-accounts-roles')

  const rows = useQuery({
    queryKey: ['parameters', branchId],
    queryFn: () => api.parameters(branchId!),
    enabled: Boolean(branchId),
  })

  const save = useMutation({
    mutationFn: (input: { key: string; value: unknown; scope: 'chain' | 'branch' }) =>
      api.setParameter(input.key, input.value, input.scope === 'branch' ? branchId! : null),
    onSuccess: (_r, input) => {
      toast(`Đã lưu ${input.key}`, 'ok')
      void queryClient.invalidateQueries({ queryKey: ['parameters'] })
    },
    onError: (err: Error) => toast(err instanceof ApiError ? err.message : 'Không lưu được', 'danger'),
  })

  const clear = useMutation({
    mutationFn: (key: string) => api.clearParameterOverride(key, branchId!),
    onSuccess: () => {
      toast('Đã bỏ ghi đè — chi nhánh quay về mặc định của chuỗi', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['parameters'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const filtered = (rows.data ?? []).filter((row) =>
    query.trim() === '' ? true : row.key.toLowerCase().includes(query.trim().toLowerCase()),
  )
  const groups = [...new Set(filtered.map((row) => row.key.split('.')[0]!))]

  return (
    <>
      <PageHeader
        title="Trung tâm tham số"
        subtitle="Mọi con số điều khiển hệ thống nằm ở đây. Engine đọc lúc chạy — sửa xong là có hiệu lực ngay, không cần triển khai lại."
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm tham số theo tên khoá"
          className="mb-5 h-11 w-full max-w-[420px] rounded-sm border border-line-1 bg-surface-1 px-3.5 text-[length:var(--fs-b2)] text-ink-hi"
        />

        {rows.isPending ? (
          <p className="text-ink-mute">Đang tải tham số…</p>
        ) : (
          groups.map((group) => (
            <section
              key={group}
              className="mb-4 overflow-hidden rounded-md border border-line-1 bg-surface-1"
            >
              <header className="border-b border-line-1 bg-canvas px-5 py-3.5">
                <p className="text-[length:var(--fs-c2)] font-semibold tracking-[0.12em] text-accent uppercase">
                  {GROUP_LABEL[group] ?? group}
                </p>
              </header>
              {filtered
                .filter((row) => row.key.startsWith(`${group}.`))
                .map((row) => (
                  <ParameterLine
                    key={row.key}
                    row={row}
                    disabled={!mayEdit || save.isPending}
                    onSave={(value, scope) => save.mutate({ key: row.key, value, scope })}
                    onClear={() => clear.mutate(row.key)}
                    onHistory={() => setHistoryKey(row.key)}
                  />
                ))}
            </section>
          ))
        )}
      </div>

      {historyKey ? (
        <HistoryDrawer paramKey={historyKey} onClose={() => setHistoryKey(null)} />
      ) : null}
    </>
  )
}

function ParameterLine({
  row,
  disabled,
  onSave,
  onClear,
  onHistory,
}: {
  row: ParameterRow
  disabled: boolean
  onSave: (value: unknown, scope: 'chain' | 'branch') => void
  onClear: () => void
  onHistory: () => void
}) {
  const [draft, setDraft] = useState(String(row.effectiveValue))
  const isBoolean = typeof row.chainValue === 'boolean'
  const isNumber = typeof row.chainValue === 'number'
  const dirty = draft !== String(row.effectiveValue)

  const parse = (): unknown => (isNumber ? Number(draft) : draft)

  return (
    <div className="grid items-center gap-4 border-b border-line-1 px-5 py-2.5 lg:grid-cols-[1fr_200px_150px_140px_auto]">
      <div className="min-w-0">
        <p className="font-mono text-[length:var(--fs-b2)] text-ink-hi">{row.key}</p>
        {NOTE[row.key] ? (
          <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">{NOTE[row.key]}</p>
        ) : null}
      </div>

      {isBoolean ? (
        <button
          type="button"
          disabled={disabled}
          onClick={() => onSave(!row.effectiveValue, row.scope)}
          className={`h-10 rounded-sm border px-3 text-[length:var(--fs-b2)] ${
            row.effectiveValue
              ? 'border-ok text-ok'
              : 'border-line-3 text-ink-mute'
          }`}
        >
          {row.effectiveValue ? 'Đang bật' : 'Đang tắt'}
        </button>
      ) : (
        <input
          value={draft}
          disabled={disabled}
          inputMode={isNumber ? 'numeric' : 'text'}
          onChange={(e) => setDraft(e.target.value)}
          className="h-10 rounded-sm border border-line-1 bg-canvas px-3 font-mono text-[length:var(--fs-b2)] text-ink-hi"
        />
      )}

      <div className="flex items-center gap-2">
        <span
          className={`inline-flex h-6 items-center rounded-sm px-2 text-[length:var(--fs-c2)] ${
            row.scope === 'branch'
              ? 'bg-accent/15 text-accent'
              : 'bg-surface-3 text-ink-mute'
          }`}
        >
          {row.scope === 'branch' ? 'Riêng chi nhánh' : 'Toàn chuỗi'}
        </span>
        {row.unit ? (
          <span className="text-[length:var(--fs-c1)] text-ink-mute">{row.unit}</span>
        ) : null}
      </div>

      <span className="text-[length:var(--fs-c1)] text-ink-mute">{row.updatedBy ?? '—'}</span>

      <div className="flex items-center gap-2">
        {dirty && !isBoolean ? (
          <>
            <Button variant="primary" disabled={disabled} onClick={() => onSave(parse(), 'chain')}>
              Lưu cho chuỗi
            </Button>
            <Button disabled={disabled} onClick={() => onSave(parse(), 'branch')}>
              Chỉ chi nhánh này
            </Button>
          </>
        ) : null}
        {!dirty && row.scope === 'branch' ? (
          <Button disabled={disabled} onClick={onClear}>
            Bỏ ghi đè
          </Button>
        ) : null}
        <button
          type="button"
          onClick={onHistory}
          aria-label="Lịch sử đổi"
          className="grid size-10 place-items-center rounded-sm border border-line-1 text-ink-mute"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7">
            <circle cx="12" cy="12" r="8.5" />
            <path d="M12 7.5V12l3 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

function HistoryDrawer({ paramKey, onClose }: { paramKey: string; onClose: () => void }) {
  const history = useQuery({
    queryKey: ['parameter-history', paramKey],
    queryFn: () => api.parameterHistory(paramKey),
  })

  return (
    <div className="fixed inset-0 z-100 flex justify-end bg-canvas/60" onClick={onClose}>
      <aside
        className="flex h-full w-[420px] flex-col border-l border-line-1 bg-surface-1"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex-none border-b border-line-1 p-5">
          <p className="font-mono text-[length:var(--fs-b2)] text-ink-hi">{paramKey}</p>
          <p className="mt-1 text-[length:var(--fs-c1)] text-ink-mute">
            Sổ đổi tham số — ai đổi, từ số nào sang số nào.
          </p>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {history.isPending ? (
            <p className="text-ink-mute">Đang tải…</p>
          ) : (history.data ?? []).length === 0 ? (
            <p className="text-[length:var(--fs-b2)] text-ink-mute">
              Chưa ai đổi tham số này — giá trị hiện tại là giá trị lúc cài đặt.
            </p>
          ) : (
            <ol className="grid gap-3">
              {history.data!.map((change, i) => (
                <li key={i} className="rounded-sm border border-line-1 p-3">
                  <p className="font-mono text-[length:var(--fs-b2)] text-ink-hi">
                    {String(change.oldValue)} → {String(change.newValue)}
                  </p>
                  <p className="mt-1.5 text-[length:var(--fs-c1)] text-ink-mute">
                    {change.changedBy ?? 'hệ thống'} ·{' '}
                    {new Date(change.changedAt).toLocaleString('vi-VN')} ·{' '}
                    {change.branchId ? `chi nhánh ${change.branchId}` : 'toàn chuỗi'}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </div>
        <footer className="flex-none border-t border-line-1 p-4">
          <Button block onClick={onClose}>
            Đóng
          </Button>
        </footer>
      </aside>
    </div>
  )
}
