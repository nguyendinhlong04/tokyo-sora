# Triển khai lên Vercel + Supabase

## Kiến trúc sau khi chuyển

```
        ┌──────────────── Supabase ────────────────┐
        │  PostgreSQL  ·  Realtime  ·  (Storage)   │
        └───────▲──────────────────▲───────────────┘
   SQL (pooler) │                  │ WebSocket (client nối thẳng)
        ┌───────┴───────┐          │
        │  Vercel Func  │          │
        │  NestJS API   │          │
        └───────▲───────┘          │
                │ /api (rewrite same-origin)
   ┌────────────┴─────────────┬────┴──────────┬──────────────┐
   │ tokyosora.vn (Next.js)   │ pos.  │ kds.  │ admin. │ /t  │
   └──────────────────────────┴───────┴───────┴────────┴─────┘
```

**Điểm khác so với bản VPS + Docker:** không còn Socket.IO và không còn tiến trình
outbox dispatcher. Vercel là serverless nên không chạy được tiến trình nền, và kết
nối WebSocket không đảm bảo vào cùng một function instance.

Thay vào đó: mỗi dòng ghi vào `outbox_events` được **trigger phát qua Supabase
Realtime** (migration `9002`). Đảm bảo cốt lõi vẫn nguyên — sự kiện ghi *cùng
transaction* với thay đổi nghiệp vụ, rollback thì không có gì bay đi, commit thì
chắc chắn có người phát. Đây thực ra còn chắc hơn dispatcher vì không có khoảng
thời gian "đã commit nhưng chưa phát".

Phân quyền kênh chuyển từ "server gán room lúc handshake" sang **RLS**: API ký JWT
ngắn hạn (30 phút) mang phạm vi của người dùng, chính sách trong migration `9003`
đối chiếu tên kênh với claim. Màn KDS ghim trạm ST-06 không nghe được vé ST-02;
khách không nghe được luồng vận hành.

---

## Bước 1 — Supabase

1. Tạo project, chọn region gần Việt Nam nhất (Singapore).
2. Lấy ở **Project Settings → Database**:
   - Connection string **Transaction pooler** (cổng `6543`) → `DATABASE_URL`
   - Connection string **Session/Direct** (cổng `5432`) → `DATABASE_MIGRATION_URL`
3. Lấy ở **Project Settings → API**:
   - Project URL → `SUPABASE_URL`
   - `anon` key → `SUPABASE_ANON_KEY`
   - **JWT Secret** → `SUPABASE_JWT_SECRET`

Chạy migration và nạp dữ liệu nền:

```bash
DATABASE_MIGRATION_URL="<direct-url>" pnpm --filter @sora/api db:migrate
DATABASE_URL="<direct-url>" pnpm --filter @sora/api db:seed
```

Migration in ra `NOTICE` cho hai guard có thể bị Supabase chặn:

- `sora_kitchen_money_guard` — cần superuser. Bị bỏ qua là **bình thường**; hai lớp
  bảo vệ còn lại (trigger append-only và quyền role) vẫn chạy.
- `RLS Realtime` — nếu báo bỏ qua thì kênh Realtime **chưa được phân quyền**, phải
  xử lý trước khi chạy thật (liên hệ Supabase support hoặc bật thủ công trong SQL
  Editor bằng tài khoản có quyền).

Phân quyền role (chạy một lần, bằng SQL Editor của Supabase hoặc psql direct):

```bash
psql "<direct-url>" -v app_password="<mật khẩu role app>" -f deploy/db-roles.sql
```

> Trên Supabase bạn có thể bỏ qua bước này và để API dùng thẳng role `postgres`.
> Nhưng như vậy **mất lớp bảo vệ thứ hai của sổ bất biến** — role `postgres` sửa
> được `audit_log`, `journal_entries`. Khuyến nghị tạo `sora_app` và dùng nó cho
> `DATABASE_URL`.

> **Vùng của Supabase phải trùng vùng chạy hàm trên Vercel.** `apps/api/vercel.json`
> đang ghim `"regions": ["sin1"]` (Singapore). Chọn Supabase ở vùng khác mà quên
> sửa dòng đó là mỗi câu truy vấn phải đi vòng nửa vòng trái đất.
>
> Đo trên bản chạy thật khi CHƯA ghim vùng (hàm ở Washington, CSDL ở châu Á):
> đường không chạm CSDL mất 0,4s, đường có chạm CSDL mất 1,0s — riêng khoảng cách
> ăn 600ms mỗi lượt gọi. Màn thực đơn gọi bốn lượt liên tiếp nên khách chờ hơn ba
> giây, và **không có lỗi nào báo ra**.

