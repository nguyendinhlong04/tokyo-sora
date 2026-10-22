ALTER TABLE "promotions" DROP CONSTRAINT "promotions_kind_check";--> statement-breakpoint
ALTER TABLE "promotions" DROP CONSTRAINT "promotions_value_check";--> statement-breakpoint
DROP INDEX "promotion_redemptions_one_per_order";--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "promotion_id" bigint;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "discount_vnd" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "promo_qty" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "bill_promotion_id" bigint;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "money_bill_discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "voucher_code_id" bigint;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "scope" text DEFAULT 'bill' NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "badge" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "buy_qty" smallint;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "get_qty" smallint;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "get_percent" smallint;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "target_dish_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "target_category_ids" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "concentrated" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "legal_notice" text;--> statement-breakpoint
ALTER TABLE "promotions" ADD COLUMN "state_changed_at" timestamp with time zone;--> statement-breakpoint
-- Viết tay (§9.6): chương trình "giá set khung giờ" cũ trỏ MỘT món qua target_dish_id;
-- giờ nó là chương trình MÓN với danh sách món áp dụng, còn target_dish_id chỉ dành cho
-- món được tặng. Chạy trước khi gắn ràng buộc mới, nếu không ràng buộc chặn ngay dòng cũ.
UPDATE "promotions" SET "scope" = 'item', "target_dish_ids" = ARRAY["target_dish_id"], "target_dish_id" = NULL WHERE "kind" = 'set_price' AND "target_dish_id" IS NOT NULL;--> statement-breakpoint
-- Chương trình đang chạy lấy mốc đổi trạng thái là lúc được bật
UPDATE "promotions" SET "state_changed_at" = COALESCE("activated_at", "updated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_redemptions_order_promo" ON "promotion_redemptions" USING btree ("order_id","promotion_id");--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_discount_check" CHECK ("order_lines"."discount_vnd" >= 0 AND "order_lines"."promo_qty" BETWEEN 0 AND "order_lines"."qty"
          AND "order_lines"."price_total" = "order_lines"."qty" * "order_lines"."unit_price" - "order_lines"."discount_vnd"
          AND ("order_lines"."promotion_id" IS NULL) = ("order_lines"."discount_vnd" = 0));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_bill_discount_check" CHECK ("orders"."money_bill_discount" >= 0 AND "orders"."money_bill_discount" <= "orders"."money_discount"
          AND ("orders"."bill_promotion_id" IS NULL) = ("orders"."money_bill_discount" = 0));--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_scope_check" CHECK ("promotions"."scope" IN ('item','bill'));--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_scope_kind_check" CHECK (("promotions"."scope" = 'item' AND "promotions"."kind" IN ('percent','amount','set_price','buy_x_get_y'))
       OR ("promotions"."scope" = 'bill' AND "promotions"."kind" IN ('percent','amount','free_dish')));--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_targets_check" CHECK (("promotions"."scope" = 'item'
             AND cardinality("promotions"."target_dish_ids") + cardinality("promotions"."target_category_ids") > 0)
       OR ("promotions"."scope" = 'bill' AND ("promotions"."kind" = 'free_dish'
             OR cardinality("promotions"."target_dish_ids") + cardinality("promotions"."target_category_ids") = 0)));--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_kind_check" CHECK ("promotions"."kind" IN ('percent','amount','set_price','buy_x_get_y','free_dish'));--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_value_check" CHECK (("promotions"."kind" = 'percent'     AND "promotions"."percent_bp" BETWEEN 1 AND 10000
                                     AND "promotions"."amount_vnd" IS NULL AND "promotions"."set_price_vnd" IS NULL
                                     AND "promotions"."buy_qty" IS NULL AND "promotions"."target_dish_id" IS NULL)
       OR ("promotions"."kind" = 'amount'      AND "promotions"."amount_vnd" > 0
                                     AND "promotions"."percent_bp" IS NULL AND "promotions"."set_price_vnd" IS NULL
                                     AND "promotions"."buy_qty" IS NULL AND "promotions"."target_dish_id" IS NULL)
       OR ("promotions"."kind" = 'set_price'   AND "promotions"."set_price_vnd" >= 0
                                     AND "promotions"."percent_bp" IS NULL AND "promotions"."amount_vnd" IS NULL
                                     AND "promotions"."buy_qty" IS NULL AND "promotions"."target_dish_id" IS NULL)
       OR ("promotions"."kind" = 'buy_x_get_y' AND "promotions"."buy_qty" >= 1 AND "promotions"."get_qty" >= 1
                                     AND "promotions"."get_percent" BETWEEN 1 AND 100
                                     AND "promotions"."percent_bp" IS NULL AND "promotions"."amount_vnd" IS NULL
                                     AND "promotions"."set_price_vnd" IS NULL AND "promotions"."target_dish_id" IS NULL)
       OR ("promotions"."kind" = 'free_dish'   AND "promotions"."target_dish_id" IS NOT NULL
                                     AND "promotions"."percent_bp" IS NULL AND "promotions"."amount_vnd" IS NULL
                                     AND "promotions"."set_price_vnd" IS NULL AND "promotions"."buy_qty" IS NULL));