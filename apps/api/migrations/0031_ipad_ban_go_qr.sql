-- iPad gắn bàn thay cho điện thoại quét QR (CLAUDE.md §9.1, chốt 22/10/2026).
--
-- · `devices.kind` thêm 'table', mang `table_id`; mỗi bàn đúng một iPad đang chạy.
--   Khoá ngoại tới `tables` nằm ở 9007 — khai trong schema là `identity.ts` và
--   `floorplan.ts` nhập vòng nhau.
-- · Gỡ hẳn luồng QR điện thoại: bảng `table_devices` (máy khách theo từng lượt
--   quét, chủ bàn duyệt) và `table_sessions.qr_token_hash` (token QR theo phiên,
--   ghi mà chưa bao giờ được đọc). Dữ liệu trong đó là vé vào bàn của những bữa
--   đã xong — nhật ký A7 vẫn giữ dấu ai đã vào bàn nào.
ALTER TABLE "table_devices" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "table_devices" CASCADE;--> statement-breakpoint
ALTER TABLE "table_sessions" DROP CONSTRAINT "table_sessions_qr_token_hash_unique";--> statement-breakpoint
ALTER TABLE "devices" DROP CONSTRAINT "devices_kind_check";--> statement-breakpoint
ALTER TABLE "devices" ADD COLUMN "table_id" bigint;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD COLUMN "table_id" bigint;--> statement-breakpoint
CREATE UNIQUE INDEX "devices_one_live_table" ON "devices" USING btree ("table_id") WHERE revoked_at IS NULL;--> statement-breakpoint
ALTER TABLE "table_sessions" DROP COLUMN "qr_token_hash";--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_table_check" CHECK (("devices"."kind" = 'table') = ("devices"."table_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_kind_check" CHECK ("devices"."kind" IN ('pos','cashier','kds','kiosk','bridge','table'));--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_table_check" CHECK (("pairing_codes"."kind" = 'table') = ("pairing_codes"."table_id" IS NOT NULL));