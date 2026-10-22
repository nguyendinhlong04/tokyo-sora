import {
  DECISION_TYPE_LABELS,
  DOC_KIND_LABELS,
  DOC_STATE_LABELS,
  type DocState,
  type DocumentRow,
  type MyDocument,
} from '@sora/contracts'
import { Badge, Button, ErrorState } from '@sora/ui'
import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { api } from '../api'
import { DataTable, type Column } from '../components/DataTable'
import { Field, FilterBar, SearchField, SegmentedControl, Select } from '../components/form'
import { PageHeader } from '../components/PageHeader'
import { useSession } from '../session-context'

/**
 * N4 — Văn bản & thông báo.
 *
 * Bốn cửa vào cùng một sổ: văn bản GỬI TÔI (hộp thư của chính mình), văn bản CHỜ
 * TÔI KÝ, văn bản TÔI SOẠN, và TẤT CẢ trong phạm vi. Ai có tài khoản Office cũng
 * soạn được; chữ ký bằng PIN của người ký mới là chốt chặn.
 */

type Tab = 'gui-toi' | 'can-ky' | 'toi-soan' | 'tat-ca'

const STATE_TONES: Record<DocState, 'neutral' | 'info' | 'ok' | 'warn'> = {
  draft: 'neutral',
  pending: 'info',
  issued: 'ok',
  revoked: 'warn',
}

export const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'

const kindLabel = (d: { kind: DocumentRow['kind']; decisionType: DocumentRow['decisionType'] }) =>
  d.decisionType
    ? `${DOC_KIND_LABELS[d.kind]} ${DECISION_TYPE_LABELS[d.decisionType].toLowerCase()}`
    : DOC_KIND_LABELS[d.kind]

