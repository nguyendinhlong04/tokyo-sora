CREATE TABLE "production_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "production_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"run_id" bigint NOT NULL,
	"ingredient_id" text NOT NULL,
	"direction" text NOT NULL,
	"qty_base" bigint NOT NULL,
	"cost_share_bp" integer,
	"lot_id" bigint,
	CONSTRAINT "production_lines_direction_check" CHECK ("production_lines"."direction" IN ('in','out')),
	CONSTRAINT "production_lines_qty_check" CHECK ("production_lines"."qty_base" > 0),
	CONSTRAINT "production_lines_share_check" CHECK (("production_lines"."direction" = 'out' AND "production_lines"."cost_share_bp" BETWEEN 0 AND 10000)
       OR ("production_lines"."direction" = 'in' AND "production_lines"."cost_share_bp" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "production_runs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "production_runs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"actor_id" bigint,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "production_runs_kind_check" CHECK ("production_runs"."kind" IN ('pha-che','pha-loc','duc-keg'))
);
--> statement-breakpoint
CREATE TABLE "purchase_order_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_order_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty_purchase" integer NOT NULL,
	"price_vnd" bigint NOT NULL,
	"received_purchase" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "purchase_order_lines_qty_check" CHECK ("purchase_order_lines"."qty_purchase" > 0),
	CONSTRAINT "purchase_order_lines_price_check" CHECK ("purchase_order_lines"."price_vnd" >= 0),
	CONSTRAINT "purchase_order_lines_received_check" CHECK ("purchase_order_lines"."received_purchase" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_orders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "purchase_orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"display_code" text NOT NULL,
	"branch_id" text NOT NULL,
	"supplier_id" bigint NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"expected_on" date,
	"note" text,
	"created_by" bigint,
	"sent_at" timestamp with time zone,
	"closed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_orders_display_code_unique" UNIQUE("display_code"),
	CONSTRAINT "purchase_orders_state_check" CHECK ("purchase_orders"."state" IN ('draft','sent','received','cancelled')),
	CONSTRAINT "purchase_orders_sent_check" CHECK ("purchase_orders"."state" = 'draft' OR "purchase_orders"."state" = 'cancelled' OR "purchase_orders"."sent_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "stock_count_lines" (
	"count_id" bigint NOT NULL,
	"ingredient_id" text NOT NULL,
	"snapshot_base" bigint NOT NULL,
	"counted_base" bigint,
	"note" text,
	"counted_at" timestamp with time zone,
	CONSTRAINT "stock_count_lines_count_id_ingredient_id_pk" PRIMARY KEY("count_id","ingredient_id"),
	CONSTRAINT "stock_count_lines_counted_check" CHECK ("stock_count_lines"."counted_base" IS NULL OR "stock_count_lines"."counted_base" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_counts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_counts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"group_name" text,
	"state" text DEFAULT 'counting' NOT NULL,
	"note" text,
	"opened_by" bigint,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" bigint,
	"closed_at" timestamp with time zone,
	"business_date" date NOT NULL,
	CONSTRAINT "stock_counts_state_check" CHECK ("stock_counts"."state" IN ('counting','closed','cancelled')),
	CONSTRAINT "stock_counts_closed_check" CHECK (("stock_counts"."state" = 'closed') = ("stock_counts"."closed_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "stock_lots" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_lots_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"lot_code" text NOT NULL,
	"received_on" date NOT NULL,
	"expires_on" date,
	"qty_in_base" bigint NOT NULL,
	"qty_remain_base" bigint NOT NULL,
	"unit_cost_milli" bigint DEFAULT 0 NOT NULL,
	"state" text DEFAULT 'sealed' NOT NULL,
	"opened_at" timestamp with time zone,
	"parent_lot_id" bigint,
	"receive_temp_deci_c" integer,
	"supplier_id" bigint,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_lots_state_check" CHECK ("stock_lots"."state" IN ('sealed','open')),
	CONSTRAINT "stock_lots_qty_check" CHECK ("stock_lots"."qty_in_base" > 0 AND "stock_lots"."qty_remain_base" >= 0),
	CONSTRAINT "stock_lots_remain_check" CHECK ("stock_lots"."qty_remain_base" <= "stock_lots"."qty_in_base"),
	CONSTRAINT "stock_lots_open_check" CHECK ("stock_lots"."state" <> 'open' OR "stock_lots"."opened_at" IS NOT NULL),
	CONSTRAINT "stock_lots_temp_check" CHECK ("stock_lots"."receive_temp_deci_c" IS NULL OR "stock_lots"."receive_temp_deci_c" BETWEEN -400 AND 600)
);
--> statement-breakpoint
CREATE TABLE "stock_transfer_lines" (
	"transfer_id" bigint NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty_base" bigint NOT NULL,
	"received_base" bigint,
	CONSTRAINT "stock_transfer_lines_transfer_id_ingredient_id_pk" PRIMARY KEY("transfer_id","ingredient_id"),
	CONSTRAINT "stock_transfer_lines_qty_check" CHECK ("stock_transfer_lines"."qty_base" > 0),
	CONSTRAINT "stock_transfer_lines_received_check" CHECK ("stock_transfer_lines"."received_base" IS NULL OR "stock_transfer_lines"."received_base" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_transfers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_transfers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"display_code" text NOT NULL,
	"from_branch_id" text NOT NULL,
	"to_branch_id" text NOT NULL,
	"state" text DEFAULT 'sent' NOT NULL,
	"note" text,
	"sent_by" bigint,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	"received_by" bigint,
	"received_at" timestamp with time zone,
	"business_date" date NOT NULL,
	CONSTRAINT "stock_transfers_display_code_unique" UNIQUE("display_code"),
	CONSTRAINT "stock_transfers_state_check" CHECK ("stock_transfers"."state" IN ('sent','received','rejected')),
	CONSTRAINT "stock_transfers_two_branches" CHECK ("stock_transfers"."from_branch_id" <> "stock_transfers"."to_branch_id"),
	CONSTRAINT "stock_transfers_received_check" CHECK (("stock_transfers"."state" = 'received') = ("stock_transfers"."received_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "supplier_items" (
	"supplier_id" bigint NOT NULL,
	"ingredient_id" text NOT NULL,
	"price_vnd" bigint NOT NULL,
	"min_order_purchase" integer DEFAULT 1 NOT NULL,
	"lead_time_days" integer DEFAULT 1 NOT NULL,
	"preferred" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "supplier_items_supplier_id_ingredient_id_pk" PRIMARY KEY("supplier_id","ingredient_id"),
	CONSTRAINT "supplier_items_price_check" CHECK ("supplier_items"."price_vnd" > 0),
	CONSTRAINT "supplier_items_min_check" CHECK ("supplier_items"."min_order_purchase" > 0),
	CONSTRAINT "supplier_items_lead_check" CHECK ("supplier_items"."lead_time_days" BETWEEN 0 AND 90)
);
--> statement-breakpoint
CREATE TABLE "suppliers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "suppliers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tax_code" text,
	"contact_name" text,
	"phone" text,
	"email" text,
	"address" text,
	"payment_term_days" integer DEFAULT 0 NOT NULL,
	"cutoff_minute" integer,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "suppliers_code_unique" UNIQUE("code"),
	CONSTRAINT "suppliers_term_check" CHECK ("suppliers"."payment_term_days" BETWEEN 0 AND 180),
	CONSTRAINT "suppliers_cutoff_check" CHECK ("suppliers"."cutoff_minute" IS NULL OR "suppliers"."cutoff_minute" BETWEEN 0 AND 1439),
	CONSTRAINT "suppliers_tax_code_check" CHECK ("suppliers"."tax_code" IS NULL OR "suppliers"."tax_code" ~ '^[0-9]{10}(-[0-9]{3})?$')
);
--> statement-breakpoint
ALTER TABLE "stock_moves" DROP CONSTRAINT "stock_moves_adjust_needs_note";--> statement-breakpoint
ALTER TABLE "stock_moves" DROP CONSTRAINT "stock_moves_kind_check";--> statement-breakpoint
ALTER TABLE "stock_moves" DROP CONSTRAINT "stock_moves_sign_check";--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "open_shelf_life_days" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "is_semi_finished" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "lot_id" bigint;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "doc_kind" text;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD COLUMN "doc_id" bigint;--> statement-breakpoint
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_run_id_production_runs_id_fk" FOREIGN KEY ("run_id") REFERENCES "public"."production_runs"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_lines" ADD CONSTRAINT "production_lines_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "production_runs" ADD CONSTRAINT "production_runs_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_purchase_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."purchase_orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_count_id_stock_counts_id_fk" FOREIGN KEY ("count_id") REFERENCES "public"."stock_counts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_count_lines" ADD CONSTRAINT "stock_count_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_opened_by_staff_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_counts" ADD CONSTRAINT "stock_counts_closed_by_staff_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_lots" ADD CONSTRAINT "stock_lots_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_transfer_id_stock_transfers_id_fk" FOREIGN KEY ("transfer_id") REFERENCES "public"."stock_transfers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfer_lines" ADD CONSTRAINT "stock_transfer_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_from_branch_id_branches_id_fk" FOREIGN KEY ("from_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_to_branch_id_branches_id_fk" FOREIGN KEY ("to_branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_sent_by_staff_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_transfers" ADD CONSTRAINT "stock_transfers_received_by_staff_id_fk" FOREIGN KEY ("received_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_supplier_id_suppliers_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."suppliers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "supplier_items" ADD CONSTRAINT "supplier_items_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "production_lines_run_idx" ON "production_lines" USING btree ("run_id","direction");--> statement-breakpoint
CREATE INDEX "production_runs_branch_idx" ON "production_runs" USING btree ("branch_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_lines_one_per_item" ON "purchase_order_lines" USING btree ("order_id","ingredient_id");--> statement-breakpoint
CREATE INDEX "purchase_orders_branch_idx" ON "purchase_orders" USING btree ("branch_id","state","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_counts_one_open" ON "stock_counts" USING btree ("branch_id") WHERE state = 'counting';--> statement-breakpoint
CREATE INDEX "stock_counts_branch_idx" ON "stock_counts" USING btree ("branch_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_lots_code_unique" ON "stock_lots" USING btree ("branch_id","ingredient_id","lot_code");--> statement-breakpoint
CREATE INDEX "stock_lots_fefo_idx" ON "stock_lots" USING btree ("branch_id","ingredient_id","expires_on") WHERE qty_remain_base > 0;--> statement-breakpoint
CREATE INDEX "stock_transfers_from_idx" ON "stock_transfers" USING btree ("from_branch_id","state");--> statement-breakpoint
CREATE INDEX "stock_transfers_to_idx" ON "stock_transfers" USING btree ("to_branch_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_items_one_preferred" ON "supplier_items" USING btree ("ingredient_id") WHERE preferred;--> statement-breakpoint
CREATE INDEX "suppliers_active_idx" ON "suppliers" USING btree ("active","name");--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_lot_id_stock_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."stock_lots"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_moves_doc_idx" ON "stock_moves" USING btree ("doc_kind","doc_id");--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_open_shelf_check" CHECK ("ingredients"."open_shelf_life_days" BETWEEN 0 AND 90);--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_open_shelf_needs_lot" CHECK ("ingredients"."open_shelf_life_days" = 0 OR "ingredients"."lot_required");--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_reason_required" CHECK ("stock_moves"."kind" NOT IN ('count_adjust','write_off','internal') OR "stock_moves"."note" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_doc_check" CHECK (("stock_moves"."doc_kind" IS NULL) = ("stock_moves"."doc_id" IS NULL));--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_kind_check" CHECK ("stock_moves"."kind" IN ('receipt','sale','count_adjust','write_off','internal',
                        'transfer_out','transfer_in','produce_out','produce_in'));--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_sign_check" CHECK (("stock_moves"."kind" IN ('receipt','transfer_in','produce_in') AND "stock_moves"."qty_base" > 0)
       OR ("stock_moves"."kind" IN ('sale','write_off','internal','transfer_out','produce_out') AND "stock_moves"."qty_base" < 0)
       OR ("stock_moves"."kind" = 'count_adjust' AND "stock_moves"."qty_base" <> 0));