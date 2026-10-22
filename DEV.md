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

Chưa có Postgres trên máy thì dựng một cái bằng Docker, đủ để chạy toàn bộ test
tích hợp — **KHÔNG trỏ `TEST_DATABASE_URL` vào CSDL thật**, mỗi lần chạy test là
nó `DROP SCHEMA public CASCADE`:

```bash
docker run -d --name sora-test-pg -e POSTGRES_PASSWORD=test -e POSTGRES_DB=sora_test -p 55432:5432 postgres:16-alpine
```

Rồi khai `TEST_DATABASE_URL=postgres://postgres:test@localhost:55432/sora_test`.

**macOS không có Docker:** cài [Postgres.app](https://postgresapp.com) (chọn PostgreSQL
16), bấm _Initialize_. Superuser là tên tài khoản macOS, không mật khẩu, cổng 5432.

```bash
PG=/Applications/Postgres.app/Contents/Versions/16/bin
"$PG/pg_isready"
"$PG/createdb" sora_dev && "$PG/createdb" sora_test
```

Khai `apps/api/.env`: `DATABASE_MIGRATION_URL=postgres://$USER@localhost:5432/sora_dev`,
`DATABASE_URL=postgres://sora_app:<mật khẩu tự đặt>@localhost:5432/sora_dev`,
`TEST_DATABASE_URL=postgres://$USER@localhost:5432/sora_test`. Thứ tự lần đầu:

```bash
pnpm --filter @sora/api db:migrate
"$PG/psql" "postgres://$USER@localhost:5432/sora_dev" -v app_password="<mật khẩu tự đặt>" -f deploy/db-roles.sql
pnpm extract-seed          # seed đọc JSON sinh từ bản thiết kế; thư mục out/ bị gitignore
pnpm --filter @sora/api db:seed
pnpm --filter @sora/api db:dev-bootstrap
```

`db-roles.sql` chạy SAU migration vì nó thu hồi quyền trên các bảng sổ đã có.

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
pnpm dev:staff    # Kênh nhân viên :5178 — H8 · H9
pnpm dev:kiosk    # Kiosk chấm công:5179 — H10
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
đầu tiên của chi nhánh và phát hành bundle cấu hình. Nó in ra token của từng máy. Trên
máy dev nó còn dựng **sơ đồ tổ chức theo mẫu chuẩn** (khung chuỗi + từng chi nhánh — N2)
và đặt PIN cho tài khoản Office (bảng bên dưới). Chạy lại không nhân đôi gì.

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

| Tài khoản | Vai trò | Mật khẩu | PIN |
|---|---|---|---|
| chu@tokyosora.vn | R10 Chủ / Admin | `sora-dev-2026` | 2101 |
| chuoi@tokyosora.vn | R11 Quản lý chuỗi | `sora-dev-2026` | 2102 |
| ketoan@tokyosora.vn | R8 Kế toán | `sora-dev-2026` | 2103 |
| nhansu@tokyosora.vn | R13 Quản lý nhân sự | `sora-dev-2026` | 2104 |
| marketing@tokyosora.vn | R9 Marketing | `sora-dev-2026` | 2105 |
| lan@tokyosora.vn | R7 Quản lý ca (chi nhánh đầu) | `sora-dev-2026` | 1104 |

> **PIN và tài khoản của Lan do `db:dev-bootstrap` đặt, không phải `db:seed`** — seed
> còn chạy trên production (DEPLOY.md), mà mọi chuỗi ở đây nằm công khai trong repo.
> Chưa chạy bootstrap thì tài khoản Office không có PIN: dải duyệt △ và bước ký văn
> bản sẽ báo "PIN không đúng". `lan@` dùng để thử phạm vi của R7 — chỉ thấy chi nhánh
> của mình, không sửa được những gì R7 không được sửa.

**Thử SOP theo ca từ đầu tới cuối** (việc định kỳ sinh khi có người mở hộp việc, không
có cron — tải lại trang là thấy):

1. `nhansu@` → **N2**: xếp một phục vụ vào ghế _Sảnh · Phục vụ_ và Lan vào _Sảnh · Quản lý
   ca_ (SOP giao cho chức danh — người chưa có ghế không nhận được).
2. `lan@` → **H2**: thêm ca mẫu (vd. Ca sáng 07:00–15:00, Ca tối 15:00–23:00), xếp người
   phục vụ đó vào ca sáng hôm nay **bằng ca mẫu**, rồi **Công bố**.
