# Triển khai & đấu nối — Tokyo Sora

Tài liệu này mô tả 5 ứng dụng nối với nhau ra sao: dữ liệu chảy theo hướng nào, ai là
nguồn sự thật, sự kiện nào bắn đi lúc nào. Đọc cùng `README.md`.

---

## 1. Sơ đồ hệ thống

```
                    ┌──────────────────────────┐
                    │      SORA OFFICE         │  nguồn cấu hình
                    │ món · set · giá · sơ đồ  │  (một chiều đi xuống)
                    │ bàn · vùng giao · tham số│
                    └────────────┬─────────────┘
                                 │ publish config
              ┌──────────────────┼──────────────────┐
              ▼                  ▼                  ▼
      ┌───────────────┐  ┌───────────────┐  ┌───────────────┐
      │   SORA WEB    │  │  SORA TABLE   │  │   SORA POS    │
      │ khách đặt về  │  │ khách tại bàn │  │ phục vụ/thu   │
      └───────┬───────┘  └───────┬───────┘  └───┬───────┬───┘
              │ tạo đơn online   │ gửi món      │       │
              └────────┬─────────┴──────────────┘       │
                       ▼                                │
             ┌──────────────────┐                       │
             │   ORDER SERVICE  │◄──────────────────────┘
             │  (nguồn sự thật) │   thao tác: xác nhận,
             └────────┬─────────┘   huỷ, chuyển bàn, chốt
                      │ ticket.created (định tuyến theo trạm)
                      ▼
             ┌──────────────────┐
             │  SORA KITCHEN    │  vé bếp: chờ → làm → chờ ra → expo
             └────────┬─────────┘
                      │ ticket.ready
                      ▼   (POS O8/P16 nhận, Web O7 & Table T8 nhận qua realtime)
```

**Nguyên tắc:**
1. **Office là nguồn duy nhất của cấu hình** (danh mục món, giá, set, sơ đồ bàn, vùng giao,
   khung giờ nhận đặt, tham số thuế/phí). Web · Table · POS · Kitchen chỉ **đọc**.
2. **Order Service là nguồn duy nhất của đơn**. Mọi app tạo/sửa đơn đều đi qua nó, không app
   nào giữ trạng thái riêng.
3. **Kitchen chỉ tiêu thụ vé**, không biết giá tiền, không biết khách là ai.
4. Mọi thay đổi trạng thái phát **realtime** tới các app đang mở màn liên quan.

---

## 2. Hợp đồng dữ liệu chính

### 2.1 Đơn hàng (order)

```jsonc
{
  "id": "ON-2608-0417",           // mã hiển thị cho khách
  "branchId": "cg",                // chi nhánh: cg | tx | dn
  "channel": "web",                // web | table | pos | grab | shopee
  "type": "takeaway",              // takeaway | delivery | dinein
  "status": "confirmed",           // xem state machine mục 3
  "table": null,                   // "A4" nếu type=dinein
  "customer": { "name": "…", "phone": "…", "address": "…", "note": "…" },
  "slot": { "mode": "asap", "at": "2026-08-01T19:30:00+07:00" },
  "lines": [
    { "lineId": "L1", "dishId": "luoibo", "qty": 2, "unitPrice": 325000,
      "addOns": [{ "id": "muoichanh", "price": 0 }],
      "note": "cắt lát vừa", "station": "yaki", "state": "queued" }
  ],
  "money": { "sub": 890000, "ship": 25000, "discount": 0, "vat": 0, "total": 915000 },
  "payment": { "method": "vietqr", "state": "paid", "ref": "FT26080112345" },
  "shipper": { "id": "SH-02", "name": "…", "phone": "…" },
  "timestamps": { "created": "…", "confirmed": "…", "ready": "…", "done": "…" }
}
```

Trường **`station`** trên từng dòng là chìa khoá đấu nối bếp — xem mục 4.

### 2.2 Vé bếp (ticket)

```jsonc
{
  "id": "TK-8842",
  "orderId": "ON-2608-0417",
  "orderLabel": "ON-0417",      // hiển thị to trên màn bếp
  "station": "yaki",             // yaki | age | men | tsume | expo
  "source": "online",            // online | table | pos
  "table": "A4",                 // hoặc null với đơn mang về
  "priority": "normal",          // normal | rush | late
  "items": [{ "dishId": "luoibo", "name": "Lưỡi bò phần ngoài", "qty": 2,
              "note": "cắt lát vừa", "state": "cooking" }],
  "openedAt": "…", "dueAt": "…"
}
```

### 2.3 Cấu hình phát xuống (config bundle)

Office xuất bản một bundle có version; các app cache lại và chỉ tải mới khi version đổi.

