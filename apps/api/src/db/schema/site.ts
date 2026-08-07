import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
} from 'drizzle-orm/pg-core'
import { branches, staff } from './identity'

/**
 * ====== A8 · NỘI DUNG WEBSITE ======
 *
 * Ba thứ vào đây: **tin tức (W8)**, **tuyển dụng (W9)** và **ảnh hero trang chủ
 * (W1)** — phần mà `apps/web/content/site.ts` đã hẹn sẵn sẽ chuyển sang khi A8 lên.
 *
 * Phần còn lại của website (lời hứa dưới hero, câu chuyện bếp trưởng, lời dẫn
 * từng chương thực đơn) CỐ Ý ở lại file nội dung: đó là bản sắc viết một lần chứ
 * không phải nội dung đổi hằng tuần, và kéo nó vào CSDL chỉ tạo thêm một màn phải
 * bảo trì mà không ai mở tới.
 *
 * Giá, giờ mở, số bàn thì không bao giờ vào đây — website đọc chúng từ trung tâm
 * sản phẩm và từ A10 (§18.1).
 */

/**
 * W8 — tin tức. Bài mới nhất là bài nổi bật, nên không có cờ "featured": một cờ
 * nữa chỉ tạo cửa cho hai bài cùng nhận mình là bài đầu.
 */
export const sitePosts = pgTable(
  'site_posts',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    title: text('title').notNull(),
    /** Bếp · Nguyên liệu · Chi nhánh · Sự kiện · Thực đơn · Ưu đãi · Câu chuyện */
    category: text('category').notNull(),
    excerpt: text('excerpt'),
    /** Ngày đăng do người viết đặt — trang tin sắp theo cột này, không theo `createdAt` */
    publishedOn: date('published_on').notNull(),
    published: boolean('published').notNull().default(false),
    updatedBy: bigint('updated_by', { mode: 'number' }).references(() => staff.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('site_posts_published_idx').on(t.published, t.publishedOn)],
)

/**
 * W9 — tin tuyển dụng.
 *
 * `branchId` NULL = tuyển cho cả chuỗi (cùng quy ước với `staff_roles`): tin
 * "Phục vụ bàn — cả ba chi nhánh" là một tin, không phải ba.
 */
export const siteJobs = pgTable(
  'site_jobs',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    title: text('title').notNull(),
    branchId: text('branch_id').references(() => branches.id),
    /** 'Toàn thời gian' · 'Bán thời gian' · 'Toàn thời gian · ca tối' */
    employment: text('employment').notNull(),
    slots: smallint('slots').notNull().default(1),
    published: boolean('published').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    updatedBy: bigint('updated_by', { mode: 'number' }).references(() => staff.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('site_jobs_slots_check', sql`${t.slots} BETWEEN 1 AND 99`),
    index('site_jobs_published_idx').on(t.published, t.sort),
  ],
)

/**
 * W1 — ảnh và video nền chiếu vòng của hero trang chủ.
 *
 * Trước bảng này hero chiếu ảnh của năm món ký đầu danh sách, nên muốn đưa ảnh
 * không gian quán hay ảnh một dịp lên trang chủ thì không có cửa nào. Bảng này là
 * cửa đó, và chỉ cho hero: các ô ảnh khác của website vẫn nằm nguyên chỗ cũ.
 *
 * Danh sách rỗng KHÔNG phải lỗi — trang chủ lùi về đúng năm món ký như cũ. Nhờ
 * vậy bản mới lên mà chưa ai kịp nhập ảnh thì hero vẫn đủ ảnh để chiếu.
 *
 * `caption` là chữ hiện ở góc dưới hero, nơi trước đây in tên món. Bỏ trống được:
 * ảnh không gian thì thường không có gì để chú.
 */
export const siteHeroImages = pgTable(
  'site_hero_images',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    /** Đường dẫn ảnh như mọi ô ảnh khác của Office — không phải tệp tải lên */
    imageUrl: text('image_url').notNull(),
    /**
     * Video chiếu đè lên ảnh. Bỏ trống là khung ảnh tĩnh như trước.
     *
     * Ảnh vẫn BẮT BUỘC kể cả khi có video: nó là ảnh chờ (`poster`) hiện ngay
     * trong lúc video tải, và là thứ hiện thay khi video hỏng hoặc máy khách
     * không phát được. Hero là khối LCP của trang chủ — để nó trống chờ vài trăm
     * kilobyte video là đánh đổi đúng thứ mà cả trang đang giữ.
     */
    videoUrl: text('video_url'),
    caption: text('caption'),
    /** Dòng chữ Nhật in nhạt cạnh `caption`, đúng chỗ tên tiếng Nhật của món */
    captionJa: text('caption_ja'),
    sort: integer('sort').notNull().default(0),
    published: boolean('published').notNull().default(false),
    updatedBy: bigint('updated_by', { mode: 'number' }).references(() => staff.id),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('site_hero_images_published_idx').on(t.published, t.sort)],
)
