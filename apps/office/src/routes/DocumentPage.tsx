import {
  ASSIGNMENT_KIND_LABELS,
  DECISION_TYPE_LABELS,
  DECISION_TYPES,
  DOC_KIND_LABELS,
  DOC_STATE_LABELS,
  PERSONNEL_DECISIONS,
  type AssignmentKind,
  type DecisionType,
  type DocAttachment,
  type DocKind,
  type DocumentDetail,
  type MyDocumentDetail,
  type OrgChart,
  type PersonnelChange,
} from '@sora/contracts'
import { ApiError, safeHref } from '@sora/core'
import { Badge, Button, ErrorState, Skeleton, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useState, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { api, type DocumentInput } from '../api'
import {
  DateInput,
  Field,
  ListHead,
  SegmentedControl,
  Select,
  TextArea,
  TextInput,
  Toggle,
} from '../components/form'
import { PageHeader } from '../components/PageHeader'
import { buildForest } from '../components/org/model'
import { describeTarget, RecipientPicker } from '../components/org/RecipientPicker'
import { useSession } from '../session-context'
import { formatDate } from './Documents'

/**
 * N4 — Một văn bản: soạn / sửa nháp, xem để ký, hoặc đọc như người nhận.
 *
 * Người không thấy văn bản trong sổ (ngoài phạm vi) nhưng có tên trong nơi nhận
 * thì đọc được bản "của tôi" — máy chủ trả 404 ở sổ, trang tự chuyển sang hộp thư.
 */

const todayVN = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date())

const blank = (): DocumentInput => ({
  kind: 'thong-bao',
  decisionType: null,
  title: '',
  body: '',
  attachments: [],
  targets: [],
  changes: null,
  requiresAck: false,
  effectiveFrom: todayVN(),
  effectiveTo: null,
})

const isPersonnel = (t: DecisionType | null) => t !== null && PERSONNEL_DECISIONS.includes(t)

const kindTitle = (kind: DocKind, decisionType: DecisionType | null) =>
  decisionType
    ? `${DOC_KIND_LABELS[kind]} ${DECISION_TYPE_LABELS[decisionType].toLowerCase()}`
    : DOC_KIND_LABELS[kind]

export function DocumentPage() {
  const { id } = useParams()
  const docId = id ? Number(id) : null
  const chart = useQuery({
    queryKey: ['org', 'chart'],
    queryFn: () => api.orgChart(),
    retry: false,
  })

  const detail = useQuery({
    queryKey: ['docs', 'detail', docId],
    queryFn: () => api.document(docId!),
    enabled: docId !== null,
    retry: false,
  })
  const notInRegister = detail.error instanceof ApiError && detail.error.status === 404
  const receipt = useQuery({
    queryKey: ['docs', 'mine', docId],
    queryFn: () => api.myDocument(docId!),
    enabled: docId !== null && notInRegister,
    retry: false,
  })

  if (docId === null) return <DocumentEditor initial={blank()} chart={chart.data} />
  if (detail.isPending || (notInRegister && receipt.isPending)) return <PageSkeleton />
  if (detail.data?.canEdit) {
    return (
      <DocumentEditor
        key={detail.data.id}
        id={detail.data.id}
        initial={toInput(detail.data)}
        returnNote={detail.data.returnNote}
        chart={chart.data}
      />
    )
  }
  if (detail.data) return <DocumentView doc={detail.data} chart={chart.data} />
  if (receipt.data) return <ReceiptView doc={receipt.data} />
  const error = (receipt.error ?? detail.error) as Error | null
  return (
    <>
      <PageHeader title="Văn bản" />
      <div className="px-8 pt-6">
        <ErrorState
          message={error?.message ?? 'Không có văn bản này'}
          action={
            <Link to="/van-ban" className="text-accent-ink hover:underline">
              Về sổ văn bản
            </Link>
          }
        />
      </div>
    </>
  )
}

