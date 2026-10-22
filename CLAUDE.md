# CLAUDE.md — Tokyo Sora

Hướng dẫn làm việc trong repo này cho Claude và cho người mới. Đọc hết một lần
trước khi sửa code, sau đó dùng như bảng tra. Cập nhật: 21/10/2026 (rà soát toàn bộ
code ở commit `68d373a`). Đổi quy ước hay định hướng thì sửa file này **trong cùng
commit** với code.

Tài liệu đi kèm — file này không lặp lại nội dung của chúng:

| File | Nội dung |
|---|---|
| `DEV.md` | Chạy trên máy dev: Postgres, `.env`, tài khoản/PIN dev, va chạm cookie trên `localhost` |
| `DEPLOY.md` | Vercel + Supabase: 8 project, biến môi trường, `ignoreCommand`, kiểm chứng sau deploy |
| `THIET-BI.md` | Lắp máy tại quán: ghép thiết bị, kiosk mode, bài kiểm 5 phút, cập nhật phần mềm |
| `tokyo-sora-ke-hoach-thiet-ke.md` | **Bản thiết kế gốc** (§1–34): quyết định đã chốt, RBAC, design system, 139 màn, trạm bếp |
| `huong-dan-su-dung/` | Hướng dẫn người dùng từng app; `01-tong-quan-he-thong.md` là bản đồ tốt nhất |
| `designs/*.dc.html` | Prototype HTML hi-fi — **tham chiếu**, không copy code |

---

## 0. Tóm tắt 60 giây

- Hệ thống vận hành nhà hàng nướng than **Tokyo Sora**, đa chi nhánh, chạy hoàn toàn
  trên trình duyệt: 7 app giao diện + 1 API, monorepo pnpm, TypeScript strict, React 19,
  NestJS 11 + Fastify, Drizzle + PostgreSQL (Supabase), deploy Vercel. Chưa có app native.
- **Toàn bộ bằng tiếng Việt**: UI, comment, thông báo lỗi, tên màn (T2, P4, K2…), commit.
- **Phong cách giao diện đã chốt = https://tokyo-sora.vn** (`apps/web`). Mọi app khác
  dựng theo đúng phong cách này: nền mực sumi, vàng đồng thau làm kim loại chứ không phải
  màu nền, chữ Cormorant/Be Vietnam Pro/Plex Mono, kanji Shippori trang trí. Chi tiết §4.
- Tình trạng 08/2026: 139 màn thiết kế đã dựng xong; ngân hàng và hoá đơn điện tử đang
  chạy bản giả lập (`MockBankProvider`); chưa có cầu in; **chưa có app nào nghe
  realtime** — tất cả đang polling (§5.6). Nhánh làm việc: `gd1-xuong-song-van-hanh`.
- **Định hướng 10/2026** (§9): mỗi bàn một **iPad Gen 7** gắn cố định để khách gọi món
  và **tự mở bàn** (QR điện thoại **đã gỡ** 22/10); **bàn đôi** chạy độc lập hoặc ghép; **màn
  chờ chạy quảng cáo** khi bàn chưa mở; POS gọi món của nhân viên chạy tốt trên **cả iPad
  lẫn điện thoại**; **dựng lại màn bếp**; **khuyến mãi áp dụng chung** mọi kênh, giá giảm
  ghi thẳng vào đơn (§9.6); **tốc độ là yêu cầu cứng** — ảnh trên web hiện quá chậm (§8).

---

## 1. Bản đồ repo

| Thư mục | Gói | App | Người dùng · thiết bị | Dev | Production |
|---|---|---|---|---|---|
| `apps/api` | `@sora/api` | API NestJS | — | `:3000` | `api.tokyo-sora.vn` (Vercel Function, vùng `sin1`) |
| `apps/web` | `@sora/web` | Sora Web (Next 15) | Khách online · máy tính + điện thoại | `:3001` | `tokyo-sora.vn` |
| `apps/table` | `@sora/table` | Sora Table | Khách tại bàn · **iPad gắn bàn** 1080×810 ngang, ghép kind `table` (§9.1) — không còn bản điện thoại | `:5173` | `ban.tokyo-sora.vn` |
| `apps/pos` | `@sora/pos` | Sora POS (PWA) | Phục vụ, thu ngân · tablet 11″ ngang + máy thu ngân 22″ → **sắp tới thêm iPad & điện thoại** | `:5174` | `pos.tokyo-sora.vn` |
| `apps/kitchen` | `@sora/kitchen` | Sora Kitchen / KDS (PWA) | Bếp từng trạm, ra món · TV 32–43″ 1920×1080, Android box | `:5175` | `kds.tokyo-sora.vn` |
| `apps/office` | `@sora/office` | Sora Office | Chủ, quản lý, kế toán, HR, marketing · desktop 1440+, **nền sáng** | `:5176` | `admin.tokyo-sora.vn` |
| `apps/staff` | `@sora/staff` | Kênh nhân viên (H8 lịch/công · H9 phiếu lương) — **không phải app gọi món** | `:5178` | `nv.tokyo-sora.vn` |
| `apps/kiosk` | `@sora/kiosk` | Kiosk chấm công (H10) · tablet 10″ gắn cố định | `:5179` | `chamcong.tokyo-sora.vn` |

Tên miền thật có gạch nối (`tokyo-sora.vn`). Nhiều tài liệu và `SITE_URL` mặc định
còn ghi `tokyosora.vn` — đó là chỗ lệch, không phải tên miền thứ hai.

**Gói dùng chung (`packages/`)**

- `contracts` — hợp đồng dữ liệu: zod schema, enum, tiền VND (`computeOrderTotals`,
  `formatVnd`, `roundToUnit`), ma trận quyền (`ROLES`, `ACTIONS`, `can`, `needsApproval`),
  tên topic/room realtime. Build ra `dist/` (gitignore) → **phải build trước** khi
  typecheck/build API và app. Import nội bộ trong gói bắt buộc có đuôi `.js`.
- `core` — runtime trình duyệt cho các SPA: `apiFetch` (gắn `x-sora-device`,
  `idempotency-key`), `session` (localStorage `sora.device.token`), **outbox** Dexie/IndexedDB
  gửi lại khi có mạng, `ember` (thang than hồng), `server-clock`. API không dùng gói này.
- `ui` — 16 thành phần dùng chung + `useToast` (§4.6). Ship TS thô, không build.
- `tokens` — `tokens.css` là **nguồn duy nhất** của màu, cỡ chữ, bo góc, chuyển động;
  `fonts.css` + `fonts/*.woff2` self-host, sinh bằng `scripts/fetch-fonts` (không sửa tay).
- `config` — `tsconfig.base.json` (strict, `noUncheckedIndexedAccess`, bundler resolution).

**Khác:** `scripts/` (`extract-seed` sinh JSON seed từ prototype, `fetch-fonts`,
`make-icons` dùng `sharp`, `vercel-ignore.sh`, SQL chạy một lần), `deploy/` (Docker +
Caddy — **dự phòng**, không còn là đường deploy chính), `.claude/launch.json` (cấu hình
chạy từng app trong Claude: `web`, `pos`, `table`, `kitchen`, `office`, `staff`, `kiosk`,
`api`, `ui-lab`).

---

## 2. Lệnh

```bash
pnpm install
pnpm --filter @sora/contracts build      # bắt buộc trước typecheck/build lần đầu
pnpm dev:api                             # chạy trước — mọi app proxy /api về :3000
pnpm dev:web | dev:table | dev:pos | dev:kitchen | dev:office | dev:staff | dev:kiosk
pnpm dev:lab                             # :5177 — trang đối chiếu token, không deploy

pnpm lint && pnpm -r typecheck && pnpm -r test && pnpm -r build   # đúng thứ tự CI
pnpm --filter @sora/api test src/modules/ordering/domain/order-state.test.ts -t "tên test"

pnpm --filter @sora/api db:generate      # drizzle-kit → migrations/00NN_<tên>.sql
pnpm --filter @sora/api db:migrate       # runner riêng, chạy mọi *.sql theo tên file
pnpm --filter @sora/api db:seed          # upsert idempotent; reset mật khẩu Office mẫu
pnpm --filter @sora/api db:dev-bootstrap # tạo thiết bị dev + phát hành bundle, in token
pnpm --filter @sora/pos build && pnpm --filter @sora/pos preview   # thử service worker :4174 (kitchen :4175)
```

- API cần `apps/api/.env` (xem `.env.example`): `DATABASE_URL` (role `sora_app`),
  `DATABASE_MIGRATION_URL` (superuser), `TEST_DATABASE_URL` (**DB riêng** — harness
  `DROP SCHEMA public CASCADE`). Lệnh Docker dựng Postgres test nằm trong `DEV.md`.
- Thiết bị dev: dán token do `db:dev-bootstrap` in ra vào
  `localStorage.setItem('sora.device.token', …)` rồi reload.
- Trên `localhost` cookie không phân biệt cổng: mở kiosk ở **cửa sổ ẩn danh** khi đang
  đăng nhập POS/Office. Sora Table không cần — token iPad bàn thắng cookie nhân viên
  (`dev-table-token` của `db:dev-bootstrap` = iPad bàn đầu tiên; xoá token là về màn ghép).

---

## 3. Quy ước code

**Ngôn ngữ**
- UI copy, comment, thông báo lỗi, tài liệu: tiếng Việt có dấu, câu ngắn, sentence case,
  nút là động từ ("Gửi bếp", không "Xác nhận"); từ ở nút = từ ở thông báo kết quả.
- Tên bảng/cột SQL: tiếng Anh `snake_case`, bảng số nhiều. TS: `camelCase`. Giá trị enum
  nghiệp vụ có thể là slug tiếng Việt không dấu (`phuc-vu`, `them-than`, `linh_hoat`).
- Định danh tiếng Việt không dấu được phép ở front-end (`dangMo`, `chonPhuong`,
  `--tieu-diem`) — giữ nhất quán trong cùng file/module. URL slug tiếng Việt không dấu.