3. `lan@` → **N6 · Mẫu việc** → **Dùng bộ SOP chuẩn**.
4. **H1** → **Link** của người phục vụ → mở link ở cửa sổ ẩn danh, nhập PIN → tab **Việc**
   có "Mở ca – Sảnh". Tích, nộp → Lan thấy ở chuông và **N1 · Chờ tôi nghiệm thu**.

**Thử KPI → thưởng gợi ý H7** (kỳ đánh giá chỉ vào bước chấm được SAU ngày cuối kỳ — thử
bằng kỳ của tháng trước):

1. `nhansu@` → **N9** → **Dùng bộ KPI mẫu** (chọn phạm vi chi nhánh, rồi "Văn phòng
   chuỗi"). Ghế chưa có bộ thì người ngồi ghế đó được miễn đánh giá.
2. **N10** → **Mở kỳ mới** cho tháng trước → **Công bố…** → **Tính lại**. Mở một phiếu để
   xem số tự động; chỉ số thiếu dữ liệu ghi "không tính".
3. **Bắt đầu đánh giá**. Người phục vụ mở tab **KPI** trên Kênh nhân viên, tự chấm, gửi.
   Người đánh giá (cấp trên trực tiếp theo sơ đồ lúc mở kỳ — cột _Người đánh giá_ ở N10)
   mở phiếu, chấm thái độ 1–5, **Kết thúc đánh giá…**. Phiếu của người chưa tự đánh giá phải chờ
   `kpi.selfReviewDays` (A6, mặc định 5 ngày) — để thử nhanh đặt về 0.
4. `nhansu@` → **Chốt kỳ…** (người có phiếu trong kỳ không chốt được).
5. **H7** → mở kỳ lương cùng tháng → **Chốt công** → **Tính nháp…**: thưởng gợi ý điền
   sẵn; sửa một dòng thì phải ghi lý do.

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

## Chạy thử Kênh nhân viên và kiosk chấm công (H8 · H9 · H10)

**Kênh nhân viên (`:5178`)** — nhân viên xem lịch, công, phiếu lương của chính mình:

1. Office → **Nhân sự → Hồ sơ nhân viên**, bấm **Link** ở hàng của người cần cấp.
   Hộp thoại hiện link đúng một lần; token chỉ có bản băm trong CSDL nên đóng hộp
   là không xem lại được.
2. Mở link trong **cửa sổ ẩn danh** (tránh va cookie với phiên Office ở `localhost`),
   nhập PIN của chính người đó — cùng PIN dùng ở quán.
3. Máy dev không đặt `VITE_STAFF_ORIGIN` thì link trỏ về chính Office; đổi cổng
   trong thanh địa chỉ sang `5178`, hoặc chạy Office với
   `VITE_STAFF_ORIGIN=http://localhost:5178`.

Phiên mở bằng link có phạm vi `self`: mọi route ngoài nhóm "của chính mình" đều trả
403, kể cả với thu ngân vốn có quyền mở bàn. Đó là hành vi ĐÚNG — xem
`PermissionGuard`.

**Kiosk chấm công (`:5179`)** — máy gắn cứng ở chi nhánh:

1. Office → **Quản trị → Thiết bị**, sinh mã ghép loại **Kiosk chấm công**.
2. Mở `localhost:5179`, nhập mã 6 số. Ghép xong màn này không hiện lại nữa.
3. Chạm tên → nhập PIN → màn chào "Chào Hoa · Vào ca 15:02 · lịch 15:00". Bấm lần
   hai trong ngày là chấm ra; lần ba bị chặn.

> Chấm công đòi **cả hai**: PIN của chính mình VÀ thiết bị đã ghép. Thử chấm từ
> Kênh nhân viên sẽ bị từ chối — đó là "thiết bị gắn chi nhánh, không chấm từ
> ngoài" (§26 H10) đang chạy.
>
> **Va chạm cookie ở dev:** cookie `sora_staff` dùng chung theo `localhost` bất kể
> cổng, mà AuthGuard ưu tiên phiên nhân viên hơn token thiết bị. Đang mở Kênh nhân
> viên (`:5178`) rồi chấm công ở kiosk (`:5179`) sẽ báo *"chỉ thực hiện được trên
> kiosk đã ghép"* — vì phiên đang dùng là phiên không có thiết bị. Bấm **Thoát** ở
> Kênh nhân viên, hoặc mở kiosk ở cửa sổ ẩn danh. Ngoài đời hai app ở hai tên miền
> nên không gặp.
>
> Chưa làm trong bản dựng này: **ảnh chụp lúc chấm** (tuỳ chọn ở A6). Cột
> `time_entries.photo_url` đã có nhưng chưa có kho ảnh để đẩy lên.