function toInput(d: DocumentDetail): DocumentInput {
  return {
    kind: d.kind,
    decisionType: d.decisionType,
    title: d.title,
    body: d.body,
    attachments: d.attachments,
    targets: d.targets,
    changes: d.changes,
    requiresAck: d.requiresAck,
    effectiveFrom: d.effectiveFrom,
    effectiveTo: d.effectiveTo,
  }
}

// ==================================================================== Soạn

function DocumentEditor({
  id,
  initial,
  returnNote,
  chart,
}: {
  id?: number
  initial: DocumentInput
  returnNote?: string | null
  chart: OrgChart | undefined
}) {
  const toast = useToast()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { can } = useSession()
  const [form, setForm] = useState<DocumentInput>(initial)
  const [savedId, setSavedId] = useState<number | null>(id ?? null)
  const [signerId, setSignerId] = useState('')
  const [signing, setSigning] = useState(false)

  const signers = useQuery({
    queryKey: ['doc-signers', form.kind],
    queryFn: () => api.documentSigners(form.kind),
  })
  const mayDirectSign = can(form.kind === 'thong-bao' ? 'doc.sign-notice' : 'doc.sign-decision')
  const personnel = isPersonnel(form.decisionType)

  const set = <K extends keyof DocumentInput>(key: K, value: DocumentInput[K]) =>
    setForm({ ...form, [key]: value })

  // Lưu trước mọi bước: trình hay ký đều làm trên đúng bản người soạn đang thấy
  const save = async () => {
    const input = {
      ...form,
      title: form.title.trim(),
      body: form.body.trim(),
      attachments: form.attachments.filter((a) => a.name.trim() || a.url.trim()),
    }
    if (savedId !== null) {
      await api.updateDocument(savedId, input)
      return savedId
    }
    const created = await api.createDocument(input)
    setSavedId(created.id)
    return created.id
  }
  const done = (docId: number) => {
    void queryClient.invalidateQueries({ queryKey: ['docs'] })
    void queryClient.invalidateQueries({ queryKey: ['org-inbox'] })
    navigate(`/van-ban/${docId}`, { replace: true })
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const saveDraft = useMutation({
    mutationFn: save,
    onSuccess: (docId) => {
      toast('Đã lưu nháp', 'ok')
      done(docId)
    },
    onError: fail,
  })
  const submit = useMutation({
    mutationFn: async () => {
      const docId = await save()
      await api.submitDocument(docId, Number(signerId))
      return docId
    },
    onSuccess: (docId) => {
      toast('Đã trình ký', 'ok')
      done(docId)
    },
    onError: fail,
  })
  const sign = useMutation({
    mutationFn: async (pin: string) => {
      const docId = await save()
      return { docId, result: await api.signDocument(docId, pin) }
    },
    onSuccess: ({ docId, result }) => {
      toast(`Đã ký ban hành ${result.number} · ${result.recipients} người nhận`, 'ok')
      done(docId)
    },
    onError: fail,
  })
  const remove = useMutation({
    mutationFn: () => api.deleteDocument(savedId!),
    onSuccess: () => {
      toast('Đã xoá nháp', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['docs'] })
      navigate('/van-ban?tab=toi-soan', { replace: true })
    },
    onError: fail,
  })

  const ready =
    form.title.trim() &&
    form.body.trim() &&
    form.targets.length > 0 &&
    (form.kind !== 'quyet-dinh' || form.decisionType !== null) &&
    (!personnel || (form.changes?.length ?? 0) > 0)
  const busy = saveDraft.isPending || submit.isPending || sign.isPending

  return (
    <>
      <PageHeader
        title={savedId ? 'Sửa văn bản nháp' : 'Soạn văn bản'}
        subtitle="Từ lúc trình ký, nội dung và nơi nhận đóng băng — người ký ký đúng thứ đã đọc."
        action={
          <Link
            to="/van-ban"
            className="text-[length:var(--fs-c1)] text-accent-ink hover:underline"
          >
            ← Sổ văn bản
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {returnNote ? (
          <p className="mt-5 rounded-md border border-warn bg-surface-1 px-5 py-3 text-[length:var(--fs-b2)] text-ink-body">
            Người ký trả lại: {returnNote}
          </p>
        ) : null}

        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_360px] gap-6">
          <section className="grid gap-5 rounded-md border border-line-1 bg-surface-1 p-5">
            <div className="flex flex-wrap items-end gap-4">
              <SegmentedControl
                value={form.kind}
                onChange={(kind) =>
                  setForm({
                    ...form,
                    kind,
                    decisionType: kind === 'quyet-dinh' ? (form.decisionType ?? 'khac') : null,
                    changes: kind === 'quyet-dinh' ? form.changes : null,
                  })
                }
                options={[
                  { value: 'thong-bao', label: 'Thông báo' },
                  { value: 'quyet-dinh', label: 'Quyết định' },
                  { value: 'quy-dinh', label: 'Quy định' },
                ]}
              />
              {form.kind === 'quyet-dinh' ? (
                <Field label="Loại quyết định">
                  <Select
                    value={form.decisionType ?? ''}
                    width={200}
                    options={DECISION_TYPES.map((t) => ({
                      value: t,
                      label: DECISION_TYPE_LABELS[t],
                    }))}
                    onChange={(t) =>
                      setForm({
                        ...form,
                        decisionType: t,
                        changes: isPersonnel(t) ? (form.changes ?? []) : null,
                      })
                    }
                  />
                </Field>
              ) : null}
            </div>

            <Field label="Trích yếu">
              <TextInput
                value={form.title}
                placeholder="Về việc tổng vệ sinh cuối tháng"
                onChange={(title) => set('title', title)}
              />
            </Field>
            <Field label="Nội dung" hint="Chữ thuần — xuống dòng giữ nguyên khi hiện.">
              <TextArea rows={12} value={form.body} onChange={(body) => set('body', body)} />
            </Field>

            {form.decisionType === 'ky-luat' ? (
              <p className="rounded-sm border border-line-2 px-3 py-2 text-[length:var(--fs-c1)] leading-relaxed text-ink-body">
                Kỷ luật phải theo trình tự Điều 122 Bộ luật Lao động 2019 (chứng minh lỗi, có tổ
                chức đại diện, người lao động được bào chữa, lập biên bản); hình thức theo Điều 124.
                Không có phạt tiền, cắt lương (Điều 127). Hệ thống chỉ lưu và phổ biến quyết định.
              </p>
            ) : null}
            {form.decisionType === 'khen-thuong' ? (
              <p className="text-[length:var(--fs-c1)] text-ink-mute">
                Thưởng bằng tiền không tự vào kỳ lương — người tính lương nhập ở H7.
              </p>
            ) : null}

            {personnel ? (
              <ChangesEditor
                kind={form.decisionType!}
                value={form.changes ?? []}
                chart={chart}
                onChange={(changes) => set('changes', changes)}
              />
            ) : null}

            <RecipientPicker
              value={form.targets}
              onChange={(t) => set('targets', t)}
              chart={chart}
            />

            <AttachmentEditor value={form.attachments} onChange={(a) => set('attachments', a)} />
          </section>

          <aside className="grid content-start gap-4">
            <section className="grid gap-4 rounded-md border border-line-1 bg-surface-1 p-5">
              <Field label="Hiệu lực từ">
                <DateInput value={form.effectiveFrom} onChange={(v) => set('effectiveFrom', v)} />
              </Field>
              <Field label="Hết hiệu lực (nếu có)">
                <DateInput
                  value={form.effectiveTo ?? ''}
                  onChange={(v) => set('effectiveTo', v || null)}
                />
              </Field>
              <Toggle on={form.requiresAck} onChange={(v) => set('requiresAck', v)}>
                Yêu cầu xác nhận đã đọc
              </Toggle>
            </section>

            <section className="grid gap-3 rounded-md border border-line-1 bg-surface-1 p-5">
              <Button block disabled={!ready || busy} onClick={() => saveDraft.mutate()}>
                Lưu nháp
              </Button>
              <Field label="Trình người ký">
                <Select
                  value={signerId}
                  placeholder={
                    signers.data?.length ? 'Chọn người ký…' : 'Chưa có ai đủ quyền và có PIN'
                  }
                  options={(signers.data ?? []).map((s) => ({
                    value: String(s.staffId),
                    label: s.title ? `${s.fullName} — ${s.title}` : s.fullName,
                  }))}
                  onChange={setSignerId}
                />
              </Field>
              <Button block disabled={!ready || !signerId || busy} onClick={() => submit.mutate()}>
                Trình ký
              </Button>
              {mayDirectSign ? (
                signing ? (
                  <PinPrompt
                    label="Ký ban hành"
                    busy={sign.isPending}
                    onCancel={() => setSigning(false)}
                    onConfirm={(pin) => sign.mutate(pin)}
                  />
                ) : (
                  <Button
                    block
                    variant="primary"
                    disabled={!ready || busy}
                    onClick={() => setSigning(true)}
                  >
                    Ký ban hành
                  </Button>
                )
              ) : null}
              {savedId !== null ? (
                <Button
                  block
                  variant="ghost"
                  disabled={busy || remove.isPending}
                  onClick={() => remove.mutate()}
                >
                  Xoá nháp
                </Button>
              ) : null}
            </section>
          </aside>
        </div>
      </div>
    </>
  )
}