- Comment giải thích **vì sao** (quyết định, đánh đổi, mã màn §), không kể lại code.
  Repo không có TODO/FIXME — việc chưa làm ghi vào docs hoặc issue, không rải trong code.

**Định dạng:** Prettier single quote, không chấm phẩy, width 100, trailing comma.
`.editorconfig`/`.gitattributes` = UTF-8, LF. ESLint (`eslint.config.mjs`) **cấm** màu
tuỳ ý `bg-[#…]` và `dangerouslySetInnerHTML` trong `apps/**/src` và `packages/**/src`.
`apps/web` không có `src/` nên **nằm ngoài rule** — vẫn phải tự tuân thủ.

**Commit:** `type: nội dung tiếng Việt KHÔNG dấu` với `type` ∈ feat · fix · refactor ·
chore · style · perf · test · deploy · docs. Thân commit giải thích quyết định, có thể
dài, tiêu đề mục viết HOA (xem `git log -3`). Một commit = một việc.

**TypeScript:** strict + `noUncheckedIndexedAccess`. Không `any`. Dữ liệu từ API ở
front-end hiện đang `body as T` với kiểu viết tay — code **mới** lấy kiểu/schema từ
`@sora/contracts`, không thêm bản sao (đã trùng `ConfigBundle`, `OrderLineRow`… ở 3 app).

**Thư viện đang dùng — không thêm cái tương đương:** React 19, react-router 8 (khai báo
`<BrowserRouter><Routes>`), TanStack Query 5, Dexie 4, zod 4, Tailwind 4, vite-plugin-pwa,
`qrcode-generator`, Next 15 (web). **Không có** zustand/redux/axios/clsx/cva/tailwind-merge
/lucide. Class ghép bằng `[...].join(' ')`.

**Đặt tên file:** màn hình và thành phần `PascalCase.tsx`; module khác `kebab-case.ts`
(`cart-context.tsx`, `api.ts`). Thư mục màn: `routes/` (table, pos, staff, office),
`screens/` (kitchen, kiosk), `app/` (web) — theo app đang có, không đổi.
Key localStorage/sessionStorage: `sora.<app>.<tên>`.

---

## 4. Hệ thiết kế (Sora Design System) — phong cách tokyo-sora.vn

### 4.1 Tinh thần
Bảng màu đi từ **mực sumi** (đen ám xanh, không đen thuần) lên **đồng thau hoàng hôn**.
Chất liệu: than hoa, vỉ gang, đồng xước, giấy washi. Ba quy tắc giữ "sang" không
"sến": **vàng là kim loại** (viền mảnh, chữ nhấn — không nền lớn, không gradient chói);
khoảng trống nhiều hơn mức thấy thoải mái; **mỗi màn một điểm vàng mạnh nhất**.
**Thang than hồng** (tro → đồng → cam than → đỏ lửa) là ngôn ngữ tiến độ dùng ở mọi app:
đồng hồ KDS, tiến độ đơn, mức tồn kho. Back-office (Office) nền sáng ngà. Chữ vàng
< 14px: cấm. Nút chính = nền `accent-strong`, chữ tối `on-accent` — không chữ trắng trên
vàng. Màu không bao giờ là thông tin duy nhất — luôn kèm chữ hoặc icon.

### 4.2 Token — chỉ có trong `packages/tokens/tokens.css`
Ba lớp: `--sora-*` (bảng màu thô) → `--t-*` (ngữ nghĩa, đổi theo `[data-theme]`) →
`@theme inline` sinh utility Tailwind. **Bảng màu mặc định của Tailwind bị xoá**
(`--color-*: initial`): `bg-black`, `text-white`, `bg-gray-*`… **không sinh CSS** và
lint không bắt được — đây là nguồn của lỗi nền mờ trong suốt (§11).

Utility màu hợp lệ:
- Ngữ nghĩa: `canvas` · `surface-1..4` · `line-1..4` · `ink-hi` / `ink-body` / `ink-mute` ·
  `accent` / `accent-strong` / `accent-ink` / `on-accent`.
- Thô: `ink-cream` · `gold-200/300/500/600/700/900` · `kraft` / `kraft-ink` / `kraft-ink-2` ·
  `ok` / `ok-strong` · `warn` · `danger` / `danger-line` / `danger-line-2` · `info` · `ember-0..3`.
- Nền mờ (backdrop): `bg-canvas/70`. Viền mảnh vàng: `border-accent/16`.
- Washi, `gold-light`, nền thô: dùng `var(--sora-*)` trực tiếp. Hex chỉ được xuất hiện
  trong `packages/tokens`.

Bo góc: `rounded-sm` 4 (nút, ô nhập) · `rounded-md` 8 (thẻ) · `rounded-lg` 12 (modal) ·
`rounded-pill`. Nền tối **không đổ bóng** — dùng bậc nền + viền vàng mảnh.
Chuyển động: `--dur-micro` 120ms · `--dur-panel` 200 · `--dur-sheet` 280 · `--dur-reveal`
480 · `--ease-sora`; keyframes `sora-fade/rise/slide/pulse/tick/late`; tôn trọng
`prefers-reduced-motion` (đã xử lý toàn cục). **KDS chỉ có một hiệu ứng:** `sora-late`
nhấp nháy viền vé quá giờ.

### 4.3 Chữ
| Vai trò | Utility | Font (self-host) | Weight | Dùng |
|---|---|---|---|---|
| Giao diện (mặc định) | `font-sans` | Be Vietnam Pro | 400/500/600/700 | Mọi nơi |
| Display | `font-display` | Cormorant Garamond | 300/600 | Tiêu đề website, tên nhóm món khách — **chỉ ≥ 28px** |
| Số liệu | `font-mono` | IBM Plex Mono | 400/500 | Tiền, mã đơn, đồng hồ, định lượng — luôn `tabular-nums`; **không** `font-semibold` (chưa nạp 600, trình duyệt làm giả) |
| Kanji | `font-jp` | Shippori Mincho B1 | 400/600 | Chỉ kana/kanji trang trí |

Shippori được subset **đúng 23 kanji** `東京空炭火焼膳鮮揚鍋汁甘麦酒茶牛豚海野生御美味` +
katakana. Dùng kanji ngoài danh sách là rơi về font hệ thống — thêm chữ vào
`scripts/fetch-fonts/fetch.mjs` rồi chạy lại. Kanji **không bao giờ là thông tin duy
nhất**; watermark ≤ 6% opacity; kanji in/đăng phải được người biết tiếng Nhật duyệt.

Cỡ chữ: `text-[length:var(--fs-*)]` với `d1` 60 · `d2` 44 · `d3` 30 · `t1` 22 · `t2` 18 ·
`b1` 16 · `b2` 14 · `c1` 13 · `c2` 11 (nhãn viết hoa `tracking-[0.12em]`–`[0.14em]`).
KDS có thang riêng `--fs-ticket-dish` / `--fs-ticket-qty` / `--fs-clock`. Không dùng
`text-sm`/`text-lg` của Tailwind.

### 4.4 Vùng chạm và chủ đề theo app
`--hit-target`: **44px** mặc định (khách, web, staff) · **52px** `<html data-scale="pos">`
(POS, kiosk) · **64px × `--kds-zoom`** `data-scale="kds"` (KDS; rơi về 44 khi màn
≤ 1000px cao). Office dùng `data-theme="light"`, điều khiển 36px (`h-9`) vì dùng chuột.
Thành phần dùng `h-[var(--hit-target)]`, không hard-code chiều cao nút.

### 4.5 Bố cục và điều kiện thực tế
Bếp hơi nước, tay ướt → nút to, không hover, không kéo-thả. Sàn ồn 75 dB → không dựa
vào âm thanh. Bàn ăn tối → tương phản dư. Nhân viên cầm khay → POS thao tác một tay,
phím chính nửa dưới màn. Khách: nút hành động ở 1/3 dưới màn, chữ nhỏ nhất 14px
(iPad tại bàn: chữ phụ 13px theo thang đã duyệt ở §9.1).
Trạng thái: rỗng = một câu + một nút (`EmptyState`); đang tải = `Skeleton` đúng hình,
không spinner toàn màn; lỗi = nói chuyện gì xảy ra và làm gì tiếp (`ErrorState`);
mất mạng = dải báo + hàng đợi cục bộ, màn thanh toán bị chặn.

### 4.6 `@sora/ui` — dùng trước, thiếu thì thêm vào đây
`Button` (variant theo **ý định**: `primary` ghi vào hồ sơ · `secondary` viền · `ghost` ·
`danger` · `success`; size `sm` 36 · `md` = hit-target · `lg` ×1.25 · `xl` ×1.5) ·
`PinPad` (`reveal` hiện số — chỉ cho mã ghép thiết bị, không cho PIN) ·
`Modal` · `ToastProvider`/`useToast(push(msg, tone))` · `Card` · `SectionLabel` ·
`EmptyState` · `ErrorState` · `Skeleton` · `Badge` · `Money` · `TableTile` (P2) ·
`OrderTicket` (K2) · `MenuItemCard` (P4 — cố ý **không ảnh**) · `OutboxBanner` ·
`QrCode` (entry riêng `@sora/ui/QrCode` để web không kéo Dexie) · `PromoTag` (nhãn khuyến
mãi §9.6, entry riêng `@sora/ui/PromoTag`; web khai `@source` đúng file đó trong
`globals.css` vì web không quét cả gói) · `OptimizedImage`/`optimizedSrc` (entry
`@sora/ui/image`: ảnh Office cho app Vite qua bộ tối ưu của web, bị từ chối thì rơi về ảnh
gốc — §8.1).

Quy tắc: mọi `<button>` có `type="button"`; variant là `Record<Union,string>` UPPER_CASE;
không responsive prefix trong gói; app Vite **phải** có `@source '../../../packages/ui/src'`
trong `index.css` nếu không class của gói không được sinh. Thành phần mới dùng ≥ 2 app →
đặt trong `@sora/ui`, không copy sang app thứ hai. `MenuIndex`, `DishCounter` giờ chỉ còn
ở web — bản sao của table gỡ cùng bố cục điện thoại (10/2026). Màn ghép máy của kitchen và
kiosk còn tự chép lưới phím; màn ghép mới dùng `PinPad reveal` như iPad bàn.

