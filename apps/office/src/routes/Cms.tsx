import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type CmsJob, type CmsPost } from '../api'
import { PageHeader } from '../components/PageHeader'
import { Field, formatDay } from '../components/report'

/**
 * A8 — CMS website.
 *
 * Phạm vi cố ý HẸP: tin tức (W8) và tuyển dụng (W9). Đó là hai khối duy nhất đổi
 * theo tuần, và cũng đúng là hai khối mà file nội dung của web đã hẹn sẵn sẽ
 * chuyển sang đây.
 *
 * KHÔNG có ở đây, và không phải là thiếu sót:
 * — giá và mô tả món thì sửa ở M1, website đọc cùng nguồn (§18.1);
 * — địa chỉ, giờ mở, điện thoại thì sửa ở A10, "sửa một chỗ mọi nơi đổi";
 * — câu chuyện bếp trưởng và lời hứa dưới hero ở lại file nội dung vì đó là bản
 *   sắc viết một lần, không phải nội dung có người trực.
 *
 * Bài chưa bật là bản NHÁP — website không đọc, nên viết dở rồi bỏ đấy không làm
 * trang tin hiện một tiêu đề cụt.
 */

const CATEGORIES = ['Bếp', 'Nguyên liệu', 'Chi nhánh', 'Sự kiện', 'Thực đơn', 'Ưu đãi', 'Câu chuyện']
const EMPLOYMENTS = ['Toàn thời gian', 'Toàn thời gian · ca tối', 'Bán thời gian', 'Thời vụ']

type PostDraft = Omit<CmsPost, 'id' | 'updatedAt' | 'updatedBy'>
type JobDraft = Omit<CmsJob, 'id' | 'branchName' | 'updatedAt' | 'updatedBy'>

const blankPost = (): PostDraft => ({
  title: '',
  category: CATEGORIES[0]!,
  excerpt: null,
  publishedOn: new Date().toISOString().slice(0, 10),
  published: false,
})

const blankJob = (sort: number): JobDraft => ({
  title: '',
  branchId: null,
  employment: EMPLOYMENTS[0]!,
  slots: 1,
  published: false,
  sort,
})