/** Quyết định nhân sự: ai, vào/rời ghế nào — áp vào sơ đồ ngay lúc ký */
function ChangesEditor({
  kind,
  value,
  chart,
  onChange,
}: {
  kind: DecisionType
  value: PersonnelChange[]
  chart: OrgChart | undefined
  onChange: (next: PersonnelChange[]) => void
}) {
  const forest = buildForest(chart?.units ?? [])
  const people = new Map<number, string>()
  for (const p of chart?.positions ?? []) {
    for (const h of p.holders)
      if (!people.has(h.staffId)) people.set(h.staffId, `${h.fullName} — ${p.title}`)
  }
  for (const p of chart?.unassigned ?? [])
    if (!people.has(p.staffId)) people.set(p.staffId, p.fullName)
  const personOptions = [...people.entries()]
    .sort((a, b) => a[1].localeCompare(b[1], 'vi'))
    .map(([id, label]) => ({ value: String(id), label }))
  const positionOptions = (chart?.positions ?? []).map((p) => ({
    value: String(p.id),
    label: `${p.title} · ${forest.byId.get(p.unitId)?.name ?? ''}`,
  }))
  const update = (i: number, patch: Partial<PersonnelChange>) =>
    onChange(value.map((c, j) => (j === i ? { ...c, ...patch } : c)))

  return (
    <div>
      <ListHead
        label={kind === 'mien-nhiem' ? 'Miễn nhiệm' : 'Bổ nhiệm / điều chuyển'}
        hint={
          kind === 'mien-nhiem'
            ? 'Người rời ghế nào. Ghế đóng đúng ngày hiệu lực.'
            : 'Người vào ghế nào. Chức danh chính đang giữ đóng đúng ngày hiệu lực; kiêm nhiệm thì chỉ thêm ghế.'
        }
      >
        <Button
          size="sm"
          disabled={value.length >= 20}
          onClick={() =>
            onChange([...value, { staffId: 0, positionId: 0, assignmentKind: 'chinh' }])
          }
        >
          + Thêm người
        </Button>
      </ListHead>
      <div className="grid gap-2">
        {value.map((c, i) => (
          <div key={i} className="grid grid-cols-[1fr_1fr_auto_auto] items-center gap-2">
            <Select
              value={c.staffId ? String(c.staffId) : ''}
              placeholder="Người…"
              options={personOptions}
              onChange={(v) => update(i, { staffId: Number(v) })}
            />
            <Select
              value={c.positionId ? String(c.positionId) : ''}
              placeholder="Chức danh…"
              options={positionOptions}
              onChange={(v) => update(i, { positionId: Number(v) })}
            />
            {kind !== 'mien-nhiem' ? (
              <Select
                value={c.assignmentKind}
                width={150}
                options={Object.entries(ASSIGNMENT_KIND_LABELS).map(([v, label]) => ({
                  value: v as AssignmentKind,
                  label,
                }))}
                onChange={(assignmentKind) => update(i, { assignmentKind })}
              />
            ) : (
              <span />
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              Bỏ
            </Button>
          </div>
        ))}
        {value.length === 0 ? (
          <p className="text-[length:var(--fs-c1)] text-ink-mute">Chưa có ai trong quyết định.</p>
        ) : null}
      </div>
    </div>
  )
}

function AttachmentEditor({
  value,
  onChange,
}: {
  value: DocAttachment[]
  onChange: (next: DocAttachment[]) => void
}) {
  return (
    <div>
      <ListHead
        label="Đính kèm"
        hint="Chưa có kho tệp: quét bản ký tay lên kho của quán rồi dán đường dẫn https."
      >
        <Button
          size="sm"
          disabled={value.length >= 10}
          onClick={() => onChange([...value, { name: '', url: '' }])}
        >
          + Thêm đính kèm
        </Button>
      </ListHead>
      <div className="grid gap-2">
        {value.map((a, i) => (
          <div key={i} className="grid grid-cols-[200px_1fr_auto] items-center gap-2">
            <TextInput
              value={a.name}
              placeholder="Tên hiển thị"
              onChange={(name) => onChange(value.map((x, j) => (j === i ? { ...x, name } : x)))}
            />
            <TextInput
              value={a.url}
              placeholder="https://…"
              mono
              onChange={(url) => onChange(value.map((x, j) => (j === i ? { ...x, url } : x)))}
            />
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onChange(value.filter((_, j) => j !== i))}
            >
              Bỏ
            </Button>
          </div>
        ))}
      </div>
    </div>
  )
}

// ==================================================================== Xem — ký — thu hồi

function DocumentView({ doc, chart }: { doc: DocumentDetail; chart: OrgChart | undefined }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const { staff } = useSession()
  const [mode, setMode] = useState<'sign' | 'return' | 'revoke' | null>(null)
  const refresh = () => {
    setMode(null)
    void queryClient.invalidateQueries({ queryKey: ['docs'] })
    void queryClient.invalidateQueries({ queryKey: ['org-inbox'] })
    void queryClient.invalidateQueries({ queryKey: ['org'] })
  }
  const fail = (err: Error) => toast(err.message, 'danger')

  const sign = useMutation({
    mutationFn: (pin: string) => api.signDocument(doc.id, pin),
    onSuccess: (r) => {
      toast(`Đã ký ban hành ${r.number} · ${r.recipients} người nhận`, 'ok')
      refresh()
    },
    onError: fail,
  })
  const giveBack = useMutation({
    mutationFn: (note: string) => api.returnDocument(doc.id, note),
    onSuccess: () => {
      toast('Đã trả lại người soạn', 'ok')
      refresh()
    },
    onError: fail,
  })
  const revoke = useMutation({
    mutationFn: (reason: string) => api.revokeDocument(doc.id, reason),
    onSuccess: () => {
      toast('Đã thu hồi văn bản', 'ok')
      refresh()
    },
    onError: fail,
  })

  const mySignature = doc.state === 'pending' && doc.signerId === staff?.staffId

  return (
    <>
      <PageHeader
        title={doc.title}
        subtitle={`${kindTitle(doc.kind, doc.decisionType)}${doc.number ? ` · ${doc.number}` : ''}`}
        action={
          <Link
            to="/van-ban"
            className="text-[length:var(--fs-c1)] text-accent-ink hover:underline"
          >
            ← Sổ văn bản
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <div className="mt-5 grid grid-cols-[minmax(0,1fr)_360px] gap-6">
          <article className="grid content-start gap-5 rounded-md border border-line-1 bg-surface-1 p-6">
            <Meta doc={doc} />
            <p className="text-[length:var(--fs-b1)] leading-relaxed whitespace-pre-wrap text-ink-hi">
              {doc.body}
            </p>
            {doc.changes && doc.changes.length > 0 ? (
              <ChangesSummary
                changes={doc.changes}
                decisionType={doc.decisionType!}
                chart={chart}
              />
            ) : null}
            <AttachmentLinks attachments={doc.attachments} />
            <div>
              <ListHead label="Nơi nhận" />
              <p className="text-[length:var(--fs-b2)] text-ink-body">
                {doc.targets.map((t) => describeTarget(t, chart)).join(' · ')}
              </p>
            </div>
          </article>

          <aside className="grid content-start gap-4">
            <section className="grid gap-3 rounded-md border border-line-1 bg-surface-1 p-5">
              <Badge
                tone={doc.state === 'issued' ? 'ok' : doc.state === 'revoked' ? 'warn' : 'info'}
              >
                {DOC_STATE_LABELS[doc.state]}
              </Badge>
              {doc.state === 'revoked' ? (
                <p className="text-[length:var(--fs-c1)] text-ink-body">
                  Thu hồi {formatDate(doc.revokedAt)}: {doc.revokeReason}
                </p>
              ) : null}
              {doc.state === 'issued' ? (
                <Button
                  block
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(staffNoticeUrl(doc.id))
                      .then(() => toast('Đã chép link — dán vào nhóm Zalo của quán', 'ok'))
                      .catch(() => toast('Không chép được — trình duyệt chặn bộ nhớ tạm', 'danger'))
                  }}
                >
                  Chép link Kênh nhân viên
                </Button>
              ) : null}

              {mySignature || doc.canSign ? (
                mode === 'sign' ? (
                  <PinPrompt
                    label="Ký ban hành"
                    busy={sign.isPending}
                    onCancel={() => setMode(null)}
                    onConfirm={(pin) => sign.mutate(pin)}
                  />
                ) : (
                  <Button block variant="primary" onClick={() => setMode('sign')}>
                    Ký ban hành
                  </Button>
                )
              ) : null}
              {mySignature ? (
                mode === 'return' ? (
                  <ReasonPrompt
                    label="Trả lại"
                    placeholder="Cần sửa gì trước khi ký"
                    busy={giveBack.isPending}
                    onCancel={() => setMode(null)}
                    onConfirm={(note) => giveBack.mutate(note)}
                  />
                ) : (
                  <Button block onClick={() => setMode('return')}>
                    Trả lại người soạn
                  </Button>
                )
              ) : null}
              {doc.canRevoke ? (
                mode === 'revoke' ? (
                  <ReasonPrompt
                    label="Thu hồi"
                    placeholder="Vì sao thu hồi"
                    busy={revoke.isPending}
                    onCancel={() => setMode(null)}
                    onConfirm={(reason) => revoke.mutate(reason)}
                  />
                ) : (
                  <Button block variant="ghost" onClick={() => setMode('revoke')}>
                    Thu hồi văn bản…
                  </Button>
                )
              ) : null}
              {doc.state === 'issued' && doc.decisionType && isPersonnel(doc.decisionType) ? (
                <p className="text-[length:var(--fs-c1)] text-ink-mute">
                  Quyết định nhân sự không thu hồi — sai thì ban hành quyết định khác để sửa.
                </p>
              ) : null}
            </section>

            {doc.recipients > 0 ? (
              <section className="grid gap-3 rounded-md border border-line-1 bg-surface-1 p-5">
                <p className="font-mono text-[length:var(--fs-b2)] text-ink-hi tabular-nums">
                  Đã đọc {doc.read}/{doc.recipients}
                  {doc.requiresAck ? ` · đã xác nhận ${doc.acked}/${doc.recipients}` : ''}
                </p>
                {doc.pending && doc.pending.length > 0 ? (
                  <div className="grid max-h-[360px] gap-1 overflow-y-auto">
                    {doc.pending.map((p) => (
                      <p
                        key={p.staffId}
                        className="flex justify-between text-[length:var(--fs-c1)]"
                      >
                        <span className="text-ink-body">{p.fullName}</span>
                        <span className="text-ink-mute">
                          {p.read ? 'chưa xác nhận' : 'chưa đọc'}
                        </span>
                      </p>
                    ))}
                  </div>
                ) : doc.pending ? (
                  <p className="text-[length:var(--fs-c1)] text-ink-mute">Mọi người đã đọc.</p>
                ) : null}
              </section>
            ) : null}
          </aside>
        </div>
      </div>
    </>
  )
}