### 4.7 Icon và ảnh
Icon: inline SVG `viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}`,
cỡ 20/24/32 (KDS 32). Không icon font, không cài thư viện. Icon dùng ≥ 2 chỗ → gom vào
một file `icons.tsx` của app (hiện đang rải rác, stroke lệch 1.4–3.6 — chuẩn hoá khi chạm).
Không emoji trong UI vận hành.

Ảnh món: **PNG tách nền** đặt trên "đĩa ảnh" CSS (radial gradient `--sora-line-1` →
`--sora-surface-4`, drop-shadow, món chiếm ~80% khung). Khung: 1:1 thumbnail · 4:3 thẻ ·
3:2 chi tiết. Chưa có ảnh: đĩa trống + kanji đầu tên món (`DishGlyph` web, `Plate` table).
Không ảnh stock. Yêu cầu kỹ thuật về kích thước/định dạng/tải ảnh ở **§8** — bắt buộc.

---

## 5. Kiến trúc và backend

### 5.1 Bốn nguyên tắc (vi phạm là nguồn của hầu hết lỗi vận hành)
1. **Office là nguồn duy nhất của cấu hình** (món, giá, set, sơ đồ bàn, vùng giao, tham
   số). Phát hành thành **config bundle** có version (`GET /api/config?branch=` với
   ETag/304). Web · Table · POS · Kitchen chỉ đọc. Sửa mà chưa phát hành thì app chưa thấy.
2. **API (Order Service) là nguồn duy nhất của đơn.** Không app nào giữ trạng thái đơn
   riêng; giỏ hàng ở client chỉ là nháp cho tới khi gửi.
3. **Bếp không thấy tiền, không biết khách.** `tickets`/`ticket_items` cấm cột tiền
   (event trigger `sora_kitchen_money_guard` chặn ở DDL).
4. **Mất mạng không được mất đơn.** Mọi ghi từ POS/KDS/Table qua outbox + idempotency key;
   trạng thái thay đổi phải phát tới app đang mở màn liên quan.

### 5.2 Stack và hình dáng API (`apps/api`)
NestJS 11 + Fastify 5 (ghim `fastify@5.11.0` ở root) + Drizzle 0.45 + `pg`; zod 4;
argon2id cho PIN/mật khẩu; biên dịch **CommonJS**. Chạy trên Vercel như một Function
(`api/index.ts`, vùng `sin1`, pool size 1, cold start 1–2 s, **không tiến trình nền**).
Không global prefix — mỗi controller tự viết `@Controller('api/…')`.

Thư mục `src/`: `common/` (DbModule, `tx.ts`, `outbox.ts`, `idempotency.interceptor.ts`,
`zod-exception.filter.ts`, `pg-error.ts`, `params.service.ts`, `period-lock.service.ts`,
`business-date.ts`, `display-code.ts`) · `db/` (schema 15 file, 95 bảng; `migrate.ts`;
seed; bootstrap) · `modules/<domain>/` (`*.module.ts`, `*.controller.ts`, `*.service.ts`,
`domain/*.ts` **thuần**, không import Nest/Drizzle) · `test/` (harness + e2e).

Module: identity (global) · realtime · config-bundle · ordering (bàn, phiên, dòng, đợt,
chuyển/ghép/tách, thiết bị bàn, yêu cầu từ bàn) · catalog · kitchen · payments · online ·
reservations · site · admin · inventory · expenses · hr · accounting · crm · reports.

**Controller mỏng:** zod schema ở đầu file; `@Body() body: unknown` → `Schema.parse(body)`;
PATCH qua `parsePatch(Schema, body)` (`common/patch.ts`) — `.partial()` của zod 4 vẫn điền
`.default()` cho trường vắng mặt và ghi đè dữ liệu (§11); query qua `z.coerce`;
`ParseIntPipe` cho id; truyền `req.actor!` vào service. Decorator:
`@RequirePermission('<domain.verb>')`, `@Public()`, `@UseInterceptors(IdempotencyInterceptor)`
cho mọi route ghi mà client có thể gửi lại. Không DTO class, không class-validator.

**Service:** `@Inject(DB) db: Db`; mọi ghi trong `db.transaction(async (tx) => …)`; hàm
cần vào cùng transaction nhận `tx` **làm tham số đầu**: `emit(tx, {branchId, topic, rooms,
payload})`, `audit.write(tx, …)`, `approvals.authorize(tx, …)`, `inventory.postSaleForTicket(tx, …)`.
Đồng thời được **ép ở DB**, không read-then-write: partial unique index
(`table_sessions_one_live_per_table`, `table_devices_one_host`), `UPDATE … WHERE remaining >= qty`,
UPSERT…RETURNING. Tham số nghiệp vụ nằm trong bảng `parameters` (`ParamsService`), không
phải env.

**Lỗi:** ném Nest exception với `{ code: 'snake_case', message: 'tiếng Việt', …extra }`
(`reroute_confirm`, `table_reserved`, `requires_approval`, `dish_sold_out`, `bill_has_money`,
`unpaid`, `period_closed`, `no_open_shift`, `prepay_required`, `config_not_published`).
ZodError → 400 `validation_error` + `issues`. Vi phạm constraint → `isUniqueViolation(err,
'<tên constraint>')` → 409 — **tên constraint là một phần của API**. Mẫu **xác nhận hai
lần**: lần 1 trả 409 kèm code, client gửi lại với cờ (`confirmReroute`, `ignoreReservation`).
Lặp lại một chuyển trạng thái là no-op (`changed:false`). Hàm domain thuần trả
`{ok:false, code, message}` thay vì ném.

### 5.3 Xác thực và phân quyền
Token là chuỗi ngẫu nhiên, DB chỉ giữ SHA-256 → thu hồi được tức thì. `AuthGuard` (global)
thử theo thứ tự: (1) **iPad bàn** — header `x-sora-device` của thiết bị kind `table`: bàn
có phiên sống thì thành actor `customer` R0 của đúng phiên đó, bàn chưa mở thì là thiết bị
không vai trò (`isTableDevice`) chỉ gọi được `/api/table-terminal`; luôn thắng cookie nhân
viên vì iPad không bao giờ vào ca; (2) **phiên nhân viên** cookie `sora_staff` hoặc Bearer —
quyền = vai trò người đó tại chi nhánh ∪ vai trò chuỗi ∪ vai trò của **thiết bị đang
đứng**; (3) **thiết bị ghép** khác (`devices.kind` ∈ `pos | cashier | kds | kiosk |
bridge`); (4) 401 trừ `@Public`. Route khách chạm được **phải** gọi
`assertOwnTableSession(actor, sessionId)` (chặn cả iPad bàn chưa mở); việc của nhân viên —
mở bàn bất kỳ, nhả đợt, huỷ dòng, sơ đồ P2, hàng đợi P12, Expo — chặn `customer` và iPad.

Ma trận quyền ở `packages/contracts/src/permissions.ts`: 13 vai trò R0–R13, 58 action
`domain.verb`, mỗi ô `allow | approve | deny`. `PermissionGuard` chỉ chặn `deny`; ô
`approve` (△) thì service phải `ApprovalService.authorize(tx, …)` với body
`approval: {approverStaffId, approverPin, reason}` — người duyệt phải khác người làm
(DB check `approvals_separation_of_duties`). Phiên mở bằng link cá nhân có `scope:'self'`.
Đăng nhập: POS/KDS = PIN **trên thiết bị đã ghép**; Office = email + mật khẩu; Kênh nhân
viên = link một lần + PIN; kiosk = thiết bị ghép + PIN. Chi tiết tài khoản dev: `DEV.md`.

### 5.4 Cơ sở dữ liệu
- Tên `snake_case`, bảng số nhiều; **không `pgEnum`** — cột `text` + `CHECK IN (...)`;
  khoá chính `bigint identity` (`{mode:'number'}`), slug text cho `branches` (`'cg'`),
  `dishes`, `categories`, `stations` (`'ST-01'…'ST-06'`), `modifier_*`; `timestamptz`.
- **Tiền = số nguyên VND** `bigint`, không `numeric` (riêng giá vốn kho đơn vị phần nghìn
  đồng `*_milli`). Tổng tiền chỉ tính bằng `computeOrderTotals` **trên server**; giá, tên và
  khuyến mãi món **đóng băng** vào dòng đơn lúc tạo (§9.6).
- `business_date` theo múi giờ chi nhánh (`businessDateOf`); mã hiển thị `ON-yyMM-NNNN`
  / `DB-yyMM-NNNN` (`nextDisplayCode`), khách đọc mã này, không đọc id.
- **Sổ bất biến** (append-only, trigger `sora_append_only` + revoke quyền role `sora_app`
  trong `deploy/db-roles.sql`): `audit_log`, `approvals`, `journal_entries`,
  `parameter_history`, `stock_moves`. Sửa sai = bút toán đảo, không UPDATE.
  **Hoá đơn đã phát hành** cũng bất biến (trigger `invoices_guard`, `9008`): không xoá, chỉ
  được chuyển sang `replaced` kèm lý do; số đã cấp không đổi, không huỷ.
- **Migration:** `db:generate` sinh `migrations/00NN_*.sql`; SQL viết tay đánh số từ
  `9000_` để luôn chạy sau cùng (`9000_guards`, `9001_kitchen_money_guard`,
  `9002_realtime_broadcast`, `9003_realtime_rls`, `9004_stock_moves_guard`, …). Runner
  riêng `src/db/migrate.ts` chạy mọi file một lần theo tên, ghi `_sora_migrations`.
  **Không có down**; file đã chạy thì sửa không có tác dụng → luôn thêm file mới.
  Vercel build **không** chạy migration — chạy tay trước khi deploy API.