```jsonc
{
  "version": "2026-08-01T09:12:00Z#41",
  "branches": [...],            // A10
  "dishes": [...],              // M1 — kèm cờ onlineVisible, station, allergens
  "sets": [...],                // M1 — courses[] để dựng trang chi tiết set
  "floorplan": {...},           // A3 — sơ đồ bàn cho POS P2
  "delivery": { "zones": [...], "fees": [...], "minOrder": ... },   // O10
  "onlineMenu": { "visible": [...], "soldOut": [...], "caps": {...} }, // O11
  "reservation": { "slots": [...], "blockDays": 2, "autoConfirm": true }, // R3
  "params": { "vat": 0, "serviceFee": 0, "rounding": 1000 }         // A6
}
```

---

## 3. Vòng đời trạng thái đơn

```
new ──► confirmed ──► cooking ──► ready ──► delivering ──► done
 │           │            │          │           │
 └───────────┴────────────┴──────────┴───────────┴────► cancelled
```

| Trạng thái | Ai đổi | Màn tương ứng |
|---|---|---|
| `new` | Web O6/O13 tạo | POS **O8** hiện thẻ nhấp nháy + P16 dải điều phối |
| `confirmed` | POS O8/O9 bấm "Xác nhận" | Bắn `ticket.created` → Kitchen **K2** |
| `cooking` | Kitchen K2 bấm "Bắt đầu" | Web **O7** đổi bước, Table **T8** đổi trạng thái |
| `ready` | Kitchen K4/K6 bấm "Xong" | POS O8 chuyển cột, P16 kêu chuông |
| `delivering` | POS gán shipper (drawer P16) | Web O7 hiện thông tin shipper |
| `done` | POS bấm giao xong / khách nhận | Đơn rơi khỏi bảng điều phối |
| `cancelled` | POS O9 (có lý do) hoặc khách (trước `cooking`) | Bếp nhận `ticket.void` |

**Quy tắc chặn:** không cho huỷ khi đã `cooking` trở đi — POS hiện hộp "Không thể huỷ,
món đã lên bếp" (đã có sẵn trong thiết kế O9).

---

## 4. Định tuyến vé xuống bếp (quan trọng nhất)

Mỗi món trong Office (M1) khai báo một **trạm bếp**:

| Mã trạm | Tên | Món |
|---|---|---|
| `yaki` | Nướng than | bò, heo, hải sản, rau nướng |
| `age` | Chiên | karaage, đồ chiên |
| `men` | Mì & lẩu | mì lạnh, sukiyaki, lẩu |
| `tsume` | Món lạnh | sashimi, dưa muối, bò tái |
| `expo` | Ra món | tráng miệng, đồ uống |

Khi đơn chuyển `confirmed`, Order Service **tách các dòng theo trạm** và tạo **một vé cho
mỗi trạm** (không phải một vé cho cả đơn). Màn K2 của mỗi trạm chỉ nhận vé của mình.
Màn **K6 Expo** nhận bản gộp toàn đơn để kiểm đủ món trước khi ra.

Set được **nổ ra thành từng món thành phần** rồi mới định tuyến — mỗi món của set về đúng
trạm, nhưng vé giữ `setLabel` để bếp biết chúng thuộc cùng một set và ra cùng lúc.

---

## 5. API tối thiểu

### Cấu hình
```
GET  /api/config?branch=cg&version=<đang có>   → 304 hoặc bundle mới
POST /api/office/config/publish                 → Office bấm "Lưu & phát hành"
```

### Đơn hàng
```
POST  /api/orders                     tạo đơn (Web O6, Table T7, POS P4)
GET   /api/orders?branch&status&date  bảng điều phối O8, kênh ngoài O12
GET   /api/orders/:id                 chi tiết O9 / theo dõi O7 / T8
PATCH /api/orders/:id/status          { to: "confirmed" | "ready" | ... }
PATCH /api/orders/:id/lines           thêm/bớt/huỷ dòng (P8 huỷ món)
POST  /api/orders/:id/assign-shipper  drawer gán ship ở P16
POST  /api/orders/:id/cancel          { reason } — O9
```

### Bếp
```
GET   /api/tickets?station=yaki&branch=cg    hàng vé K2
PATCH /api/tickets/:id/state                 { to: "cooking" | "ready" }
POST  /api/tickets/:id/items/:i/void         K5 báo hết món
POST  /api/kitchen/pair                      K1 ghép thiết bị (mã 6 số)
```

### Bàn & đặt chỗ
```
GET   /api/tables?branch=cg           sơ đồ bàn P2
POST  /api/tables/:id/open            P3 mở bàn
POST  /api/tables/:id/merge|split|move P9
GET   /api/reservations?date          R1 bảng đặt bàn
POST  /api/reservations               W6 khách đặt / R2 nhân viên tạo
POST  /api/reservations/:id/no-show   R4
```