/**
 * Link mở đúng văn bản trên Kênh nhân viên, để dán vào nhóm Zalo của quán: chưa có
 * thông báo đẩy, người nhận chỉ thấy huy hiệu khi tự mở app. Gốc lấy như link cá
 * nhân ở H1; người không có tên trong nơi nhận mở link thì không thấy gì.
 */
function staffNoticeUrl(id: number): string {
  const origin = import.meta.env.VITE_STAFF_ORIGIN ?? window.location.origin
  return `${origin}/thong-bao/${id}`
}

function Meta({ doc }: { doc: DocumentDetail }) {
  return (
    <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[length:var(--fs-c1)]">
      <Row label="Người soạn">{doc.authorName}</Row>
      <Row label="Người ký">{doc.signerName ?? '—'}</Row>
      <Row label="Hiệu lực">
        {formatDate(doc.effectiveFrom)}
        {doc.effectiveTo ? ` → ${formatDate(doc.effectiveTo)}` : ''}
      </Row>
      <Row label="Ngày ký">{formatDate(doc.signedAt)}</Row>
    </dl>
  )
}

const Row = ({ label, children }: { label: string; children: ReactNode }) => (
  <div>
    <dt className="text-ink-mute">{label}</dt>
    <dd className="text-ink-hi">{children}</dd>
  </div>
)