- Không dùng Drizzle `.prepare()` (pooler transaction của Supabase).

### 5.5 Mô hình và vòng đời tại bàn
Enum chính (giá trị đúng như CHECK):
`tables.kind` `standard|grill|private`, `has_grill` + `grill_type` `than|gas|dien` ·
`table_sessions.status` `open|paid_wait_clear|closed` (tối đa 1 phiên chưa đóng/bàn) ·
`devices.kind` `pos|cashier|kds|kiosk|bridge|table` (`table` bắt buộc `table_id`, một iPad
sống mỗi bàn — `devices_one_live_table`) · `table_requests.kind`
`phuc-vu|them-than|da-nuoc|tinh-tien|khac` · `orders.status`
`new|confirmed|cooking|ready|delivering|done|cancelled`, `channel` `web|table|pos|grab|shopee|be`,
`type` `dinein|takeaway|delivery`, `payment_state` `unpaid|partial|paid|refunded` ·
`order_batches.state` `held|fired` · `order_lines.state` `draft|queued|cooking|ready|served|voided`
· `tickets.state` `waiting|queued|cooking|ready|closed|voided`, `priority` `normal|rush|late`
· `ticket_items.state` `queued|cooking|done|voided` · `payments.kind` `cash|vietqr|card|cod`,
`state` `pending|paid|failed|expired|refunded|mismatch` · `reservations.status`
`pending|confirmed|seated|done|cancelled|no_show`.

Luồng: `POST /api/tables/:id/open` (409 `table_reserved` nếu có đặt chỗ trong 90′) →
`POST /api/table-sessions/:id/lines` (đơn tạo lười `new`, dòng `draft`, set nổ thành món
con, giá và khuyến mãi món đóng băng, trừ cap món hết) → `/send` (đợt 1 `fired`, đợt sau `held` không chạy
giờ; đơn `confirmed`; **một vé cho mỗi trạm**; `ticket.created`) → KDS `POST /api/tickets/:id/state`
hoặc `/api/ticket-items/:id/state` `{action: start|done|undo}` (done **trừ kho cùng
transaction**; undo trong `kitchen.undoSeconds`=30; trạng thái đơn chỉ đi tới) → phục vụ
xác nhận mang ra (`/served`) → trả tiền (tiền mặt cần ca mở; VietQR tạo payment `pending`
với VA riêng — **chỉ webhook `POST /api/webhooks/bank`** (HMAC `x-bank-signature` trên raw
body) mới đổi sang `paid`) → phiên `paid_wait_clear` (**không tự đóng**) → nhân viên
`/close` (409 `unpaid`). Huỷ chỉ từ `new|confirmed`; huỷ dòng đã gửi bếp cần duyệt
`order.line.void-sent`.

Định tuyến bếp: `trạm = f(món, loại bàn)` — món nướng `song` → ST-02 quầy sống, `nuong` →
ST-06 bếp nướng, `linh_hoat` → theo bàn có bếp hay không; set nổ ra món con, giữ nhãn set;
chuyển bàn khác loại → 409 `reroute_confirm`. Sáu trạm + Expo: xem `huong-dan-su-dung/01` §1.4.

**Ghép/tách hiện tại (P9):** `move` · `transfer {lineIds…}` · `merge {targetSessionId}` =
dồn mọi dòng sang bàn đích rồi **đóng bàn nguồn**. Cột `table_sessions.merged_table_ids`
có sẵn nhưng **chưa được đọc/ghi** — bàn đôi ở §9.2 sẽ dùng mô hình khác.

**iPad tại bàn (§9.1):** Office A4 sinh mã kind `table` kèm `tableId` → iPad
`POST /api/auth/pair` → token thiết bị (localStorage). iPad hỏi `GET /api/table-terminal`
(bàn · phiên sống · giờ đặt chỗ trong 90′, **không tên**); khách tự mở bàn bằng
`POST /api/table-terminal/open {guestCount}`: quá sức chứa thì mở đúng sức chứa và trả
`overCapacity` để iPad gọi nhân viên ghép bàn; có đặt chỗ → 409 `table_reserved` chỉ kèm
giờ; bàn vừa được mở ở POS → trả luôn phiên đó. Luồng QR điện thoại (`table-devices/*`,
cookie `sora_table`, kiểm Wi-Fi, chủ bàn duyệt, `qr-token`) **đã gỡ** 22/10/2026 —
migration `0031` xoá bảng `table_devices` và cột `qr_token_hash`.

### 5.6 Realtime và offline — hiện trạng cần biết
- **Phát:** `emit(tx, …)` ghi `outbox_events`; trigger `sora_broadcast_outbox` (migration
  `9002`) gọi `realtime.send` của Supabase; RLS (`9003`) đối chiếu room với JWT do
  `POST /api/realtime/token` ký (TTL 30′). Room: `branch:<b>:orders | :station:<ST> |
  :expo | :tables | :config`, `table-session:<id>`. Topic đang phát: `order.created/updated/
  cancelled`, `ticket.created/ready/void`, `table.opened/paid/request`, `payment.received`,
  `availability.changed`, `config.published`, `reservation.created`. Bắt kịp:
  `GET /api/realtime/events?after=<seq>` — quy tắc client "**refetch rồi mới stream**".
- **Nghe: chưa app nào.** Không có `supabase-js`, không gọi `/api/realtime/*`. Tất cả
  đang **polling** TanStack Query: KDS 5 s · POS 10–30 s · Table 2–20 s (bàn của iPad:
  2 s khi chờ dọn · 10 s đang mở · 15 s bàn trống) · Web 10 s.
  Comment trong `apps/kitchen/src/App.tsx`, `apps/pos/src/App.tsx`, `Floorplan.tsx` nói
  realtime là đường chính — **sai**, đừng tin.
- **Ghi offline:** `enqueue` của `@sora/core` (Dexie `sora-outbox`, FIFO, header
  `idempotency-key`); server `IdempotencyInterceptor` so hash body (khác → 409
  `idempotency_key_reused`). Chỉ đơn và trạng thái; **không** cache kết quả đọc.
  `QueryClient` phải đặt `mutations.networkMode: 'always'`: mặc định `'online'` của
  TanStack **hoãn** lệnh ghi khi trình duyệt báo mất mạng — `mutationFn` không chạy, lệnh
  không vào outbox, reload lúc đó là mất. Đã đặt ở table (22/10/2026); POS và KDS chưa.
- **PWA:** chỉ `pos` và `kitchen` (`vite-plugin-pwa`, `registerType:'prompt'`, fullscreen
  landscape; precache js/css/html/woff2/png/svg; `/api` không cache trừ KDS `NetworkFirst`
  `/api/recipes`). POS cập nhật khi thu ngân bấm; KDS tự cập nhật khi hàng vé rỗng.
  Kiosk **cố ý** không có service worker. Service worker chỉ chạy ở bản build.

### 5.7 Biến môi trường (tên, không giá trị)
API: `DATABASE_URL`, `DATABASE_MIGRATION_URL`, `TEST_DATABASE_URL`, `SUPABASE_JWT_SECRET`,
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `BANK_WEBHOOK_SECRET` (bắt buộc production),
`PAYMENT_PROVIDER` (`mock`), `CORS_ORIGINS`, `PORT`, `NODE_ENV`, `LIVE_SCENARIO`.
Front-end: `VITE_STAFF_ORIGIN` (Office cấp link), `SORA_API_URL` (Next gọi API phía
server). Không commit `.env`, không in secret
ra log hay chat.

---

## 6. Front-end — cách một app được dựng

- Mỗi SPA: `src/main.tsx` → `App.tsx` (router + provider) → `routes/` hoặc `screens/`;
  một `src/api.ts` export object `api` (đọc qua `apiFetch`, ghi có tác dụng phụ qua
  `enqueue`); đường dẫn luôn tương đối `/api/...` (Vite proxy ở dev, Vercel rewrite ở prod
  — cookie `SameSite=Strict` vì vậy mới dùng được). Web dùng server component +
  `revalidate: 60` cho trang tĩnh, `lib/api.ts` cho client.
- Trạng thái máy chủ: TanStack Query (`staleTime` 5 s, `refetchInterval` theo màn). Trạng
  thái cục bộ: React Context + sessionStorage (giỏ `sora.table.cart`, nháp đơn web
  `sora.web.order`). Không thêm store toàn cục.
- Màn hình theo mã thiết kế (T/P/K/O/R/W/M/S/B/H/C/F/A) — ghi mã ở đầu file.
- Thiết bị đích theo app (§1) quyết định bố cục; không có media query theo hướng xoay.
  Khi một thành phần phải chạy ở nhiều khổ (POS iPad/điện thoại — §9.3) ưu tiên
  **container query** hơn `lg:` toàn trang.
- Đo và kiểm trên đúng viewport: web 1440 + 390 · iPad 1080×810 (ngang) / 810×1080 (dọc) ·
  POS cũ 1280×800 · KDS 1920×1080 · điện thoại 390×844.

---

## 7. Kiểm thử

**Hiện có** (vitest; chỉ `@sora/api`, `@sora/contracts`, `@sora/core` có script `test`):
- **Test domain thuần** `src/modules/*/domain/*.test.ts` cạnh file nguồn (19 file) —
  không DB, chạy ở mọi máy. Fixture ở `kitchen/domain/__fixtures__/`.
- **Test PGlite** (`new PGlite()` + `runMigrations`) — 3 file, kiểm schema/trigger.
- **Test tích hợp** `src/test/*.e2e.test.ts` (22 file, ~645 case): `bootTestApp()` trong
  `src/test/harness.ts` **DROP SCHEMA** trên `TEST_DATABASE_URL`, chạy migration, seed
  fixture (chi nhánh `cg`, 6 trạm, bàn A4 có bếp / 05 không bếp, 4 nhân viên có PIN), boot
  cả `AppModule`, gọi bằng `app.inject` với `Authorization: Bearer` + `x-sora-device`.
  Không mock, không factory. `fileParallelism: false`, timeout 30 s.
