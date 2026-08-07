import { Badge, Button, ErrorState, useToast } from '@sora/ui'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api, type CmsHeroImage, type CmsJob, type CmsPost } from '../api'
import { DataTable } from '../components/DataTable'
import { PageHeader } from '../components/PageHeader'
import { Field, formatDay } from '../components/report'
import { SegmentedControl, TextInput as Input, Toggle } from '../components/form'

/**
 * A8 — CMS website.
 *
 * Phạm vi cố ý HẸP: tin tức (W8), tuyển dụng (W9) và ảnh hero trang chủ (W1). Đó
 * là những khối đổi theo tuần, và cũng đúng là những khối mà file nội dung của
 * web đã hẹn sẵn sẽ chuyển sang đây.
 *
 * KHÔNG có ở đây, và không phải là thiếu sót:
 * — giá và mô tả món thì sửa ở M1, website đọc cùng nguồn (§18.1);
 * — ẢNH MÓN cũng ở M1: một ảnh dùng chung web, menu online và thẻ món tại bàn,
 *   nên nó thuộc về món chứ không thuộc về website;
 * — địa chỉ, giờ mở, điện thoại thì sửa ở A10, "sửa một chỗ mọi nơi đổi";
 * — câu chuyện bếp trưởng và lời hứa dưới hero ở lại file nội dung vì đó là bản
 *   sắc viết một lần, không phải nội dung có người trực.
 *
 * Bài chưa bật là bản NHÁP — website không đọc, nên viết dở rồi bỏ đấy không làm
 * trang tin hiện một tiêu đề cụt.
 */

const CATEGORIES = [
  'Bếp',
  'Nguyên liệu',
  'Chi nhánh',
  'Sự kiện',
  'Thực đơn',
  'Ưu đãi',
  'Câu chuyện',
]
const EMPLOYMENTS = ['Toàn thời gian', 'Toàn thời gian · ca tối', 'Bán thời gian', 'Thời vụ']

type PostDraft = Omit<CmsPost, 'id' | 'updatedAt' | 'updatedBy'>
type JobDraft = Omit<CmsJob, 'id' | 'branchName' | 'updatedAt' | 'updatedBy'>
type HeroDraft = Omit<CmsHeroImage, 'id' | 'updatedAt' | 'updatedBy'>

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

const blankHero = (sort: number): HeroDraft => ({
  imageUrl: '',
  videoUrl: null,
  caption: null,
  captionJa: null,
  published: false,
  sort,
})