function ChangesSummary({
  changes,
  decisionType,
  chart,
}: {
  changes: PersonnelChange[]
  decisionType: DecisionType
  chart: OrgChart | undefined
}) {
  const name = (staffId: number) =>
    chart?.positions.flatMap((p) => p.holders).find((h) => h.staffId === staffId)?.fullName ??
    chart?.unassigned.find((p) => p.staffId === staffId)?.fullName ??
    `người #${staffId}`
  const seat = (positionId: number) =>
    chart?.positions.find((p) => p.id === positionId)?.title ?? `#${positionId}`
  return (
    <div>
      <ListHead label={DECISION_TYPE_LABELS[decisionType]} />
      <div className="grid gap-1">
        {changes.map((c, i) => (
          <p key={i} className="text-[length:var(--fs-b2)] text-ink-body">
            {name(c.staffId)} {decisionType === 'mien-nhiem' ? 'thôi giữ' : 'giữ'}{' '}
            {seat(c.positionId)}
            {decisionType !== 'mien-nhiem' && c.assignmentKind === 'kiem-nhiem'
              ? ' (kiêm nhiệm)'
              : ''}
          </p>
        ))}
      </div>
    </div>
  )
}

export function AttachmentLinks({ attachments }: { attachments: DocAttachment[] }) {
  if (attachments.length === 0) return null
  return (
    <div>
      <ListHead label="Đính kèm" />
      <div className="grid gap-1">
        {attachments.map((a, i) => {
          const href = safeHref(a.url)
          return href ? (
            <a
              key={i}
              href={href}
              target="_blank"
              rel="noopener noreferrer"
              className="text-[length:var(--fs-b2)] text-accent-ink hover:underline"
            >
              {a.name}
            </a>
          ) : (
            <span key={i} className="text-[length:var(--fs-b2)] text-ink-mute">
              {a.name} (đường dẫn không hợp lệ)
            </span>
          )
        })}
      </div>
    </div>
  )
}