- **Front-end: 0 test tự động.** Kiểm bằng typecheck + lint + build + mở app đúng viewport.
- Trên máy chưa có Postgres: `pnpm -r test` → domain xanh (519 case), 22 file e2e ném
  "Thiếu TEST_DATABASE_URL" — đó là thiếu môi trường, không phải lỗi code.

**Quy tắc khi làm việc**
- Sửa bug nghiệp vụ → viết test tái hiện trước (domain nếu được, e2e nếu đụng DB/quyền),
  rồi sửa cho xanh. Endpoint mới hoặc đổi quyền → có e2e đi qua `AuthGuard` thật.
- Đổi `packages/contracts` (tiền, quyền, schema) → chạy test của gói + e2e liên quan.
- Đổi UI → chạy `pnpm lint && pnpm -r typecheck && pnpm --filter <app> build`, mở app
  trong trình duyệt ở viewport đích, chụp màn trước/sau khi là thay đổi bố cục.
- Đổi luồng tại quán → đi lại **bài kiểm 5 phút** trong `THIET-BI.md` (ghép máy, PIN,
  gửi bếp, rút mạng gửi lại không nhân đôi, tắt/bật màn bếp).
- **CI** (`.github/workflows/ci.yml`) chỉ chạy trên PR hoặc push vào `main` — nhánh
  `main` **không tồn tại** nên push thường không chạy; CI cũng **không có Postgres** nên
  e2e sẽ ném lỗi. Trước khi dựa vào CI: thêm service `postgres:16` + `TEST_DATABASE_URL`
  và đổi `branches` sang nhánh làm việc.

---

## 8. Hiệu năng — yêu cầu bắt buộc

**Số đo 21/10/2026 trên https://tokyo-sora.vn** (nguyên nhân "ảnh hiển thị chậm"):
- Trang chủ kéo **98 MB ảnh**: PNG gốc 2–8,7 MB (tới 2816px) hiển thị trong ô vài trăm px;
  `load` event ở **46 s**. Hero gắn cả 5 khung → React chèn `<link rel=preload>` cho cả 5.
- Kho ảnh về Việt Nam chỉ 0,5–1,7 MB/s; ảnh Supabase signed URL trả `private, no-cache`
  (trình duyệt không giữ lại) và token hết hạn 08/2027 → tới lúc đó ảnh chết im lặng.
- Trên iPad Gen 7 (A10, 3 GB RAM) PNG cỡ này còn tốn bộ nhớ giải mã — lưới 20 món là treo.

**Đã sửa ở `apps/web` (21/10/2026):** mọi ảnh từ Office đi qua `components/SiteImage.tsx`
→ `next/image` (bộ tối ưu của Vercel, WebP, bộ đệm 31 ngày, kho được phép khai ở
`lib/image-hosts.ts`); hero chỉ dựng khung đang chiếu/kế/trước, chỉ khung đầu `priority`.
Đo bản build: hero 2560px còn 58–244 KB, thumbnail 4–75 KB (giảm ~50–1000×). Hệ quả cần
nhớ: **ghi đè ảnh cùng tên ở kho thì web hiện ảnh cũ tới 31 ngày** — thay ảnh thì tải lên
tên mới; gói Hobby của Vercel có 5.000 lượt đổi cỡ/tháng (quá là ảnh mới lỗi 402). Các app
Vite (table, pos…) **chưa** sửa — vẫn phát ảnh gốc.

**Ngân sách (đo trên Chrome DevTools, throttling 4G, máy chậm 4×):**
- LCP ≤ 2,5 s (web, table) · tương tác chạm phản hồi ≤ 100 ms (optimistic update, không
  chờ mạng để đổi UI) · chuyển màn trong app ≤ 300 ms · Lighthouse mobile Performance ≥ 90
  cho web.
- Ảnh thumbnail (176–400px) ≤ 40 KB · thẻ 4:3 (800px) ≤ 120 KB · hero/chi tiết (1600px)
  ≤ 250 KB · tổng ảnh một màn thực đơn ≤ 1,5 MB · JS mỗi SPA ≤ 250 KB gzip, web ≤ 200 KB.

**Quy tắc ảnh (áp cho mọi app, mọi ảnh mới):**
1. **Không bao giờ phát ảnh gốc.** Mọi ảnh đi qua một đường ống sinh biến thể
   **176 / 400 / 800 / 1600** WebP (+ AVIF nếu rẻ; PNG-alpha chỉ cho ảnh tách nền cần viền
   trong suốt), tên file **băm nội dung**, `Cache-Control: public, max-age=31536000,
   immutable`. Một kho duy nhất, bucket công khai, **không signed URL** cho ảnh công khai.
   DB giữ khoá gốc, app tự ghép `srcset`. Đề xuất: Office tải lên → API/Edge Function →
   `sharp` (đã có trong repo) → Supabase Storage; giữ ô "dán URL" ở Office làm đường phụ.
2. `<img>` luôn có `width`/`height` (hoặc `aspect-ratio`), `srcset` + `sizes`, `decoding="async"`,
   `loading="lazy"` cho mọi ảnh **trừ** ảnh LCP (hero/ảnh đầu) — ảnh LCP dùng
   `fetchpriority="high"` và có thể preload. Web: **luôn dùng `SiteImage`** (bắt buộc
   `sizes` đúng bề rộng ô), không viết `<img>` trần cho ảnh từ Office.
3. Hero/băng chuyền: chỉ mount **khung đang chiếu + khung kế**, video `muted playsInline
   preload="metadata"` với poster nhỏ; không bao giờ tải cả bộ.
4. Đĩa ảnh/LQIP: khung giữ chỗ bằng gradient token (đã có) để không nhảy bố cục; placeholder
   blur chỉ khi đã có pipeline.
5. Trên iPad: tile ≤ 2× kích thước hiển thị; service worker precache ảnh thực đơn của bundle
   đang phát hành để lần cuộn thứ hai không chạm mạng.

**Dữ liệu:** config bundle cache theo version/ETag (đã có), màn hình đọc từ bundle trước
rồi mới cập nhật phần động (món hết, giá riêng); khi thay polling bằng realtime (§9.4) giữ
polling 60 s làm dự phòng. Không gọi API trong vòng lặp render; gộp các query cùng màn.

---

## 9. Định hướng mới (10/2026) — điều chỉnh so với bản thiết kế gốc

Phần này **ghi đè** các chỗ tương ứng của `tokyo-sora-ke-hoach-thiet-ke.md` §20–22 (cả
`LUONG-QR-BAN.md` cũ — đã xoá cùng luồng QR, còn trong lịch sử git). Mục có dấu
**[quyết định mở]** là giả định hợp lý cần chủ dự án chốt trước khi làm — hỏi, đừng tự
chọn im lặng.

### 9.1 iPad tại bàn thay cho QR điện thoại
- **Thiết bị:** mỗi bàn một **iPad (thế hệ 7, 10,2″)** gắn đế, **ngang**, viewport
  **1080×810 CSS px** (2×), 4:3. Chạy `apps/table` dưới dạng web app cài ra màn hình chính
  (manifest `display: standalone`, `apple-mobile-web-app-status-bar-style: black-translucent`
  + đệm `env(safe-area-inset-*)`), khoá bằng **Guided Access** hoặc Single App Mode (MDM).
  Giới hạn phải biết: iPad 7 dừng ở **iPadOS 18** (không lên 26) → nhắm WebKit Safari 18;
  **không ẩn được thanh trạng thái**, **không khoá hướng xoay từ web** (khoá ở Guided
  Access "Motion"); Wake Lock API dùng được (giữ màn sáng, không cần tắt auto-lock); âm
  thanh cần một lần chạm trước; `100dvh`, container query, `overscroll-behavior`, WebP/AVIF
  đều có; **không** dùng `-webkit-overflow-scrolling`; gọi `navigator.storage.persist()`;
  JS gọn vì A10/3 GB. Hướng dẫn lắp đặt: `THIET-BI.md` mục iPad tại bàn.
- **Định danh (làm xong 22/10/2026):** iPad là **thiết bị ghép** `devices.kind = 'table'`
  gắn `table_id`, ghép bằng mã 6 số sinh ở Office A4 có chọn bàn (một bàn một iPad sống).
  iPad đi theo **bàn**, không giữ phiên: `AuthGuard` tra phiên sống của bàn mỗi lần gọi —
  có phiên thì iPad là khách R0 của đúng phiên đó, chưa mở thì chỉ hỏi được bàn mình và tự
  mở bàn (`/api/table-terminal`). Thu hồi ở A4 → iPad về màn ghép. Luồng QR điện thoại
  **đã gỡ hẳn**: `table-devices/*`, cookie `sora_table`, kiểm Wi-Fi, chủ bàn duyệt, bố cục
  điện thoại của `apps/table`, nút "Mã QR bàn" ở POS.
- **Vòng đời màn hình** (server quyết định, iPad chỉ render theo phiên của bàn):
  1. **Bàn chưa mở → màn chờ quảng cáo** (§9.1b); chạm là hộp "Mấy người ăn?", để yên
     60 giây thì về lại màn chờ.
  2. Mở phiên: nhân viên mở ở POS P3 như hiện tại, **và** khách chạm "Bắt đầu gọi món" trên
     iPad → hỏi số khách → tạo phiên, POS thấy bàn chuyển "có khách" ngay. **Khách được
     tự mở bàn** (chốt 22/10/2026); bàn có đặt chỗ trong 90′ thì iPad không mở, chỉ báo
     giờ đặt (không tên) và mời gặp nhân viên (409 `table_reserved`) — iPad bàn chưa mở
     chưa gửi được yêu cầu T9 vì yêu cầu gắn với phiên.
  3. T2 thực đơn → giỏ → gửi bếp → T8 theo dõi → T9 gọi nhân viên (than, đá/nước, phục vụ,
     tính tiền, khác) → T10 tạm tính → VietQR hoặc gọi thu ngân → "Đã thanh toán, chờ dọn".
  4. Nhân viên đóng bàn ở POS → iPad **tự quay về màn chờ** trong ≤ 3 s (cần realtime hoặc
     polling 2 s khi ở trạng thái `paid_wait_clear` — đang dùng polling). Đổi lượt khách thì
     xoá giỏ, lượt trả và từ khoá tìm của khách trước (`table-context.tsx`).
