-- Màn chờ quảng cáo của iPad tại bàn (CLAUDE.md §9.1b): khung hero A8 có thêm cờ
-- "chiếu trên iPad bàn", riêng với cờ trang chủ.
ALTER TABLE "site_hero_images" ADD COLUMN "table_screen" boolean DEFAULT false NOT NULL;--> statement-breakpoint
-- Khung đang chiếu trên trang chủ lên luôn màn chờ: iPad có quảng cáo ngay ngày đầu
-- thay vì đứng trống chờ marketing đánh dấu từng khung. Khung mới thì mặc định KHÔNG,
-- để khung soạn dở cho trang chủ không lọt ra bàn ăn.
UPDATE "site_hero_images" SET "table_screen" = "published";
