-- Hoá đơn điện tử khởi tạo từ máy tính tiền (NĐ 254/2026/NĐ-CP, TT 91/2026/TT-BTC).
--
-- · VAT theo từng thuế suất: `dishes.vat_code` thành nhóm thuế (standard | alcohol),
--   đóng băng vào `order_lines.vat_code`; `orders.vat_breakdown` giữ tiền từng thuế
--   suất mỗi lần tính lại đơn. Bia, rượu chịu thuế TTĐB nên không được giảm VAT.
-- · `orders.invoice_buyer`: người mua khách yêu cầu ghi trên hoá đơn, trước khi
--   phát hành.
-- · `invoices` mang đủ một hoá đơn: mẫu số, ngày lập, người mua, từng khoản tiền,
--   VAT theo thuế suất, mã tra cứu, và các cột của lượt phát hành (khoá gửi lặp,
--   số lần thử, lease). Huỷ không còn đòi bản ghi duyệt ở CSDL — người được làm
--   thẳng không sinh bản ghi duyệt nào, đòi nó từng làm kế toán huỷ là lỗi 500.
-- · `einvoice_counters` cấp số không trùng; `invoice_buyers` là danh bạ MST tổ chức.
-- Trigger giữ hoá đơn đã phát hành bất biến nằm ở 9008.
CREATE TABLE "einvoice_counters" (
	"serial" text PRIMARY KEY NOT NULL,
	"last_no" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "einvoice_counters_no_check" CHECK ("einvoice_counters"."last_no" BETWEEN 1 AND 99999999)
);
--> statement-breakpoint
CREATE TABLE "invoice_buyers" (
	"tax_code" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"email" text,
	"status" text,
	"source" text NOT NULL,
	"looked_up_at" timestamp with time zone,
	"last_invoiced_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoice_buyers_tax_code_check" CHECK ("invoice_buyers"."tax_code" ~ '^[0-9]{10}(-[0-9]{3})?$'),
	CONSTRAINT "invoice_buyers_source_check" CHECK ("invoice_buyers"."source" IN ('invoice','lookup'))
);
--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_void_check";--> statement-breakpoint
ALTER TABLE "invoices" DROP CONSTRAINT "invoices_amount_check";--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "form_no" text DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "invoice_date" date;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "lookup_code" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "lookup_url" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "provider" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "provider_ref" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "last_error_code" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "request_key" uuid DEFAULT gen_random_uuid() NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "last_attempt_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "lease_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "buyer_kind" text DEFAULT 'consumer' NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "buyer_address" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "buyer_email" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "buyer_phone" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "payment_method" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "amount_discount" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "amount_service" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "amount_ship" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "amount_round" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "vat_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "invoices" ADD COLUMN "voided_by" bigint;--> statement-breakpoint
ALTER TABLE "order_lines" ADD COLUMN "vat_code" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "vat_breakdown" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "invoice_buyer" jsonb;--> statement-breakpoint
ALTER TABLE "payments" ADD COLUMN "reference" text;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_replaces_id_invoices_id_fk" FOREIGN KEY ("replaces_id") REFERENCES "public"."invoices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_voided_by_staff_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_one_live_replacement" ON "invoices" USING btree ("replaces_id") WHERE replaces_id IS NOT NULL AND state IN ('pending','issued','failed');--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_request_key_unique" ON "invoices" USING btree ("request_key");--> statement-breakpoint
-- Mã thuế từng là ô chữ tự do ở M2: mọi giá trị lạ về nhóm thường
UPDATE "dishes" SET "vat_code" = 'standard' WHERE "vat_code" NOT IN ('standard','alcohol');--> statement-breakpoint
-- Món thuộc nhóm bia, rượu (kể cả nhóm con dựng ở M10) chịu VAT 10%, không được giảm
UPDATE "dishes" SET "vat_code" = 'alcohol'
WHERE "category_id" IN (
  WITH RECURSIVE "tree" AS (
    SELECT "id" FROM "categories" WHERE "id" IN ('bia','ruou')
    UNION ALL
    SELECT c."id" FROM "categories" c JOIN "tree" ON c."parent_id" = "tree"."id"
  )
  SELECT "id" FROM "tree"
);--> statement-breakpoint
UPDATE "order_lines" ol SET "vat_code" = d."vat_code"
FROM "dishes" d
WHERE d."id" = ol."dish_id" AND d."vat_code" <> 'standard';--> statement-breakpoint
-- Hoá đơn đã cấp số trước đây chưa có ngày lập riêng — lấy ngày kinh doanh
UPDATE "invoices" SET "invoice_date" = "business_date"
WHERE "invoice_no" IS NOT NULL AND "invoice_date" IS NULL;--> statement-breakpoint
-- Bộ đếm bắt đầu từ số lớn nhất đã cấp của từng ký hiệu
INSERT INTO "einvoice_counters" ("serial", "last_no")
SELECT "serial", max("invoice_no"::integer)
FROM "invoices"
WHERE "invoice_no" ~ '^[0-9]{1,8}$'
GROUP BY "serial";--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_vat_code_check" CHECK ("dishes"."vat_code" IN ('standard','alcohol'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_form_check" CHECK ("invoices"."form_no" ~ '^[1-9]$');--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_numbered_check" CHECK ("invoices"."invoice_no" IS NULL OR "invoices"."invoice_date" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_replaced_check" CHECK ("invoices"."state" <> 'replaced' OR "invoices"."void_reason" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyer_kind_check" CHECK ("invoices"."buyer_kind" IN ('consumer','company','person'));--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_buyer_check" CHECK (CASE "invoices"."buyer_kind"
        WHEN 'consumer' THEN "invoices"."buyer_name" IS NULL AND "invoices"."buyer_tax_code" IS NULL
        WHEN 'company' THEN "invoices"."buyer_name" IS NOT NULL AND "invoices"."buyer_address" IS NOT NULL
          AND "invoices"."buyer_tax_code" ~ '^[0-9]{10}(-[0-9]{3})?$'
        ELSE "invoices"."buyer_name" IS NOT NULL
          AND ("invoices"."buyer_tax_code" IS NULL OR "invoices"."buyer_tax_code" ~ '^([0-9]{10}|[0-9]{12})$')
      END);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_attempts_check" CHECK ("invoices"."attempts" >= 0);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_void_check" CHECK ("invoices"."state" <> 'voided' OR "invoices"."void_reason" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_amount_check" CHECK ("invoices"."amount_sub" >= 0 AND "invoices"."amount_discount" >= 0 AND "invoices"."amount_service" >= 0
        AND "invoices"."amount_ship" >= 0 AND "invoices"."amount_vat" >= 0 AND "invoices"."amount_total" >= 0);--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_vat_code_check" CHECK ("order_lines"."vat_code" IN ('standard','alcohol'));--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_invoice_buyer_check" CHECK ("orders"."invoice_buyer" IS NULL OR (jsonb_typeof("orders"."invoice_buyer") = 'object'
          AND "orders"."invoice_buyer"->>'kind' IN ('company','person')
          AND coalesce("orders"."invoice_buyer"->>'name', '') <> ''));