- **Bố cục iPad — đã duyệt 22/10/2026** (bản vẽ canvas "Gọi món tại bàn · iPad"; thay bản
  16px/52px trước đó — chủ dự án thấy chữ to, kém tinh tế). Khung thiết kế **1080×740**:
  màn 1080×810 trừ thanh trạng thái và thanh Safari (707 khi mở hai tab — vẫn vừa).
  - Thanh trên 56px: TOKYO SORA · bàn + khu + số khách · **Gọi nhân viên** · **Đơn của
    bàn** kèm tổng tiền. Ngôn ngữ VI / EN / JA có trong bản vẽ nhưng **chưa làm** (app chưa
    có i18n).
  - Cột nhóm 184px: kanji + tên nhóm + số phần đang chọn; **Tìm món** và **Bộ lọc** ở đáy
    cột, mở ngay trong cột giữa. Nhóm có > 1 chặng (bò/heo/hải sản/rau) có thẻ nhóm con.
  - Giữa: lưới **3 cột** thẻ 4:3 (~176px), tên Việt 2 dòng rồi tên Nhật 1 dòng, giá mono,
    nút **+** 32px vẽ trong vùng chạm 44px ở hàng giá; món phải chọn vị có chấm kem; món
    hết đóng dấu "Đã hết" và xám, không ẩn; chạm thẻ → hộp chi tiết T3 hai cột 820×620.
  - Cột giỏ 304px: "Món đang chọn", tạm tính đợt này, **Gửi bếp** (Button `lg`) ở đáy;
    nhãn +1/+2/+3 bay vào giỏ; gửi xong tóm tắt đợt 2 s rồi trở lại.
  - Chữ: **13** phụ · **14** nội dung · **16** nút chính · **22** tên món ở chi tiết ·
    **30** tiêu đề Cormorant; chữ vàng vẫn ≥ 14. Vùng chạm **44px** (không dùng
    `data-scale`). Bo 4 nút/ô nhập/nhãn · 8 thẻ · 12 hộp thoại. Không hover, không kéo-thả.
  - Món nướng định tuyến theo bàn: bàn có bếp → "Món ra sống — tự nướng tại bàn"; không
    bếp → "Bếp nướng sẵn, chậm hơn khoảng 8 phút".
- **Trạng thái 22/10/2026 — đã dựng trong `apps/table`** (chỉ còn bố cục iPad; màn
  `routes/Ipad*.tsx`): ghép máy `IpadPair` · T1 số khách (1–6 + ô "Khác") dùng cho cả khách
  tự mở bàn lẫn bàn nhân viên đã mở, quá sức chứa thì gọi nhân viên ghép bàn, bàn có đặt
  chỗ thì báo giờ · T2–T7 · T8+T10 chung một màn (nhóm theo **lượt gửi bếp** `sentAt`, không
  theo `batchNo` — món gọi từ bàn luôn ở đợt 1) · T9 · T11–T15 · T16 kèm 2 món thay · T17 ·
  màn mờ 3 phút · "Bí quyết thưởng thức" (đọc `/api/site/menu`, chỉ món có bài kể như trang
  web) · giá khuyến mãi (§9.6) · tự về màn đầu khi đóng bàn · màn chờ quảng cáo (§9.1b) ·
  tự nạp bản mới ở màn chờ. **Chưa:** VI/EN/JA, manifest standalone + Wake Lock, service
  worker, Realtime thay polling, ảnh lưới thực đơn qua bộ tối ưu (§8 — bắt buộc trước khi
  lắp iPad thật: lưới đang phát ảnh gốc; dùng `@sora/ui/image` như màn chờ).
- **Offline:** giỏ và lệnh gửi qua outbox như hiện tại; màn chờ vẫn hiển thị khi mất mạng
  (ảnh đã tải nằm trong bộ đệm trình duyệt — chưa có service worker nên bật máy lúc mất
  mạng thì app không lên); thanh toán bị chặn kèm "Vui lòng gọi thu ngân".
- **Cập nhật phần mềm:** chỉ tự reload khi đang ở **màn chờ** (không bao giờ giữa bữa) —
  đã làm: mỗi lần vào màn chờ và mỗi 10 phút, so script/CSS của trang với `index.html` mới
  nhất trên máy chủ, khác là tải lại; nhớ bản vừa tải lại để không tải vòng tròn.

#### 9.1b Màn chờ quảng cáo (bàn chưa mở) — làm xong 22/10/2026
- Nội dung từ Office **A8** (dùng lại `site_hero_images`: ảnh + video) với cờ **riêng**
  `table_screen` ("Chiếu trên iPad tại bàn"), không theo cờ trang chủ: khách trong quán cần
  thấy thứ khác khách lướt web. Migration `0032` bật sẵn cho khung đang chiếu trên trang
  chủ; khung mới mặc định tắt. iPad đọc `GET /api/site/hero?surface=table` (công khai, ≤ 8
  khung). Chưa bật khung nào → món ký có ảnh như hero web → tấm chữ 空 của quán.
- `apps/table/src/routes/IpadIdle.tsx`: ảnh 7 s/khung, video `autoplay muted playsinline`
  chạy hết độ dài rồi sang khung (một khung thì lặp), chỉ dựng ảnh khung trước/đang
  chiếu/kế; chữ lớn Cormorant + chữ Nhật + kanji chìm theo hero web.
- Góc dưới: số bàn + nút vàng "Chạm để bắt đầu gọi món"; chạm bất kỳ → hộp mở bàn (bước 2),
  để yên 60 s thì về màn chờ. Bàn có đặt chỗ trong 90′: nút đổi thành "Bàn đã có khách đặt
  lúc HH:MM".
- Khi bàn **đang mở** mà không ai chạm ≥ 3 phút: **không** quay về quảng cáo (che mất
  giỏ/đơn) — chỉ giảm sáng (dimmer) và hiện tổng tạm tính; chạm là trở lại.
- Ảnh qua bộ tối ưu của web (`@sora/ui/image`, 1080/1920 WebP — một nền đo 152 KB thay cho
  PNG vài MB); CSP của table có `img-src https://tokyo-sora.vn` và `media-src` cho kho video.
  Video ≤ 3 MB/clip (A8 nhắc, không ép). **Chưa precache** — cần service worker.

### 9.2 Bàn đôi
- Sơ đồ bàn (Office A3) khai **cặp bàn**: `tables.pair_id` (hoặc bảng `table_pairs`),
  mỗi bàn vẫn có mã, chỗ ngồi, iPad riêng. Mặc định hai bàn **độc lập**.
- **Ghép đôi** = một phiên chung cho hai bàn: thêm bảng `session_tables(session_id,
  table_id)` (hoặc dùng `merged_table_ids` đang bỏ trống — **[quyết định mở]**), cả hai
  iPad gắn vào **cùng phiên**: một giỏ, một đơn, một bill, thao tác trên iPad nào cũng
  thấy ở iPad kia (cần realtime hoặc polling ngắn). Ghép ở POS P9 hoặc trên iPad với PIN
  nhân viên; ghép được khi cả hai bàn trống **hoặc** một bàn trống + một bàn đang mở chưa
  có tiền (409 `bill_has_money` như `transfer`).
- iPad đi theo phiên sống của **bàn** (`IdentityService.liveSessionOfTable`,
  `TableTerminalService`): ghép đôi phải cho hai chỗ này đọc cả bảng ghép, không thì iPad
  của bàn phụ thấy bàn mình chưa mở.
- Vé bếp ghi nhãn bàn **`A4+A5`**; định tuyến `linh_hoat` theo bàn **chính** (bàn ghép
  khác loại bếp → 409 `reroute_confirm`). Trên P2 hai ô bàn nối liền một viền.
- **Tách** khi đóng phiên, hoặc tách theo món/% như P9 hiện có. Không dùng mẫu "dồn món
  rồi đóng bàn nguồn" cho bàn đôi: khách ở cả hai bàn phải cùng thấy một đơn.

### 9.3 POS gọi món cho nhân viên: iPad và điện thoại
- Đây là **`apps/pos`** (P4 gọi món, P2 sơ đồ, P7 chi tiết). `apps/staff` là kênh HR,
  không liên quan.
- Ba khổ, một mã nguồn, giữ `data-scale="pos"` 52px:
  - **≥ 1024 ngang** (iPad ngang 1080, máy thu ngân): ba cột như hiện tại
    `[180px_1fr_360px]`; dải thu ngân P16 chỉ hiện từ 1366.
  - **600–1023** (iPad dọc 810): hai cột — nhóm món thành thanh ngang cuộn trên lưới, phiếu
    order là **bottom sheet** kéo lên, nút Gửi bếp dính đáy.
  - **< 600** (điện thoại 390): một cột, lưới 2 ô/hàng, thanh nhóm ngang, giỏ là sheet,
    phím chính ở nửa dưới, thao tác một tay. Modal giữa màn → thay bằng bottom sheet
    `Sheet` dựng trong `@sora/ui` (bản của table đã gỡ cùng bố cục điện thoại — lấy lại
    từ git: `apps/table/src/components/Sheet.tsx`).
- Thành phần dùng ở nhiều khổ → container query; không nhân đôi màn.
- Điện thoại nhân viên vẫn là **thiết bị ghép** (mã 6 số, kind `pos`), đăng nhập PIN như
  tablet; cookie `sora_staff` và `x-sora-device` không đổi.