export function Cms() {
  const [tab, setTab] = useState<'posts' | 'jobs' | 'hero'>('posts')

  return (
    <>
      <PageHeader
        title="Nội dung website"
        subtitle="Tin tức, tuyển dụng và ảnh · video hero trang chủ. Giá món, ảnh món, giờ mở và địa chỉ thì không nằm ở đây — chúng có nguồn riêng và website đọc thẳng."
        action={
          <SegmentedControl
            size="md"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'posts', label: 'W8 · Tin tức' },
              { value: 'jobs', label: 'W9 · Tuyển dụng' },
              { value: 'hero', label: 'W1 · Ảnh & video hero' },
            ]}
          />
        }
      />

      <div className="min-h-0 flex-1 overflow-y-auto px-8 pb-8">
        {tab === 'posts' ? <PostsTab /> : tab === 'jobs' ? <JobsTab /> : <HeroTab />}

        <p className="mt-4 max-w-[820px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          Website dựng tĩnh và làm mới cache mỗi 60 giây, nên thứ vừa bật sẽ hiện ra trong vòng một
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
            <Toggle
              onChange={() =>
                setDraft({
                  ...draft,
                  input: { ...draft.input, published: !draft.input.published },
                })
              }
              on={draft.input.published}
              tone="ok"
            >
              {draft.input.published ? 'Đăng lên website' : 'Giữ ở nháp'}
            </Toggle>
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

      <div className="mt-5">
        <DataTable
          rows={list}
          rowKey={(row) => row.id}
          loading={posts.isPending}
          empty="Chưa có bài nào. Trang Tin tức sẽ trống cho tới khi có bài được đăng."
          columns={[
            {
              key: 'title',
              header: 'Bài viết',
              width: 'minmax(220px, 1fr)',
              cell: (row, index) => (
                <span className={row.published ? '' : 'opacity-60'}>
                  <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                    {row.title}
                  </span>
                  {row.published && index === 0 ? (
                    <span className="mt-0.5 block text-[length:var(--fs-c1)] text-accent-ink">
                      Đang là bài nổi bật trên W8
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'category',
              header: 'Mục',
              width: '140px',
              cell: (row) => (
                <span className="text-[length:var(--fs-c1)] text-ink-body">{row.category}</span>
              ),
            },
            {
              key: 'publishedOn',
              header: 'Ngày đăng',
              width: '130px',
              cell: (row) => (
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {formatDay(row.publishedOn)}
                </span>
              ),
            },
            {
              key: 'state',
              header: 'Trạng thái',
              width: '120px',
              cell: (row) =>
                row.published ? <Badge tone="ok">Đã đăng</Badge> : <Badge>Nháp</Badge>,
            },
            {
              key: 'actions',
              header: '',
              width: '210px',
              cell: (row) => (
                <span className="flex justify-end gap-2">
                  <Button
                    onClick={() => toggle.mutate({ id: row.id, published: !row.published })}
                    size="sm"
                  >
                    {row.published ? 'Gỡ' : 'Đăng'}
                  </Button>
                  <Button
                    onClick={() => setDraft({ input: toPostDraft(row), id: row.id })}
                    size="sm"
                  >
                    Sửa
                  </Button>
                  <Button onClick={() => remove.mutate(row.id)} size="sm" variant="danger">
                    Xoá
                  </Button>
                </span>
              ),
            },
          ]}
        />
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
                onChange={(v) =>
                  setDraft({ ...draft, input: { ...draft.input, slots: Number(v) || 1 } })
                }
                mono
              />
            </Field>
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Toggle
              onChange={() =>
                setDraft({ ...draft, input: { ...draft.input, published: !draft.input.published } })
              }
              on={draft.input.published}
              tone="ok"
            >
              {draft.input.published ? 'Hiện trên website' : 'Chưa mở tuyển'}
            </Toggle>
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

      <div className="mt-5">
        <DataTable
          rows={list}
          rowKey={(row) => row.id}
          loading={jobs.isPending}
          empty="Chưa có vị trí nào. Trang Liên hệ sẽ mời ứng viên gửi hồ sơ chung."
          columns={[
            {
              key: 'title',
              header: 'Vị trí',
              width: 'minmax(200px, 1fr)',
              cell: (row) => (
                <span
                  className={`truncate text-[length:var(--fs-b2)] text-ink-hi ${
                    row.published ? '' : 'opacity-60'
                  }`}
                >
                  {row.title}
                </span>
              ),
            },
            {
              key: 'branch',
              header: 'Chi nhánh',
              width: '170px',
              cell: (row) => (
                <span className="text-[length:var(--fs-c1)] text-ink-body">
                  {row.branchName ?? 'Cả chuỗi'}
                </span>
              ),
            },
            {
              key: 'employment',
              header: 'Hình thức',
              width: '200px',
              cell: (row) => (
                <span className="text-[length:var(--fs-c1)] text-ink-mute">{row.employment}</span>
              ),
            },
            {
              key: 'slots',
              header: 'Số lượng',
              width: '110px',
              numeric: true,
              cell: (row) => <span className="text-ink-body">{row.slots}</span>,
            },
            {
              key: 'state',
              header: 'Trạng thái',
              width: '130px',
              cell: (row) =>
                row.published ? <Badge tone="ok">Đang tuyển</Badge> : <Badge>Đóng</Badge>,
            },
            {
              key: 'actions',
              header: '',
              width: '210px',
              cell: (row) => (
                <span className="flex justify-end gap-2">
                  <Button
                    onClick={() => toggle.mutate({ id: row.id, published: !row.published })}
                    size="sm"
                  >
                    {row.published ? 'Đóng' : 'Mở'}
                  </Button>
                  <Button
                    onClick={() => setDraft({ input: toJobDraft(row), id: row.id })}
                    size="sm"
                  >
                    Sửa
                  </Button>
                  <Button onClick={() => remove.mutate(row.id)} size="sm" variant="danger">
                    Xoá
                  </Button>
                </span>
              ),
            },
          ]}
        />
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

// --------------------------------------------------------------------- W1

/**
 * Ảnh và video nền hero trang chủ.
 *
 * Một dòng ở đây là một KHUNG của băng chuyền hero, không phải riêng một tấm
 * ảnh: khung nào có đường dẫn video thì hero chiếu video, khung nào không thì
 * chiếu ảnh như trước. Ảnh vẫn phải nhập cho cả hai — với khung video nó là ảnh
 * chờ trong lúc video tải và là thứ hiện thay khi video hỏng.
 *
 * Danh sách rỗng KHÔNG phải lỗi: trang chủ lùi về ảnh của năm món ký như trước
 * khi có màn này. Nói rõ điều đó ngay trên màn, vì "chưa bật ảnh nào" mà trang
 * chủ vẫn có ảnh chạy thì người vừa tắt ảnh cuối cùng sẽ tưởng mình bấm hụt.
 *
 * Trần 8 khung đã bật là của phía website — hero dựng sẵn mọi ảnh trong DOM,
 * khung thứ chín chỉ làm trang nặng. Ở đây chỉ đếm và nhắc, không chặn: chặn tay
 * người nhập giữa lúc họ đang xếp lại thứ tự thì phiền hơn là giúp.
 */
function HeroTab() {
  const toast = useToast()
  const queryClient = useQueryClient()
  const [draft, setDraft] = useState<{ input: HeroDraft; id?: number } | null>(null)

  const images = useQuery({ queryKey: ['cms-hero'], queryFn: api.cmsHeroImages })

  const done = (message: string) => {
    toast(message, 'ok')
    setDraft(null)
    void queryClient.invalidateQueries({ queryKey: ['cms-hero'] })
  }

  const save = useMutation({
    mutationFn: ({ input, id }: { input: HeroDraft; id?: number }) =>
      id === undefined ? api.createCmsHeroImage(input) : api.updateCmsHeroImage(id, input),
    onSuccess: () => done('Đã lưu khung hero — trang chủ đổi theo trong vòng một phút'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const remove = useMutation({
    mutationFn: (id: number) => api.deleteCmsHeroImage(id),
    onSuccess: () => done('Đã xoá khung khỏi hero'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const toggle = useMutation({
    mutationFn: ({ id, published }: { id: number; published: boolean }) =>
      api.updateCmsHeroImage(id, { published }),
    onSuccess: (row) => done(row.published ? 'Đã bật khung lên hero' : 'Đã tắt khung khỏi hero'),
    onError: (err: Error) => toast(err.message, 'danger'),
  })

  const list = images.data ?? []
  const shown = list.filter((row) => row.published).length
  const shownVideos = list.filter((row) => row.published && row.videoUrl).length

  return (
    <>
      {images.isError ? <ErrorState message={(images.error as Error).message} /> : null}

      <div className="flex items-center justify-between gap-4">
        <p className="max-w-[620px] text-[length:var(--fs-c1)] leading-relaxed text-ink-mute">
          {shown === 0
            ? 'Chưa bật khung nào, nên hero trang chủ đang chiếu ảnh của năm món ký đầu danh sách như trước giờ.'
            : `Hero đang chiếu ${shown} khung${
                shownVideos > 0 ? ` (${shownVideos} video)` : ''
              }, lần lượt theo cột thứ tự.${shown > 8 ? ' Trang chủ chỉ lấy 8 khung đầu.' : ''}`}
        </p>
        {draft ? null : (
          <Button variant="primary" onClick={() => setDraft({ input: blankHero(list.length) })}>
            Thêm khung
          </Button>
        )}
      </div>

      {draft ? (
        <section className="mt-4 rounded-md border border-accent bg-surface-1 p-5">
          <div className="grid gap-4 lg:grid-cols-[1fr_200px]">
            <div className="grid gap-4">
              <Field
                label="Đường dẫn ảnh"
                hint="Bắt buộc. Có video thì đây là ảnh chờ lúc video tải và là thứ hiện thay khi video hỏng."
              >
                <Input
                  value={draft.input.imageUrl}
                  onChange={(v) => setDraft({ ...draft, input: { ...draft.input, imageUrl: v } })}
                  placeholder="https://…/hero-than-hoa.jpg"
                />
              </Field>
              <Field
                label="Đường dẫn video"
                hint="Bỏ trống là khung ảnh tĩnh. Tệp .mp4 chiếu không tiếng, tự chuyển khung khi hết."
              >
                <Input
                  value={draft.input.videoUrl ?? ''}
                  onChange={(v) =>
                    setDraft({ ...draft, input: { ...draft.input, videoUrl: v || null } })
                  }
                  placeholder="https://…/hero-than-hoa.mp4"
                />
              </Field>
              <div className="grid gap-4 lg:grid-cols-[1fr_180px_120px]">
                <Field
                  label="Tiêu đề trên ảnh"
                  hint="Chữ lớn hiện đè lên ảnh. Bỏ trống thì hero in tên quán."
                >
                  <Input
                    value={draft.input.caption ?? ''}
                    onChange={(v) =>
                      setDraft({ ...draft, input: { ...draft.input, caption: v || null } })
                    }
                    placeholder="Bếp than tầng hai"
                  />
                </Field>
                <Field label="Chữ Nhật" hint="Dòng nhỏ dưới tiêu đề">
                  <Input
                    value={draft.input.captionJa ?? ''}
                    onChange={(v) =>
                      setDraft({ ...draft, input: { ...draft.input, captionJa: v || null } })
                    }
                    placeholder="炭火"
                  />
                </Field>
                <Field label="Thứ tự">
                  <Input
                    type="number"
                    value={String(draft.input.sort)}
                    onChange={(v) =>
                      setDraft({ ...draft, input: { ...draft.input, sort: Number(v) || 0 } })
                    }
                    mono
                  />
                </Field>
              </div>
            </div>
            <HeroPreview
              url={draft.input.imageUrl}
              videoUrl={draft.input.videoUrl}
              className="aspect-[3/2] w-full"
            />
          </div>

          <div className="mt-4 flex items-center gap-3">
            <Toggle
              onChange={() =>
                setDraft({ ...draft, input: { ...draft.input, published: !draft.input.published } })
              }
              on={draft.input.published}
              tone="ok"
            >
              {draft.input.published ? 'Chiếu trên trang chủ' : 'Chưa chiếu'}
            </Toggle>
            <div className="ml-auto flex gap-2">
              <Button onClick={() => setDraft(null)}>Bỏ</Button>
              <Button
                variant="primary"
                disabled={draft.input.imageUrl.trim() === '' || save.isPending}
                onClick={() => save.mutate(draft)}
              >
                Lưu khung
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      <div className="mt-5">
        <DataTable
          rows={list}
          rowKey={(row) => row.id}
          loading={images.isPending}
          empty="Chưa có khung nào. Hero trang chủ đang chiếu ảnh của năm món ký đầu danh sách."
          columns={[
            {
              key: 'image',
              header: 'Nền',
              width: '120px',
              /* Ô xem trước ở đây chỉ chiếu ẢNH kể cả với khung video: mở màn mà
                 chục video cùng tải một lúc thì bảng giật. Muốn xem video chạy
                 thì bấm Sửa — ô xem trước trong biểu mẫu chiếu thật. */
              cell: (row) => (
                <span className="relative block h-12 w-[92px]">
                  <HeroPreview url={row.imageUrl} className="h-12 w-[92px]" />
                  {row.videoUrl ? (
                    <span className="absolute inset-x-0 bottom-0 bg-canvas/85 text-center text-[length:var(--fs-c2)] font-semibold tracking-[0.08em] text-accent-ink uppercase">
                      Video
                    </span>
                  ) : null}
                </span>
              ),
            },
            {
              key: 'caption',
              header: 'Tiêu đề',
              width: 'minmax(200px, 1fr)',
              cell: (row) => (
                <span className={row.published ? '' : 'opacity-60'}>
                  <span className="block truncate text-[length:var(--fs-b2)] text-ink-hi">
                    {row.caption ?? '— hero in tên quán —'}
                  </span>
                  <span className="mt-0.5 block truncate text-[length:var(--fs-c1)] text-ink-mute">
                    {row.videoUrl ?? row.imageUrl}
                  </span>
                </span>
              ),
            },
            {
              key: 'captionJa',
              header: 'Chữ Nhật',
              width: '120px',
              cell: (row) => (
                <span className="text-[length:var(--fs-c1)] text-ink-body">
                  {row.captionJa ?? '—'}
                </span>
              ),
            },
            {
              key: 'sort',
              header: 'Thứ tự',
              width: '90px',
              numeric: true,
              cell: (row) => (
                <span className="font-mono text-[length:var(--fs-c1)] text-ink-mute">
                  {row.sort}
                </span>
              ),
            },
            {
              key: 'state',
              header: 'Trạng thái',
              width: '130px',
              cell: (row) =>
                row.published ? <Badge tone="ok">Đang chiếu</Badge> : <Badge>Chưa chiếu</Badge>,
            },
            {
              key: 'actions',
              header: '',
              width: '210px',
              cell: (row) => (
                <span className="flex justify-end gap-2">
                  <Button
                    onClick={() => toggle.mutate({ id: row.id, published: !row.published })}
                    size="sm"
                  >
                    {row.published ? 'Tắt' : 'Bật'}
                  </Button>
                  <Button
                    onClick={() => setDraft({ input: toHeroDraft(row), id: row.id })}
                    size="sm"
                  >
                    Sửa
                  </Button>
                  <Button onClick={() => remove.mutate(row.id)} size="sm" variant="danger">
                    Xoá
                  </Button>
                </span>
              ),
            },
          ]}
        />
      </div>
    </>
  )
}

/**
 * Ô xem trước: ảnh hỏng thì hiện ô chữ 空 thay vì biểu tượng ảnh vỡ của trình duyệt.
 *
 * Nhớ ĐƯỜNG DẪN hỏng chứ không nhớ một cờ `broken`: người gõ nhầm rồi sửa lại thì
 * ô xem trước phải thử tải lại ngay, chứ không nằm im báo hỏng cho tới lúc tải lại trang.
 *
 * Hai đường dẫn nhớ riêng hai cờ. Chung một cờ thì video hỏng rồi ảnh cũng hỏng
 * sẽ xoá cờ của nhau và ô xem trước quay vòng thử lại vô tận.
 */
function HeroPreview({
  url,
  videoUrl,
  className,
}: {
  url: string
  videoUrl?: string | null
  className: string
}) {
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null)
  const [brokenVideo, setBrokenVideo] = useState<string | null>(null)
  const src = url.trim()
  const video = videoUrl?.trim() ?? ''

  // Video hỏng thì rơi xuống nhánh ảnh bên dưới — đúng thứ trang chủ làm
  if (video !== '' && video !== brokenVideo) {
    return (
      <video
        key={video}
        src={video}
        poster={src === '' || src === brokenUrl ? undefined : src}
        autoPlay
        muted
        loop
        playsInline
        onError={() => setBrokenVideo(video)}
        className={`rounded-sm border border-line-1 object-cover ${className}`}
      />
    )
  }

  const still =
    src === '' || src === brokenUrl ? (
      <div
        className={`grid place-items-center rounded-sm border border-line-1 bg-surface-3 font-jp text-[length:var(--fs-b1)] text-ink-mute ${className}`}
        title={src === '' ? 'Chưa nhập đường dẫn' : 'Không tải được ảnh từ đường dẫn này'}
      >
        空
      </div>
    ) : (
      <img
        src={src}
        alt=""
        onError={() => setBrokenUrl(src)}
        className={`rounded-sm border border-line-1 object-cover ${className}`}
      />
    )

  if (video === '') return still

  // Có dán video mà ô xem trước lại đứng im: nói thẳng là hỏng, đừng để người
  // nhập lưu xong rồi mới phát hiện trang chủ không chạy video nào.
  return (
    <span className="relative block">
      {still}
      <span className="absolute inset-x-0 bottom-0 bg-danger/85 px-1 text-center text-[length:var(--fs-c2)] font-semibold text-ink-cream">
        Không tải được video
      </span>
    </span>
  )
}

function toHeroDraft(row: CmsHeroImage): HeroDraft {
  return {
    imageUrl: row.imageUrl,
    videoUrl: row.videoUrl,
    caption: row.caption,
    captionJa: row.captionJa,
    published: row.published,
    sort: row.sort,
  }
}