// ==================================================================== Người nhận

function ReceiptView({ doc }: { doc: MyDocumentDetail }) {
  const toast = useToast()
  const queryClient = useQueryClient()
  const mark = useMutation({
    mutationFn: (ack: boolean) => api.markDocument(doc.id, ack),
    onSuccess: (_, ack) => {
      if (ack) toast('Đã xác nhận đã đọc và hiểu', 'ok')
      void queryClient.invalidateQueries({ queryKey: ['docs'] })
      void queryClient.invalidateQueries({ queryKey: ['org-inbox'] })
    },
    onError: (err: Error) => toast(err.message, 'danger'),
  })
  // Mở ra là đã đọc — ghi một lần, mở lại không đổi mốc. Chỉ chạy theo văn bản:
  // `mark` đổi mỗi lần render, đưa vào danh sách phụ thuộc là gọi lặp vô hạn
  useEffect(() => {
    if (!doc.readAt) mark.mutate(false)
  }, [doc.id])

  return (
    <>
      <PageHeader
        title={doc.title}
        subtitle={`${kindTitle(doc.kind, doc.decisionType)} · ${doc.number ?? ''} · ký ${formatDate(doc.signedAt)}${doc.signerName ? ` bởi ${doc.signerName}` : ''}`}
        action={
          <Link
            to="/van-ban"
            className="text-[length:var(--fs-c1)] text-accent-ink hover:underline"
          >
            ← Sổ văn bản
          </Link>
        }
      />
      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        <article className="mt-5 grid max-w-[820px] gap-5 rounded-md border border-line-1 bg-surface-1 p-6">
          <p className="text-[length:var(--fs-b1)] leading-relaxed whitespace-pre-wrap text-ink-hi">
            {doc.body}
          </p>
          <AttachmentLinks attachments={doc.attachments} />
          {doc.requiresAck ? (
            doc.ackedAt || mark.data?.ackedAt ? (
              <Badge tone="ok">Đã xác nhận</Badge>
            ) : (
              <div>
                <Button
                  variant="primary"
                  disabled={mark.isPending}
                  onClick={() => mark.mutate(true)}
                >
                  Tôi đã đọc và hiểu
                </Button>
              </div>
            )
          ) : null}
        </article>
      </div>
    </>
  )
}