export function Cms() {
  const [tab, setTab] = useState<'posts' | 'jobs'>('posts')

  return (
    <>
      <PageHeader
        title="Nội dung website"
        subtitle="Tin tức và tuyển dụng của website thương hiệu. Giá món, giờ mở và địa chỉ thì không nằm ở đây — chúng có nguồn riêng và website đọc thẳng."
        action={
          <div className="flex overflow-hidden rounded-sm border border-line-1">
            {(
              [
                ['posts', 'W8 · Tin tức'],
                ['jobs', 'W9 · Tuyển dụng'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={`h-[var(--hit-target)] border-r border-line-1 px-4 text-[length:var(--fs-b2)] last:border-r-0 ${
                  tab === key ? 'bg-surface-3 text-ink-hi' : 'text-ink-mute hover:text-ink-hi'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {tab === 'posts' ? <PostsTab /> : <JobsTab />}

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Website dựng tĩnh và làm mới cache mỗi 60 giây, nên bài vừa bật sẽ hiện ra trong vòng một
          phút. Chưa có trong bản dựng này: ảnh bài viết (trang tin đang dùng khung chữ Nhật) và
          trang chi tiết cho từng bài.
        </p>
      </div>
    </>
  )
}

// --------------------------------------------------------------------- W8

function PostsTab() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{ input: PostDraft; id?: number } | null>(null)

  const posts = useQuery({ queryKey: ['cms-posts'], queryFn: api.cmsPosts })

  const done = (message: string) => {
    toast(message, 'ok')
    setDraft(null)
    void queryClient.invalidateQueries({ queryKey: ['cms-posts'] })
  }

  const save = useMutation({
    mutationFn: ({ input, id }: { input: PostDraft; id?: number }) =>
      id === undefined ? api.createCmsPost(input) : api.updateCmsPost(id, input),
    onSuccess: () => done('Đã lưu bài viết'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteCmsPost(id),
    onSuccess: () => done('Đã xoá bài viết'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const toggle = useMutation({
    mutationFn: ({ id, published }: { id: number; published: boolean }) =>
      api.updateCmsPost(id, { published }),
    onSuccess: (row) => done(row.published ? 'Đã đăng bài' : 'Đã gỡ bài về nháp'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const list = posts.data ?? []

  return (
    <>
      {posts.isError ? <ErrorState message={(posts.error as Error).message} /> : null}

      <div className="flex justify-end">
        {draft ? null : (
          <Button variant="primary" onClick={() => setDraft({ input: blankPost() })}>
            Viết bài mới
          </Button>
        )}
      </div>

      {draft ? (
        <section className="mt-4 rounded-md border border-accent bg-surface-1 p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_180px_170px]">
            <Field label="Tiêu đề">
              <Input
                value={draft.input.title}
                onChange={(v) => setDraft({ ...draft, input: { ...draft.input, title: v } })}
                placeholder="Chúng tôi đổi sang than hoa Bình Định"
              />
            </Field>
            <Field label="Mục">
              <select
                value={draft.input.category}
                onChange={(e) =>
                  setDraft({ ...draft, input: { ...draft.input, category: e.target.value } })
                }
                className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
              >
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Ngày đăng">
              <Input
                type="date"
                value={draft.input.publishedOn}
                onChange={(v) => setDraft({ ...draft, input: { ...draft.input, publishedOn: v } })}
                mono
              />
            </Field>
          </div>

          <Field label="Đoạn dẫn (chỉ bài mới nhất hiện đoạn này trên W8)">
            <textarea
              rows={3}
              value={draft.input.excerpt ?? ''}
              onChange={(e) =>
                setDraft({ ...draft, input: { ...draft.input, excerpt: e.target.value || null } })
              }
              className="mt-1 w-full rounded-sm border border-line-1 bg-canvas px-2.5 py-2 text-[length:var(--fs-b2)] leading-relaxed text-ink-hi"
            />
          </Field>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setDraft({
                  ...draft,
                  input: { ...draft.input, published: !draft.input.published },
                })
              }
              className={`h-9 rounded-sm border px-3 text-[length:var(--fs-c1)] ${
                draft.input.published ? 'border-ok text-ok' : 'border-line-3 text-ink-mute'
              }`}
            >
              {draft.input.published ? 'Đăng lên website' : 'Giữ ở nháp'}
            </button>
            <div className="ml-auto flex gap-2">
              <Button onClick={() => setDraft(null)}>Bỏ</Button>
              <Button
                variant="primary"
                disabled={draft.input.title.trim() === '' || save.isPending}
                onClick={() => save.mutate(draft)}
              >
                Lưu bài
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
        <div className="grid grid-cols-[1fr_140px_120px_110px_160px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
          <span>Bài viết</span>
          <span>Mục</span>
          <span>Ngày đăng</span>
          <span>Trạng thái</span>
          <span />
        </div>

        {posts.isPending ? (
          <p className="px-5 py-4 text-ink-mute">Đang tải…</p>
        ) : list.length === 0 ? (
          <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
            Chưa có bài nào. Trang Tin tức sẽ trống cho tới khi có bài được đăng.
          </p>
        ) : (
          list.map((row, index) => (
            <div
              key={row.id}
              className={`grid grid-cols-[1fr_140px_120px_110px_160px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0 ${
                row.published ? '' : 'opacity-60'
              }`}
            >
              <span className="min-w-0">
                <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                  {row.title}
                </span>
                {row.published && index === 0 ? (
                  <span className="mt-0.5 block text-[length:var(--fs-c1)] text-accent-ink">
                    Đang là bài nổi bật trên W8
                  </span>
                ) : null}
              </span>
              <span className="text-[length:var(--fs-c1)] text-ink-body">{row.category}</span>
              <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                {formatDay(row.publishedOn)}
              </span>
              <span>
                {row.published ? <Badge tone="ok">Đã đăng</Badge> : <Badge>Nháp</Badge>}
              </span>
              <span className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => toggle.mutate({ id: row.id, published: !row.published })}
                  className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                >
                  {row.published ? 'Gỡ' : 'Đăng'}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({ input: toPostDraft(row), id: row.id })}
                  className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(row.id)}
                  className="h-8 rounded-sm border border-danger-line px-2 text-[length:var(--fs-c1)] text-danger hover:bg-danger/8"
                >
                  Xoá
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </>
  )
}

function toPostDraft(row: CmsPost): PostDraft {
  return {
    title: row.title,
    category: row.category,
    excerpt: row.excerpt,
    publishedOn: row.publishedOn,
    published: row.published,
  }
}

// --------------------------------------------------------------------- W9

function JobsTab() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{ input: JobDraft; id?: number } | null>(null)

  const jobs = useQuery({ queryKey: ['cms-jobs'], queryFn: api.cmsJobs })
  const branches = useQuery({ queryKey: ['admin-branches'], queryFn: api.branches })

  const done = (message: string) => {
    toast(message, 'ok')
    setDraft(null)
    void queryClient.invalidateQueries({ queryKey: ['cms-jobs'] })
  }

  const save = useMutation({
    mutationFn: ({ input, id }: { input: JobDraft; id?: number }) =>
      id === undefined ? api.createCmsJob(input) : api.updateCmsJob(id, input),
    onSuccess: () => done('Đã lưu tin tuyển dụng'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteCmsJob(id),
    onSuccess: () => done('Đã xoá tin'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const toggle = useMutation({
    mutationFn: ({ id, published }: { id: number; published: boolean }) =>
      api.updateCmsJob(id, { published }),
    onSuccess: (row) => done(row.published ? 'Đã mở tin tuyển' : 'Đã đóng tin tuyển'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const list = jobs.data ?? []
  const branchList = branches.data ?? []

  return (
    <>
      {jobs.isError ? <ErrorState message={(jobs.error as Error).message} /> : null}

      <div className="flex justify-end">
        {draft ? null : (
          <Button variant="primary" onClick={() => setDraft({ input: blankJob(list.length) })}>
            Thêm vị trí
          </Button>
        )}
      </div>

      {draft ? (
        <section className="mt-4 rounded-md border border-accent bg-surface-1 p-5">
          <div className="grid gap-4 lg:grid-cols-4">
            <Field label="Vị trí">
              <Input
                value={draft.input.title}
                onChange={(v) => setDraft({ ...draft, input: { ...draft.input, title: v } })}
                placeholder="Phụ bếp trạm chiên"
              />
            </Field>
            <Field label="Chi nhánh">
              <select
                value={draft.input.branchId ?? ''}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    input: { ...draft.input, branchId: e.target.value || null },
                  })
                }
                className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
              >
                <option value="">Cả chuỗi</option>
                {branchList.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Hình thức">
              <select
                value={draft.input.employment}
                onChange={(e) =>
                  setDraft({ ...draft, input: { ...draft.input, employment: e.target.value } })
                }
                className="h-9 w-full rounded-sm border border-line-1 bg-canvas px-2.5 text-[length:var(--fs-b2)] text-ink-hi"
              >
                {EMPLOYMENTS.map((e) => (
                  <option key={e} value={e}>
                    {e}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Số vị trí">
              <Input
                type="number"
                value={String(draft.input.slots)}
                onChange={(v) => setDraft({ ...draft, input: { ...draft.input, slots: Number(v) || 1 } })}
                mono
              />
            </Field>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <button
              type="button"
              onClick={() =>
                setDraft({ ...draft, input: { ...draft.input, published: !draft.input.published } })
              }
              className={`h-9 rounded-sm border px-3 text-[length:var(--fs-c1)] ${
                draft.input.published ? 'border-ok text-ok' : 'border-line-3 text-ink-mute'
              }`}
            >
              {draft.input.published ? 'Hiện trên website' : 'Chưa mở tuyển'}
            </button>
            <div className="ml-auto flex gap-2">
              <Button onClick={() => setDraft(null)}>Bỏ</Button>
              <Button
                variant="primary"
                disabled={draft.input.title.trim() === '' || save.isPending}
                onClick={() => save.mutate(draft)}
              >
                Lưu tin
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-5 overflow-hidden rounded-md border border-line-1 bg-surface-1">
        <div className="grid grid-cols-[1fr_170px_200px_100px_110px_160px] gap-3 border-b border-line-1 bg-canvas px-5 py-3 text-[length:var(--fs-c2)] font-semibold tracking-[0.1em] text-ink-mute uppercase">
          <span>Vị trí</span>
          <span>Chi nhánh</span>
          <span>Hình thức</span>
          <span>Số lượng</span>
          <span>Trạng thái</span>
          <span />
        </div>

        {jobs.isPending ? (
          <p className="px-5 py-4 text-ink-mute">Đang tải…</p>
        ) : list.length === 0 ? (
          <p className="px-5 py-4 text-[length:var(--fs-b2)] text-ink-mute">
            Chưa có vị trí nào. Trang Liên hệ sẽ mời ứng viên gửi hồ sơ chung.
          </p>
        ) : (
          list.map((row) => (
            <div
              key={row.id}
              className={`grid grid-cols-[1fr_170px_200px_100px_110px_160px] items-center gap-3 border-b border-line-1 px-5 py-2.5 last:border-b-0 ${
                row.published ? '' : 'opacity-60'
              }`}
            >
              <span className="truncate text-[length:var(--fs-b2)] text-ink-hi">{row.title}</span>
              <span className="text-[length:var(--fs-c1)] text-ink-body">
                {row.branchName ?? 'Cả chuỗi'}
              </span>
              <span className="text-[length:var(--fs-c1)] text-ink-mute">{row.employment}</span>
              <span className="font-mono text-[length:var(--fs-c1)] text-ink-body">
                {row.slots}
              </span>
              <span>{row.published ? <Badge tone="ok">Đang tuyển</Badge> : <Badge>Đóng</Badge>}</span>
              <span className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => toggle.mutate({ id: row.id, published: !row.published })}
                  className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                >
                  {row.published ? 'Đóng' : 'Mở'}
                </button>
                <button
                  type="button"
                  onClick={() => setDraft({ input: toJobDraft(row), id: row.id })}
                  className="h-8 rounded-sm border border-line-3 px-2 text-[length:var(--fs-c1)] text-ink-body hover:bg-surface-3"
                >
                  Sửa
                </button>
                <button
                  type="button"
                  onClick={() => remove.mutate(row.id)}
                  className="h-8 rounded-sm border border-danger-line px-2 text-[length:var(--fs-c1)] text-danger hover:bg-danger/8"
                >
                  Xoá
                </button>
              </span>
            </div>
          ))
        )}
      </div>
    </>
  )
}

function toJobDraft(row: CmsJob): JobDraft {
  return {
    title: row.title,
    branchId: row.branchId,
    employment: row.employment,
    slots: row.slots,
    published: row.published,
    sort: row.sort,
  }
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