### Thanh toán
```
POST  /api/payments/vietqr            tạo QR (O13, T13) → { qrString, ref, expiresAt }
POST  /api/webhooks/bank              ngân hàng báo có → chuyển O14/T14 sang đã thanh toán
POST  /api/payments/cash              P10/P11 tiền mặt
GET   /api/payments/reconcile?date    P15 đối soát, F1 quỹ
```

---

## 6. Realtime

Dùng WebSocket (hoặc SSE) với kênh theo chi nhánh + vai trò:

| Kênh | Ai nghe | Sự kiện |
|---|---|---|
| `branch:<id>:orders` | POS O8, P16, O12 | `order.created`, `order.updated`, `order.cancelled` |
| `branch:<id>:station:<mã>` | Kitchen K2/K4 | `ticket.created`, `ticket.void`, `ticket.rush` |
| `branch:<id>:expo` | Kitchen K6 | `ticket.ready` toàn trạm |
| `branch:<id>:tables` | POS P2, Table T8 | `table.opened`, `table.request`, `table.paid` |
| `order:<id>` | Web O7, Table T8 | trạng thái đơn của riêng khách |
| `branch:<id>:config` | tất cả | `config.published` → app tự tải bundle mới |

Yêu cầu bắt buộc: **mất mạng không được mất đơn**. POS và Kitchen phải có hàng đợi cục bộ,
gửi lại khi có mạng; vé bếp đã in/hiện thì không biến mất khi reload.

---

## 7. Thứ tự triển khai đề xuất

**Giai đoạn 1 — Xương sống (4–6 tuần)**
Order Service + config bundle + Sora POS (P1→P11) + Sora Kitchen (K1→K4).
Đủ để một nhà hàng chạy thật: mở bàn, gọi món, bếp nấu, tính tiền.

**Giai đoạn 2 — Khách tự phục vụ (3–4 tuần)**
Sora Table (T1→T15) + màn P12 duyệt yêu cầu từ bàn. Giảm tải phục vụ.

**Giai đoạn 3 — Kênh online (4–5 tuần)**
Sora Web trang tĩnh (W1→W9) + luồng /dat-mon (O1→O7) + POS O8/O9/O12 + VietQR webhook.

**Giai đoạn 4 — Đặt bàn (2 tuần)**
W6 + R1/R2/R3/R4.

**Giai đoạn 5 — Hậu cần (6–8 tuần)**
Sora Office: M1/M4 → S1/S2 → B1/B3 → H2/H7 → C1/F1/F7 → A2/A3/A6/A10.

Giai đoạn 1 và 2 dùng chung 80% component; làm đúng ngay từ đầu sẽ tiết kiệm về sau.

---

## 8. Hạ tầng & thiết bị

| Hạng mục | Đề xuất |
|---|---|
| Backend | Một service duy nhất (Node/NestJS hoặc Go) + PostgreSQL + Redis (realtime, hàng đợi) |
| Web khách | Next.js SSR để SEO trang W1–W9; luồng /dat-mon là client-side |
| POS | Web app chạy fullscreen trên máy POS Android/Windows, cache offline bằng IndexedDB |
| Kitchen | Web app kiosk mode trên Android TV box / mini PC, **không tắt màn**, tự reconnect |
| Table | Web app mở từ QR dán trên bàn, URL dạng `/ban/<mã bàn>?t=<token phiên>` |
| In ấn | Máy in bếp 80mm qua LAN (ESC/POS); hoá đơn khách in từ POS P11 |
| Thanh toán | VietQR động qua cổng ngân hàng có webhook (không quét tay) |

**Bảo mật tối thiểu:** token phiên bàn hết hạn khi đóng bàn · POS đăng nhập theo ca có PIN ·
Office phân quyền theo vai trò (màn A2 đã thiết kế sẵn ma trận quyền).

---

## 9. Điểm dễ sai khi dựng lại

1. **Set phải nổ ra thành món thành phần** trước khi vào bếp — nếu đẩy nguyên "Set Kiwami"
   xuống một trạm, bếp không làm được.
2. **Giá luôn lấy từ config bundle tại thời điểm tạo đơn** và **đóng băng vào dòng đơn**.
   Office đổi giá không được làm đổi đơn đã tạo.
3. **Món hết (K5, O11)** phải đồng thời khoá trên Web, Table và POS trong vài giây —
   nếu không khách vẫn đặt được món đã hết.
4. **Mã đơn hiển thị và id nội bộ là hai thứ khác nhau.** Khách đọc `ON-0417` qua điện thoại;
   đừng bắt họ đọc UUID.
5. **Đồng hồ đếm trên vé bếp tính từ `confirmed`**, không phải từ lúc khách bấm đặt —
   nếu không mọi vé đều đỏ ngay khi hiện.
6. **Bản mobile của Sora Web là thiết kế riêng**, không phải bản desktop thu nhỏ. Dựng đúng
   theo màn `… mobile` trong prototype.