export function Documents() {
  const { staff } = useSession()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab | null) ?? 'gui-toi'
  const [kind, setKind] = useState('')
  const [state, setState] = useState('')
  const [query, setQuery] = useState('')

  const mine = useQuery({
    queryKey: ['docs', 'mine'],
    queryFn: api.myDocuments,
    enabled: tab === 'gui-toi',
  })
  const register = useQuery({
    queryKey: ['docs', 'register'],
    queryFn: () => api.documents(),
    enabled: tab !== 'gui-toi',
  })

  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase()
    return (register.data ?? []).filter(
      (d) =>
        (tab !== 'can-ky' || (d.state === 'pending' && d.signerId === staff?.staffId)) &&
        (tab !== 'toi-soan' || d.authorId === staff?.staffId) &&
        (!kind || d.kind === kind) &&
        (!state || d.state === state) &&
        (!needle ||
          d.title.toLowerCase().includes(needle) ||
          (d.number?.toLowerCase().includes(needle) ?? false)),
    )
  }, [register.data, tab, kind, state, query, staff])

  const registerColumns: Column<DocumentRow>[] = [
    {
      key: 'number',
      header: 'Số hiệu',
      width: '150px',
      cell: (d) => (
        <span className="font-mono text-ink-body">
          {d.number ?? <span className="text-ink-mute">Chưa cấp số</span>}
        </span>
      ),
    },
    { key: 'kind', header: 'Loại', width: '170px', cell: (d) => kindLabel(d) },
    {
      key: 'title',
      header: 'Trích yếu',
      width: 'minmax(240px, 2fr)',
      cell: (d) => <span className="truncate font-medium text-ink-hi">{d.title}</span>,
    },
    {
      key: 'people',
      header: 'Soạn · ký',
      width: 'minmax(180px, 1fr)',
      cell: (d) => (
        <span className="truncate text-ink-body">
          {d.authorName}
          {d.signerName ? ` · ${d.signerName}` : ''}
        </span>
      ),
    },
    { key: 'signed', header: 'Ngày ký', width: '110px', cell: (d) => formatDate(d.signedAt) },
    {
      key: 'read',
      header: 'Đã đọc',
      width: '120px',
      numeric: true,
      cell: (d) =>
        d.recipients > 0 ? (
          <span>
            {d.read}/{d.recipients}
            {d.requiresAck ? <span className="block text-ink-mute">xác nhận {d.acked}</span> : null}
          </span>
        ) : (
          '—'
        ),
    },
    {
      key: 'state',
      header: 'Trạng thái',
      width: '130px',
      cell: (d) => <Badge tone={STATE_TONES[d.state]}>{DOC_STATE_LABELS[d.state]}</Badge>,
    },
  ]

  const mineColumns: Column<MyDocument>[] = [
    {
      key: 'number',
      header: 'Số hiệu',
      width: '150px',
      cell: (d) => <span className="font-mono text-ink-body">{d.number}</span>,
    },
    { key: 'kind', header: 'Loại', width: '170px', cell: (d) => kindLabel(d) },
    {
      key: 'title',
      header: 'Trích yếu',
      width: 'minmax(240px, 2fr)',
      cell: (d) => (
        <span
          className={['truncate', d.readAt ? 'text-ink-body' : 'font-semibold text-ink-hi'].join(
            ' ',
          )}
        >
          {d.title}
        </span>
      ),
    },
    { key: 'signer', header: 'Người ký', width: '180px', cell: (d) => d.signerName ?? '—' },
    { key: 'signed', header: 'Ngày ký', width: '110px', cell: (d) => formatDate(d.signedAt) },
    {
      key: 'status',
      header: 'Của tôi',
      width: '150px',
      cell: (d) =>
        !d.readAt ? (
          <Badge tone="info">Chưa đọc</Badge>
        ) : d.requiresAck && !d.ackedAt ? (
          <Badge tone="warn">Cần xác nhận</Badge>
        ) : (
          <Badge tone="ok">{d.ackedAt ? 'Đã xác nhận' : 'Đã đọc'}</Badge>
        ),
    },
  ]

  const failed = tab === 'gui-toi' ? mine : register

  return (
    <>
      <PageHeader
        title="Văn bản & thông báo"
        subtitle="Thông báo, quyết định, quy định nội bộ. Soạn xong trình người có quyền ký; người ký nhập PIN của chính mình. Đã ký thì không sửa — sai thì thu hồi hoặc ban hành văn bản khác."
        action={
          <Button variant="primary" onClick={() => navigate('/van-ban/moi')}>
            Soạn văn bản
          </Button>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="mt-5">
          <SegmentedControl
            size="md"
            value={tab}
            onChange={(next) => setParams({ tab: next })}
            options={[
              { value: 'gui-toi', label: 'Gửi tôi' },
              { value: 'can-ky', label: 'Chờ tôi ký' },
              { value: 'toi-soan', label: 'Tôi soạn' },
              { value: 'tat-ca', label: 'Tất cả' },
            ]}
          />
        </div>

        {failed.isError ? (
          <div className="mt-5">
            <ErrorState
              message={(failed.error as Error).message}
              action={<Button onClick={() => void failed.refetch()}>Thử lại</Button>}
            />
          </div>
        ) : null}

        {tab === 'gui-toi' ? (
          <div className="mt-5">
            <DataTable
              columns={mineColumns}
              rows={mine.data ?? []}
              rowKey={(d) => d.id}
              loading={mine.isPending}
              empty="Chưa có văn bản nào gửi bạn."
              onRowClick={(d) => navigate(`/van-ban/${d.id}`)}
            />
          </div>
        ) : (
          <>
            <div className="mt-5">
              <FilterBar>
                <Field label="Loại">
                  <Select
                    value={kind}
                    width={160}
                    placeholder="Mọi loại"
                    options={Object.entries(DOC_KIND_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    onChange={setKind}
                  />
                </Field>
                <Field label="Trạng thái">
                  <Select
                    value={state}
                    width={160}
                    placeholder="Mọi trạng thái"
                    options={Object.entries(DOC_STATE_LABELS).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                    onChange={setState}
                  />
                </Field>
                <SearchField
                  value={query}
                  onChange={setQuery}
                  placeholder="Số hiệu hoặc trích yếu"
                />
              </FilterBar>
            </div>
            <div className="mt-5">
              <DataTable
                columns={registerColumns}
                rows={rows}
                rowKey={(d) => d.id}
                loading={register.isPending}
                resetKey={`${tab}|${kind}|${state}|${query}`}
                empty={
                  tab === 'can-ky'
                    ? 'Không có văn bản nào chờ bạn ký.'
                    : tab === 'toi-soan'
                      ? 'Bạn chưa soạn văn bản nào.'
                      : 'Chưa có văn bản nào trong phạm vi của bạn.'
                }
                onRowClick={(d) => navigate(`/van-ban/${d.id}`)}
              />
            </div>
          </>
        )}
      </div>
    </>
  )
}