## Bước 2 — Vercel

Tám project, mỗi project một thư mục gốc. Tách origin là có chủ ý: giao diện quản
trị nằm khác tên miền với ứng dụng khách nên lỗ hổng bên này không với sang bên kia.
Cùng lý do đó, **Kênh nhân viên tách khỏi kiosk chấm công**: một bên là trang mở
trên điện thoại riêng bằng link chuyển tiếp được, một bên là máy gắn cứng trong quán
— hai vùng tin cậy khác nhau thì không dùng chung một gốc.

| Project | Root Directory | Tên miền |
|---|---|---|
| `sora-api` | `apps/api` | `sora-api.vercel.app` (hoặc `api.tokyosora.vn`) |
| `sora-web` | `apps/web` | `tokyosora.vn` |
| `sora-pos` | `apps/pos` | `pos.tokyosora.vn` |
| `sora-kitchen` | `apps/kitchen` | `kds.tokyosora.vn` |
| `sora-office` | `apps/office` | `admin.tokyosora.vn` |
| `sora-table` | `apps/table` | `ban.tokyosora.vn` |
| `sora-staff` | `apps/staff` | `nv.tokyosora.vn` — Kênh nhân viên (H8 · H9) |
| `sora-kiosk` | `apps/kiosk` | `chamcong.tokyosora.vn` — kiosk chấm công (H10) |

**Một giá trị bắt buộc phải sửa:** trong `vercel.json` của mọi SPA có dòng

```json
{ "source": "/api/:path*", "destination": "https://sora-api.vercel.app/api/:path*" }
```

Đổi `sora-api.vercel.app` thành tên miền thật của project API. Vercel **không thay
biến môi trường trong `vercel.json`** nên phải ghi thẳng URL.

Cách làm này (proxy thay vì gọi chéo) giữ được cookie `SameSite=Strict`: trình duyệt
thấy `/api` cùng origin với trang. Nếu gọi chéo thì buộc phải hạ xuống
`SameSite=None`, yếu hơn hẳn.

**Biến môi trường** — project `sora-api` cần: `DATABASE_URL`, `DATABASE_MIGRATION_URL`,
`SUPABASE_JWT_SECRET`, `BANK_WEBHOOK_SECRET`. Các SPA nghe Realtime (`sora-pos`,
`sora-kitchen`, `sora-office`, `sora-table`) cần: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_ANON_KEY`. `sora-staff` và `sora-kiosk` không nghe Realtime nên không
cần hai biến đó — CSP của chúng cũng đã chặn `*.supabase.co`.

Riêng `sora-pos` cần thêm `VITE_TABLE_ORIGIN=https://ban.tokyosora.vn` — mã QR dán bàn
in từ POS phải trỏ sang tên miền của Sora Table. Bỏ trống thì mã trỏ về chính POS và
khách quét xong không mở được gì.

`sora-office` cần `VITE_STAFF_ORIGIN=https://nv.tokyosora.vn` — link cá nhân cấp ở H1
phải trỏ sang Kênh nhân viên. Bỏ trống thì link trỏ về chính Office và nhân viên bấm
vào sẽ rơi vào màn đăng nhập quản trị.

## Bước 3 — Kiểm chứng sau khi deploy

```bash
curl https://<api-domain>/health              # {"ok":true,...}
curl -i https://pos.tokyosora.vn/api/health   # phải trả về qua proxy, cùng origin
```

Kiểm tra Realtime: mở SQL Editor của Supabase, chèn một dòng vào `outbox_events` với
`rooms = ARRAY['branch:cg:orders']`, đồng thời mở một client đăng ký kênh đó — sự
kiện phải tới trong vòng một giây.

---

## Việc còn treo ở kiến trúc này

1. **Poller ngân hàng 20 giây (GĐ3)** không chạy được trên Vercel Cron (nhanh nhất
   1 phút). Khi tới GĐ3 phải dùng `pg_cron` + Edge Function của Supabase, hoặc chấp
   nhận webhook là đường chính và poller 1 phút là dự phòng.
2. **Cầu in ESC/POS** vẫn phải chạy tại quán — không liên quan tới hosting, nhưng
   nó nghe kênh `branch:<id>:print` nên cần token Realtime giống các thiết bị khác.
3. **Cold start ~1–2 giây** cho request đầu sau khi function nguội. Với POS/KDS mở
   suốt ca thì hiếm khi gặp; đáng chú ý hơn ở đơn online lẻ tẻ ban đêm.
4. `deploy/docker-compose.yml` và `Caddyfile` giữ lại để chạy tại chỗ hoặc phòng khi
   đổi ý — không xoá, nhưng không còn là đường triển khai chính.
