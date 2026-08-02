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

Sửa dữ liệu thực đơn (giá, nhóm tuỳ chọn, cờ chay/cay/hải sản) thì phải **phát
hành lại bundle** thì app mới thấy — `db:dev-bootstrap` ở cuối trang làm việc đó.

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
pnpm dev:api      # API   :3000 — chạy trước, các app đều proxy /api về đây
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
>
> Với Sora Table thì va chạm này gắt hơn: cookie bàn (`sora_table`) và cookie nhân
> viên (`sora_staff`) cùng nằm trên `localhost`, mà thứ tự ưu tiên là **nhân viên
> trước, bàn sau**. Đang đăng nhập POS thì mở app bàn sẽ thấy "Chưa vào được bàn
> nào"; ngược lại, đang có cookie bàn thì POS không đăng nhập được ("Thiếu thiết bị
> đã ghép"). Cách làm việc: **mở Sora Table ở cửa sổ ẩn danh hoặc trình duyệt khác**
> với POS. Ngoài đời `pos.tokyosora.vn` và `ban.tokyosora.vn` là hai tên miền nên
> không bao giờ gặp.

## Chạy thử vòng khách tự phục vụ (GĐ2)

1. Mở bàn ở POS (P2 → chạm bàn trống), vào màn đơn bàn.
2. Bấm **Mã QR bàn** — POS cấp token mới và hiện mã QR. Quét bằng điện thoại cùng
   mạng LAN, hoặc chép địa chỉ `/t/<token>` rồi mở ở cửa sổ ẩn danh trỏ vào
   `http://localhost:5173`.
3. Khách gọi món trên điện thoại → vé xuống màn bếp; bấm **Gọi nhân viên** → yêu cầu
   hiện ở màn **Yêu cầu từ bàn** (P12) của POS.
4. Tự thanh toán tới màn VietQR rồi giả lập ngân hàng báo có:

```bash
node -e "const {createHmac}=require('crypto');const raw=JSON.stringify({bankRef:'FT-DEV-1',vaNumber:'<VA trên màn>',amount:<số tiền>});fetch('http://localhost:3000/api/webhooks/bank',{method:'POST',headers:{'content-type':'application/json','x-bank-signature':createHmac('sha256',process.env.BANK_WEBHOOK_SECRET||'dev-bank-secret').update(raw).digest('hex')},body:raw}).then(r=>r.text()).then(console.log)"
```

Chỉ webhook này mới đổi trạng thái sang **đã trả** — nút "Đã chuyển xong" của khách
chỉ đổi màn hình chờ.

Mã QR in từ POS trỏ về `VITE_TABLE_ORIGIN`; máy dev không đặt biến này thì mã trỏ về
chính POS (`:5174`), nên khi thử bằng điện thoại thật hãy đặt
`VITE_TABLE_ORIGIN=http://<IP máy dev>:5173`.

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

Sora Office (`localhost:5176`) đăng nhập bằng **email + mật khẩu**, không cần thiết bị
ghép — Office chạy trên máy tính của quản lý, không phải máy của chi nhánh:

| Tài khoản | Vai trò | Mật khẩu |
|---|---|---|
| chu@tokyosora.vn | R10 Chủ / Admin | `sora-dev-2026` |
| chuoi@tokyosora.vn | R11 Quản lý chuỗi | `sora-dev-2026` |
| ketoan@tokyosora.vn | R8 Kế toán | `sora-dev-2026` |
| nhansu@tokyosora.vn | R13 Quản lý nhân sự | `sora-dev-2026` |
| marketing@tokyosora.vn | R9 Marketing | `sora-dev-2026` |

> Cả nhóm quản trị (A1–A6, A9, A10) và R3 gắn quyền `admin.manage-accounts-roles` — theo
> ma trận §4.2 chỉ R10 có. Đăng nhập bằng `chuoi@` sẽ vào được Office nhưng cột trái không
> hiện những màn đó. Hai ngoại lệ: **A7 nhật ký** mở cho R7 · R8 · R11 · R10 (`audit.view-log`),
> và **A8 nội dung website** mở cho R9 · R10 (`cms.edit`) — `marketing@` chỉ thấy đúng một
> mục trong cột trái, đó là ranh giới đang được cưỡng chế chứ không phải lỗi.

> **Vì sao cần bốn tài khoản:** hai luồng đòi nhiều người. Phiếu chi trên hạn mức chi
> vặt phải do NGƯỜI KHÁC duyệt (§4.3.1 — không ai tự duyệt việc của mình), nên ghi
> bằng `chu@` thì phải duyệt bằng `ketoan@`. Kỳ lương đi qua ba vai: `nhansu@` trình,
> `ketoan@` kiểm, `chu@` duyệt và phát. Chỉ đăng nhập một tài khoản thì cả hai luồng
> tắc ở giữa — và đó là hành vi ĐÚNG, không phải lỗi.

> Trên máy dev, cookie phiên dùng chung theo `localhost` bất kể cổng, nên đăng nhập
> Office xong thì POS coi như đang là người đó. Ngoài đời hai app ở hai tên miền nên
> không đụng nhau; ở dev cứ đăng nhập lại app nào mình đang thử.
