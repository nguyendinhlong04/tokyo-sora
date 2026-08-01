# Chạy dự án trên máy dev

## Yêu cầu
- Node 20+ · pnpm 10+
- PostgreSQL 16 (đã cài sẵn bản portable tại `C:\Users\User\.tokyo-sora-dev`, không cần quyền admin)

## Khởi động PostgreSQL

```bash
"$HOME/.tokyo-sora-dev/pgsql/bin/pg_ctl" -D "$HOME/.tokyo-sora-dev/pgdata" -l "$HOME/.tokyo-sora-dev/pg.log" start
```

Dừng:

```bash
"$HOME/.tokyo-sora-dev/pgsql/bin/pg_ctl" -D "$HOME/.tokyo-sora-dev/pgdata" stop
```

Mật khẩu nằm ở `~/.tokyo-sora-dev/superpw.txt` (superuser `postgres`) và
`~/.tokyo-sora-dev/app.env` (role `sora_app` mà API dùng lúc chạy).

## Chuẩn bị CSDL

```bash
pnpm install
pnpm --filter @sora/api db:migrate
pnpm --filter @sora/api db:seed
```

`apps/api/.env` (đã gitignore) cần ba biến — xem `apps/api/.env.example`:
- `DATABASE_URL` — role `sora_app`, quyền hẹp, KHÔNG sửa/xoá được các bảng sổ
- `DATABASE_MIGRATION_URL` — superuser, vì `CREATE EVENT TRIGGER` cần quyền cao
- `TEST_DATABASE_URL` — database `sora_test` riêng cho test tích hợp

Phân quyền role chạy một lần cho mỗi môi trường:

```bash
psql "$DATABASE_MIGRATION_URL" -v app_password="$SORA_APP_PASSWORD" -f deploy/db-roles.sql
```

## Chạy

```bash
pnpm dev:api      # API   :3000
pnpm dev:pos      # POS   :5174
pnpm dev:kitchen  # KDS   :5175
pnpm dev:table    # Table :5173
pnpm dev:office   # Office:5176
pnpm dev:web      # Web   :3001
pnpm dev:lab      # UI-lab:5177 — trang đối chiếu design token
```

## Kiểm tra PWA (service worker chỉ chạy ở bản build, không chạy ở dev)

```bash
pnpm --filter @sora/pos build && pnpm --filter @sora/pos preview       # :4174
pnpm --filter @sora/kitchen build && pnpm --filter @sora/kitchen preview  # :4175
```

Trên Windows phải **tắt server preview trước khi build lại**, nếu không Vite không
xoá được thư mục `dist` đang bị khoá file (`EPERM`).

Service worker chỉ nắm quyền từ lần điều hướng SAU khi cài, nên muốn thử offline
thì: mở trang → tải lại một lần → tắt server → tải lại lần nữa.

## Kiểm tra

```bash
pnpm lint          # gồm rule cấm hex thô và dangerouslySetInnerHTML
pnpm -r typecheck
pnpm -r test       # test miền chạy trên PGlite, test tích hợp trên sora_test
pnpm -r build
```

## Sinh lại dữ liệu seed từ bản thiết kế

```bash
pnpm extract-seed
```

Đọc `designs/*.dc.html`, xuất JSON đã chuẩn hoá vào `scripts/extract-seed/out/`.

## Mở POS và màn bếp lên dùng ngay

```bash
pnpm --filter @sora/api db:dev-bootstrap
```

Lệnh này làm hai việc mà ngoài đời người vận hành làm tay lúc mở quán: tạo thiết bị
đầu tiên của chi nhánh và phát hành bundle cấu hình. Nó in ra token của từng máy.

Mở app rồi dán vào Console của trình duyệt:

```js
localStorage.setItem('sora.device.token', 'dev-device-token')   // POS
localStorage.setItem('sora.device.token', 'dev-kds-st-02')      // Màn quầy sống
localStorage.setItem('sora.device.token', 'dev-kds-st-06')      // Màn bếp nướng
location.reload()
```

> **Lưu ý khi chạy dev:** cookie của trình duyệt KHÔNG phân biệt cổng, nên phiên
> đăng nhập ở POS (`localhost:5174`) cũng được gửi sang màn bếp (`localhost:5175`).
> Ở môi trường thật hai app nằm trên hai tên miền khác nhau nên không có chuyện đó.
> Hệ thống xử lý đúng trong cả hai trường hợp: quyền là hợp của vai trò người đăng
> nhập và vai trò của thiết bị họ đang đứng.

## Tài khoản dev

PIN 4 số, chỉ dùng ở môi trường phát triển (xem `apps/api/src/db/seed.ts`):

| Nhân viên | Vai trò | PIN |
|---|---|---|
| Hoa | R2 Thu ngân | 1101 |
| Minh | R1 Phục vụ | 1102 |
| Tuấn | R1 Phục vụ | 1103 |
| Lan | R7 Quản lý ca | 1104 |
| Đức | R1 Phục vụ | 1105 |

Đăng nhập cần **thiết bị đã ghép**: PIN đứng một mình không dùng được. Thiết bị đầu
tiên của chi nhánh phải tạo bản ghi trực tiếp trong CSDL (đúng như lúc mở quán thật);
từ thiết bị đó mới sinh được mã ghép 6 số cho các máy sau.