### 9.4 Dựng lại màn bếp (`apps/kitchen`)
Lỗi và điểm yếu đã xác nhận trong code/lịch sử (24 commit sửa trong 2 tuần):
- Đồng bộ bằng polling 5 s → vé tới chậm, đồng hồ lệch; comment nói realtime là sai.
- Lệnh ghi lỗi (4xx) không có chỗ xử lý: `OutboxBanner` bị gỡ khỏi KDS, `retryFailed/
  discardFailed` không ai gọi; outbox còn kẹt dòng `inflight` sau reload và `enqueue` trả
  `null` khi đang drain (bấm nhanh liên tiếp trên KDS rơi vào đúng ca này).
- Món bị **huỷ biến mất im lặng** (server lọc `voided`), không có dấu rush/late.
- Trên màn thấp/zoom < 1 hàng vé xuống 30px, nút 40px — dưới sàn 44px, trái §4.4.
- Nút "Ngắt ghép" một chạm trên màn cảm ứng, không xác nhận, không thu hồi phía server.
- K4 "Chờ ra" bị giấu (code chết), Expo chỉ đọc; không có chuông (đúng thiết kế — sàn 75 dB)
  nhưng cũng không có tín hiệu thị giác thay thế khi có vé mới.
- PWA cập nhật hiếm khi chạy vì KDS không bao giờ điều hướng.

Mục tiêu bản dựng lại (giữ nguyên API; đổi client):
1. **Realtime trước:** đăng ký `branch:<b>:station:<ST>` + `:config` qua
   `/api/realtime/token` (supabase-js, kênh private), "refetch rồi stream", polling 60 s
   dự phòng, báo rõ khi mất kết nối. Đây cũng là bước đầu cho POS/Table.
2. Lưới vé **không cuộn** theo thiết kế gốc (số cột theo `station.columns`; quá ô → "còn
   N vé" + vé quá giờ nhảy đầu) hoặc cuộn **có chủ ý** với vé quá giờ luôn ghim — chọn một,
   ghi lý do. Vé mới vào: viền sáng `sora-rise` một lần, góc màn đếm "N vé mới".
3. Thao tác **theo món** là chính (đã có), nút cả vé ghi rõ phạm vi; hoàn tác 30 s; sàn
   chạm 64px ở TV, không bao giờ dưới 44px dù zoom.
4. Hiện **huỷ** (gạch + nhãn "Đã huỷ" 10 s rồi mờ), **rush/late**, nhãn `MANG VỀ` / `GIAO
   19:30` với đồng hồ đếm ngược đến lúc phải nấu cho đơn online, dòng "Bàn 12 không có bếp".
5. Expo: gom theo bàn/đơn, đủ/thiếu trạm, cảnh báo vé đa trạm chờ nhau; K4 khôi phục nếu
   đợt `held` được dùng thật.
6. Lỗi ghi phải có mặt trên màn (đếm + ô xử lý: gửi lại / bỏ) — sửa luôn hai lỗi outbox ở
   `packages/core/src/outbox.ts` (reset `inflight` khi khởi động; `enqueue` xếp hàng thay
   vì trả `null`).
7. Ngắt ghép cần xác nhận + gọi API thu hồi; cập nhật PWA gọi `registration.update()`
   định kỳ và chỉ áp khi hàng vé rỗng.
8. Nghiệm thu bằng bài kiểm 5 phút + kịch bản: 30 vé/giờ cao điểm trên TV 43″ cách 2 m đọc
   được tên món 24px; rút mạng 2 phút, cắm lại, không nhân đôi, không mất bấm.

### 9.5 Thứ tự làm đề xuất
1. Đường ống ảnh + sửa hero/thumbnail web (§8) — thấy ngay, không đụng nghiệp vụ.
2. Realtime client dùng chung (`@sora/core`), áp cho KDS trước.
3. Dựng lại KDS (§9.4).
4. Thiết bị kind `table` + vòng đời phiên theo bàn + khách tự mở bàn + gỡ QR + màn chờ
   quảng cáo: **xong** (22/10/2026, §9.1 · §9.1b).
5. Bàn đôi (§9.2).
6. POS ba khổ (§9.3).
Mỗi bước một nhánh, một PR, có test theo §7 và số đo theo §8.
Chen ngay sau giao diện iPad, theo yêu cầu 22/10/2026: **khuyến mãi áp dụng chung** (§9.6) —
xong cùng ngày: API, B11, iPad, web và ô voucher ở POS.

### 9.6 Khuyến mãi áp dụng chung (chốt và làm 22/10/2026)
Một bộ chấm cho mọi kênh: `packages/contracts/src/promotions.ts` (test `promotions.test.ts`),
API và app gọi cùng hàm nên giá khách thấy = giá in trên bill. Máy chủ ghi tiền giảm thẳng
vào đơn; app chỉ hiển thị.
- **Chương trình món** `scope='item'`: `percent` · `amount` (mỗi phần) · `set_price` (đồng
  giá — chỉ thay giá món, tuỳ chọn vẫn cộng, không bao giờ làm đắt lên) · `buy_x_get_y` (mua
  N tặng M, phần tặng giảm `get_percent`%, tặng phần rẻ nhất). Đích `target_dish_ids` (món
  hoặc set) và/hoặc `target_category_ids`. Chấm **lúc gọi món** (`appendLines`, theo giờ gọi)
  và **đóng băng vào dòng**: `order_lines.promotion_id` · `discount_vnd` · `promo_qty`,
  `price_total = qty × unit_price − discount_vnd` (CHECK). Set: giảm nằm ở dòng cha.
- **Chương trình hoá đơn** `scope='bill'`: `percent` · `amount` · `free_dish` (tặng một phần
  rẻ nhất của `target_dish_id`, có thể đòi món gọi kèm). Chấm lại **mỗi lần
  `recomputeTotals`**, theo giờ MỞ đơn → `orders.bill_promotion_id` + `money_bill_discount`.
  Chương trình dừng sau lúc mở đơn vẫn giữ cho đơn đó (`heldFor` + `state_changed_at`).
- **Không cộng dồn:** mỗi dòng ≤ 1 chương trình món (lợi nhất, hoà → id nhỏ); giảm theo
  phần đi trước mua N tặng M; hoá đơn ≤ 1 chương trình hoá đơn, chỉ trên các **phần** chưa
  giảm món (mua 2 tặng 1 gọi một dòng: hai phần phải trả vẫn được giảm hoá đơn).
- **Tiền:** `unit_price` giữ giá niêm yết; `money_sub` = tiền món giá niêm yết;
  `money_discount` = giảm món + giảm hoá đơn → `computeOrderTotals`. Màn khách hiện "tiền
  món" = `money_sub − giảm món` (khớp tổng các dòng) rồi dòng giảm hoá đơn (`moneyOf` ở
  `apps/table/src/promotions.tsx`); phiếu hoá đơn in giá gốc + dòng giảm dưới từng món.
- **Trần luật** (NĐ 81/2018 sửa bởi NĐ 128/2024): giảm ≤ 50% giá ngay trước khuyến mãi, quà
  ≤ 50% giá trị hàng mua; **khuyến mại tập trung** (`concentrated`) được tới 100%. Tham số
  `promo.maxDiscountRate` = 0,5. B11 chặn lúc soạn (% > 50, `get × pct > 50 × buy`); bộ chấm
  cắt ở trần khi tính (giảm tiền, đồng giá, tặng món). `legal_notice` = số thông báo Sở CT.
- **Voucher:** chỉ chương trình hoá đơn đòi mã. `POST /api/crm/promotions/apply-voucher`
  (`order.create`, khách chỉ đơn bàn mình): gắn `orders.voucher_code_id`, trừ lượt ngay trên
  dòng mã đã khoá, gắn lại cùng mã là no-op, đổi mã thì trả lượt; rồi tính lại tiền.
  `POST …/remove-voucher` gỡ mã và trả lượt. Gắn/bỏ chỉ được khi đơn **chưa có lượt trả**
  nào, kể cả lượt VietQR đang chờ (409 `payment_started`) — mã QR đã in số tiền cũ.
  `GET /api/crm/promotions/quote?order=&voucher=` chỉ đọc, trả cả `attachedVoucher`. POS
  P10: khối "Khuyến mãi & voucher" — **Kiểm mã** (chấm thử, chưa trừ lượt) · **Áp mã** ·
  **Bỏ mã**.
- **App đọc** `GET /api/crm/promotions/live?branch=` (công khai) → `{clock, maxDiscountRate,
  rules}`, không có chương trình cần mã; `clock` = giờ chi nhánh do máy chủ tính, app hỏi
  lại mỗi phút. iPad: `PromotionsProvider` ở `IpadShell`, `PromoTag` (cam than + ngọn lửa),
  giỏ ước bằng `priceNewLines`, gợi ý "gọi thêm X để được ưu đãi hoá đơn". Web: provider
  ở `app/dat-mon/[branch]/layout.tsx`, lấy sẵn khi dựng trang trên máy chủ (không nhảy giá)
  rồi hỏi lại mỗi phút; `/api/online/menu` trả kèm `pricing {vatRate, roundingUnit}` để
  web chạy chính `computeOrderTotals` — số trên nút "Đặt đơn và trả" = số mã QR đòi, kể cả
  làm tròn khi giá giảm lẻ đồng.
- **Báo cáo:** `promotion_redemptions` một dòng cho mỗi (đơn, chương trình) = số đang giảm,
  ghi lại mỗi lần tính tiền (unique `promotion_redemptions_order_promo`) — B8 đọc bảng này.
  Ma trận món (`dishStats`) dùng `price_total` = sau giảm món.
- **B11** (Office `/khuyen-mai`): 5 bước theo prototype (Loại · Món áp dụng · Điều kiện ·
  Mã, nhãn & pháp lý · Lịch chạy), 7 mẫu nhà hàng hay chạy, xem trước bằng chính bộ chấm.
  Soạn ≠ bật (R9 soạn, R11/R10 bật); đang chạy phải tạm dừng mới sửa.
