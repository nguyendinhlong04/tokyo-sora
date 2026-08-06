ALTER TABLE "ticket_items" ADD COLUMN "done_at" timestamp with time zone;--> statement-breakpoint
-- Nạp mốc giờ cho những món ĐÃ xong từ trước, nếu không ràng buộc bên dưới đổ
-- ngay lúc áp. Lấy giờ xong của vé; vé nào không có thì lấy giờ mở vé — không
-- chính xác tuyệt đối, nhưng đây là dữ liệu đã qua, chỉ dùng cho cửa sổ hoàn tác
-- 30 giây nên mọi mốc quá khứ đều cho cùng một kết quả: hết hạn hoàn tác.
UPDATE "ticket_items" ti
   SET "done_at" = COALESCE(t."ready_at", t."opened_at")
  FROM "tickets" t
 WHERE t."id" = ti."ticket_id" AND ti."state" = 'done' AND ti."done_at" IS NULL;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_done_at_check" CHECK (("ticket_items"."state" = 'done') = ("ticket_items"."done_at" IS NOT NULL));
