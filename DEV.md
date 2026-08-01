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