// ==================================================================== Hỏi PIN / lý do

/**
 * PIN của CHÍNH người ký — không chọn người duyệt như dải △: chữ ký là của người
 * đang đăng nhập. Sai quá năm lần trong một phút là khoá năm phút.
 */
function PinPrompt({
  label,
  busy,
  onCancel,
  onConfirm,
}: {
  label: string
  busy: boolean
  onCancel: () => void
  onConfirm: (pin: string) => void
}) {
  const [pin, setPin] = useState('')
  const ready = /^\d{4,6}$/.test(pin)
  return (
    <div className="grid gap-2 rounded-sm border border-accent p-3">
      <Field label="PIN của bạn" hint="PIN vận hành — đặt ở A1. Nhập PIN là ký.">
        <TextInput type="password" mono value={pin} onChange={setPin} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>
          Thôi
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!ready || busy}
          onClick={() => onConfirm(pin)}
        >
          {label}
        </Button>
      </div>
    </div>
  )
}

function ReasonPrompt({
  label,
  placeholder,
  busy,
  onCancel,
  onConfirm,
}: {
  label: string
  placeholder: string
  busy: boolean
  onCancel: () => void
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = useState('')
  return (
    <div className="grid gap-2 rounded-sm border border-line-2 p-3">
      <Field label="Lý do">
        <TextInput value={reason} placeholder={placeholder} onChange={setReason} />
      </Field>
      <div className="flex justify-end gap-2">
        <Button size="sm" onClick={onCancel}>
          Thôi
        </Button>
        <Button
          size="sm"
          variant="primary"
          disabled={!reason.trim() || busy}
          onClick={() => onConfirm(reason.trim())}
        >
          {label}
        </Button>
      </div>
    </div>
  )
}

function PageSkeleton() {
  return (
    <div className="grid gap-4 px-8 pt-6">
      <Skeleton className="h-7 w-96" />
      <div className="mt-4 grid grid-cols-[minmax(0,1fr)_360px] gap-6">
        <Skeleton className="h-[420px]" />
        <Skeleton className="h-[220px]" />
      </div>
    </div>
  )
}