- **Chưa làm / biết trước:**
  - Trang thương hiệu (W1/W2 `/thuc-don`) chưa in giá giảm — chưa biết chi nhánh, mà
    chương trình theo chi nhánh và giờ. Khách ở iPad/web chưa có ô tự nhập voucher.
  - Hoá đơn điện tử (`invoices`) chưa có cột chiết khấu — NĐ 123/2020 bắt hiện chiết khấu
    thương mại; làm khi nối nhà cung cấp HĐĐT.
  - Chia bill theo món (`split/claim`) cộng `price_total`: đã trừ giảm món, chưa chia giảm
    hoá đơn (như phí phục vụ/VAT trước giờ).
  - Mua N tặng M: huỷ dòng "đã mua" sau khi phần tặng đã ghi thì phần tặng vẫn giữ.
  - Chương trình hoá đơn bật giữa bữa chỉ áp khi đơn đổi lần tiếp theo.
  - Đơn tối thiểu vùng giao (`below_min_order`) so trên tiền món giá niêm yết.
  - Migration `0030_khuyen_mai_ap_dung_chung` phải `db:migrate` trước khi deploy API.

---

## 10. Deploy

- **Đường chính:** Vercel 8 project (mỗi `apps/*` một Root Directory, `vercel.json` riêng)
  + Supabase (Postgres pooler `6543` lúc chạy, direct `5432` cho migration; **cùng vùng
  Singapore** với `regions: ["sin1"]` của API). SPA rewrite `/api/:path*` →
  `https://api.tokyo-sora.vn/api/:path*` để cùng origin. `ignoreCommand` của mọi app gọi
  `scripts/vercel-ignore.sh <app>` (so với lần deploy thành công trước, đường dẫn neo `:/`)
  — **đừng viết lại inline**, đã dính lỗi im lặng bỏ build hai lần.
- Thêm app/trang mới: copy `vercel.json` của app gần nhất, chỉnh `buildCommand` (luôn
  build `@sora/contracts` trước), header bảo mật và **CSP `img-src`** phải chứa kho ảnh
  (table/office có `*.supabase.co storage.googleapis.com`; table thêm `https://tokyo-sora.vn`
  — bộ tối ưu ảnh — và `media-src` cho video màn chờ; pos/kitchen chặn mọi ảnh ngoài; web
  chưa có CSP). Biến môi trường từng project: `DEPLOY.md` §Bước 2.
- Trước khi deploy API: `db:migrate` bằng direct URL; lần đầu mỗi môi trường chạy
  `deploy/db-roles.sql` để API dùng `sora_app` (mất lớp bảo vệ sổ nếu dùng `postgres`).
- Sau deploy: `curl https://api.tokyo-sora.vn/health` → `{"ok":true,"service":"sora-api"}`;
  `curl -i https://pos.tokyo-sora.vn/api/health` qua proxy; kiểm Realtime bằng chèn một
  dòng `outbox_events` (xem `DEPLOY.md` §Bước 3).
- Serverless có hệ quả: không cron/poller (ngân hàng dùng webhook; vé hẹn giờ do KDS
  polling nhả), cache tham số và PIN-throttle **theo từng instance**, pool 1. Cache tham số
  tự nạp lại sau 60 s: đổi ở A6 thì mọi instance theo kịp trong vòng một phút.
- `deploy/docker-compose.yml` + `Caddyfile`: giữ để chạy tại chỗ, không xoá, không bảo trì
  ngang hàng (tên miền trong đó còn là `tokyosora.vn`, có `/socket.io` không còn dùng).

---

## 11. Lỗi đã biết và nợ kỹ thuật (xác nhận 21/10/2026 — sửa khi chạm vào, đừng tìm lại)

Ưu tiên cao:
1. **Nền mờ trong suốt:** `bg-black/70` (`packages/ui/src/Modal.tsx:27`), `bg-black/60`
   (`apps/pos/src/routes/OrderDrawer.tsx:91`), `bg-black/50` (`apps/office/src/routes/Sets.tsx:275`),
   `bg-surface-0` (POS `DispatchRail.tsx`, `Reconcile.tsx`, `ShiftClose.tsx`),
   `border-accent-line`, `border-warn-line` — class không tồn tại → dùng `bg-canvas/70`,
   `bg-surface-1`, `border-accent/16`, `border-warn`.
2. Outbox: lỗi ghi không xử lý được ở POS/KDS/Table; dòng `inflight` kẹt sau reload;
   `enqueue` trả `null` khi đang drain (`packages/core/src/outbox.ts:102,108-111,151-164`).
3. POS mở bàn từ đặt chỗ thiếu `?code=` (`ReservationDrawer.tsx:109`) → header trống.
4. Web ngoài lint: 5 chỗ `dangerouslySetInnerHTML` JSON-LD **không escape `<`** từ chữ
   nhập ở Office; ~16 `rgba()` thô; không CSP/security header; không `viewport-fit=cover`
   nên `env(safe-area-inset-*)` vô hiệu; `SITE_URL` mặc định sai tên miền.
5. Kiosk ghép máy: một `catch` chung (`apps/kiosk/src/screens/Pair.tsx:21-38`) — ghép
   thành công nhưng `me()` lỗi vẫn báo "Mã không đúng" (KDS đã sửa ở `04ffd9b`).
6. CI không chạy trên nhánh làm việc và không có Postgres (§7).
7. **PATCH ghi đè dữ liệu:** zod 4 `.partial()` vẫn điền `.default()` cho trường vắng mặt.
   Đã xác nhận: lưu lịch bán của set (Office `Sets.tsx`) xoá ảnh và giá online của món; sửa
   thông tin một tài khoản đã khoá (`AccountPatch`, `active` mặc định true) mở khoá lại nó.
   A8 đã sửa bằng `common/patch.ts`; còn M1 món/set, M10, A3, A5, A1, nguyên liệu kho.

Thấp hơn:
- `var(--sora-accent)` không tồn tại (`apps/office/src/routes/Cms.tsx:1035`).
- Tương phản: `text-danger` trên `surface-1` 3,3:1; `ink-mute` nền sáng 3,5:1 — dùng
  `danger-line`/`ink-body` cho chữ nhỏ.
- `font-mono` + `font-semibold` 9 chỗ (bold giả); kanji ngoài subset (待 断 謝 名物 品書 絶品 宴).
- Ba cách format tiền (`formatVnd`, `<Money>` Intl, `toLocaleString`+'₫' ở POS) → chuẩn
  về `formatVnd` + `font-mono tabular-nums`.
- POS `soldOut` bỏ qua `limited` còn 0 (`TableOrder.tsx:292`), table thì xử lý.
- Giá online lệch giá tính tiền: `/api/online/menu` in `onlinePrice` (ưu tiên giá online chi
  nhánh → giá chi nhánh → giá online chuỗi → giá tại quán) nhưng đơn web tính theo
  `catalog.dishesByIds` (`o?.price ?? basePrice`, bỏ qua `onlinePrice`). Chỉ lộ khi Office
  khai giá online khác giá tại quán.
- Dead code: `screens/Holding.tsx` (K4); `pnpm-workspace.yaml` liệt kê `e2e` không tồn tại.
- Thiếu favicon ở table/staff/office/web; POS/kitchen có `favicon.svg` chưa link.
- Nhiều endpoint đọc tin `?branch=` mà không so với `actor.branchId`.
- iPad bàn (như mọi thiết bị ghép) vẫn đọc được `GET /api/auth/staff` (tên nhân viên) và
  `/api/shifts/open` — route không gắn quyền. iPad chạy Guided Access nên khách không gọi
  tay được; chặn khi rà quyền thiết bị.
- Tài liệu lệch: `THIET-BI.md` "lưới không cuộn" và `packages/print-bridge`, `README.md`
  "5 ứng dụng" + token cũ (`danger #C34141`, bo góc 0/4/8/999), `huong-dan-su-dung/03`
  banner outbox, comment `vite.config.ts` POS/KDS về IndexedDB giữ cache (không có).

---

## 12. Cách làm việc và checklist

**Trước khi code**
- Nêu giả định; nhiều cách hiểu thì trình bày, không tự chọn im lặng; có cách đơn giản
  hơn thì nói. Đụng **[quyết định mở]** ở §9 → hỏi trước.
- Đọc màn tương ứng trong `tokyo-sora-ke-hoach-thiet-ke.md` và prototype `designs/`
  trước khi dựng UI; đọc service + e2e liên quan trước khi đổi API.
- Biến việc thành mục tiêu kiểm chứng được: "sửa bug" → test tái hiện rồi xanh; "thêm
  validation" → test đầu vào sai; "refactor" → test xanh trước và sau; "đổi UI" → ảnh chụp
  đúng viewport.

**Khi code**
- Ít code nhất giải quyết đúng việc; không tính năng ngoài yêu cầu, không abstraction cho
  code dùng một lần, không xử lý lỗi cho tình huống không xảy ra.
- Chỉ chạm cái phải chạm: không "cải thiện" code/format/comment lân cận, không refactor
  thứ không hỏng; thấy dead code thì nêu, không xoá. Dọn import/biến mà **chính mình** làm
  thành thừa.
- Theo đúng phong cách file đang sửa (tiếng Việt, comment vì-sao, class join, token).

**Trước khi kết thúc một việc**
1. `pnpm lint && pnpm -r typecheck` xanh; `pnpm --filter @sora/api test` (hoặc gói liên
   quan) xanh — nói rõ nếu e2e không chạy vì thiếu DB.
2. `pnpm --filter <app> build` cho app đã sửa (và `@sora/contracts` nếu đổi).
3. Mở app ở viewport đích, đi lại luồng chính; đụng ảnh/hiệu năng thì đo theo §8.
4. Đổi hành vi, lệnh, quy ước, định hướng → cập nhật `CLAUDE.md`/`DEV.md`/`DEPLOY.md`/
   `huong-dan-su-dung` trong cùng commit.
5. Commit theo §3; không commit `.env`, `dist/`, ảnh gốc, `scripts/extract-seed/out/`.
6. Báo cáo trung thực: cái gì đã kiểm, cái gì chưa, test nào đỏ và vì sao.
