CREATE TABLE "prep_recipe_lines" (
	"prep_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty_base" bigint NOT NULL,
	"waste_bp" integer DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "prep_recipe_lines_prep_id_ingredient_id_pk" PRIMARY KEY("prep_id","ingredient_id"),
	CONSTRAINT "prep_recipe_lines_qty_check" CHECK ("prep_recipe_lines"."qty_base" > 0),
	CONSTRAINT "prep_recipe_lines_waste_check" CHECK ("prep_recipe_lines"."waste_bp" >= 0 AND "prep_recipe_lines"."waste_bp" <= 10000),
	CONSTRAINT "prep_recipe_lines_not_self" CHECK ("prep_recipe_lines"."prep_id" <> "prep_recipe_lines"."ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "recipe_versions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recipe_versions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"version" integer NOT NULL,
	"lines" jsonb NOT NULL,
	"yield_base" bigint,
	"cost_vnd" bigint NOT NULL,
	"actor_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_versions_kind_check" CHECK ("recipe_versions"."subject_kind" IN ('dish','prep')),
	CONSTRAINT "recipe_versions_version_check" CHECK ("recipe_versions"."version" > 0),
	CONSTRAINT "recipe_versions_yield_check" CHECK (("recipe_versions"."subject_kind" = 'prep') = ("recipe_versions"."yield_base" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "corporate_charges" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "corporate_charges_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"corporate_id" bigint NOT NULL,
	"branch_id" text NOT NULL,
	"order_id" bigint NOT NULL,
	"amount_vnd" bigint NOT NULL,
	"charged_on" date NOT NULL,
	"due_on" date NOT NULL,
	"signer" text,
	"approval_id" bigint,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corporate_charges_amount_check" CHECK ("corporate_charges"."amount_vnd" > 0),
	CONSTRAINT "corporate_charges_due_check" CHECK ("corporate_charges"."due_on" >= "corporate_charges"."charged_on")
);
--> statement-breakpoint
CREATE TABLE "corporate_customers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "corporate_customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"tax_code" text NOT NULL,
	"contact_name" text,
	"contact_phone" text,
	"contact_email" text,
	"address" text,
	"credit_limit_vnd" bigint NOT NULL,
	"payment_term_days" smallint DEFAULT 30 NOT NULL,
	"reconcile_day" smallint DEFAULT 1 NOT NULL,
	"block_after_overdue_days" smallint,
	"einvoice_mode" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corporate_customers_code_unique" UNIQUE("code"),
	CONSTRAINT "corporate_customers_tax_code_check" CHECK ("corporate_customers"."tax_code" ~ '^[0-9]{10}(-[0-9]{3})?$'),
	CONSTRAINT "corporate_customers_limit_check" CHECK ("corporate_customers"."credit_limit_vnd" >= 0),
	CONSTRAINT "corporate_customers_term_check" CHECK ("corporate_customers"."payment_term_days" BETWEEN 0 AND 180),
	CONSTRAINT "corporate_customers_reconcile_check" CHECK ("corporate_customers"."reconcile_day" BETWEEN 1 AND 28),
	CONSTRAINT "corporate_customers_block_days_check" CHECK ("corporate_customers"."block_after_overdue_days" IS NULL OR "corporate_customers"."block_after_overdue_days" BETWEEN 0 AND 365),
	CONSTRAINT "corporate_customers_einvoice_mode_check" CHECK ("corporate_customers"."einvoice_mode" IS NULL OR "corporate_customers"."einvoice_mode" IN ('per-bill','aggregate'))
);
--> statement-breakpoint
CREATE TABLE "corporate_settlements" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "corporate_settlements_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"charge_id" bigint NOT NULL,
	"kind" text DEFAULT 'payment' NOT NULL,
	"amount_vnd" bigint NOT NULL,
	"paid_on" date NOT NULL,
	"payment_id" bigint,
	"note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "corporate_settlements_kind_check" CHECK ("corporate_settlements"."kind" IN ('payment','write-off')),
	CONSTRAINT "corporate_settlements_amount_check" CHECK ("corporate_settlements"."amount_vnd" > 0),
	CONSTRAINT "corporate_settlements_writeoff_reason" CHECK ("corporate_settlements"."kind" <> 'write-off' OR "corporate_settlements"."note" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "customers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "customers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"phone" text NOT NULL,
	"name" text,
	"allergies" text,
	"note" text,
	"first_seen_on" date NOT NULL,
	"last_seen_on" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customers_phone_unique" UNIQUE("phone"),
	CONSTRAINT "customers_phone_check" CHECK ("customers"."phone" ~ '^[0-9]{8,15}$'),
	CONSTRAINT "customers_seen_check" CHECK ("customers"."last_seen_on" >= "customers"."first_seen_on")
);
--> statement-breakpoint
CREATE TABLE "feedback" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "feedback_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"order_id" bigint NOT NULL,
	"customer_id" bigint,
	"stars" smallint NOT NULL,
	"comment" text,
	"source" text NOT NULL,
	"shift_id" bigint,
	"state" text DEFAULT 'new' NOT NULL,
	"assigned_to" bigint,
	"due_at" timestamp with time zone,
	"resolution" text,
	"resolved_by" bigint,
	"resolved_at" timestamp with time zone,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_stars_check" CHECK ("feedback"."stars" BETWEEN 1 AND 5),
	CONSTRAINT "feedback_source_check" CHECK ("feedback"."source" IN ('table','online')),
	CONSTRAINT "feedback_state_check" CHECK ("feedback"."state" IN ('new','assigned','resolved')),
	CONSTRAINT "feedback_assigned_check" CHECK ("feedback"."state" <> 'assigned' OR "feedback"."assigned_to" IS NOT NULL),
	CONSTRAINT "feedback_resolved_check" CHECK ("feedback"."state" <> 'resolved'
       OR ("feedback"."resolution" IS NOT NULL AND "feedback"."resolved_at" IS NOT NULL AND "feedback"."resolved_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "loyalty_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "loyalty_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"customer_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"points" integer NOT NULL,
	"order_id" bigint,
	"branch_id" text,
	"base_vnd" bigint,
	"reason" text,
	"staff_id" bigint,
	"approval_id" bigint,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "loyalty_entries_kind_check" CHECK ("loyalty_entries"."kind" IN ('earn','redeem','reclaim','adjust','expire')),
	CONSTRAINT "loyalty_entries_points_check" CHECK ("loyalty_entries"."points" <> 0),
	CONSTRAINT "loyalty_entries_shape_check" CHECK (("loyalty_entries"."kind" = 'earn'    AND "loyalty_entries"."points" > 0 AND "loyalty_entries"."order_id" IS NOT NULL)
       OR ("loyalty_entries"."kind" = 'redeem'  AND "loyalty_entries"."points" < 0 AND "loyalty_entries"."order_id" IS NOT NULL)
       OR ("loyalty_entries"."kind" = 'reclaim' AND "loyalty_entries"."points" < 0 AND "loyalty_entries"."order_id" IS NOT NULL)
       OR ("loyalty_entries"."kind" = 'expire'  AND "loyalty_entries"."points" < 0)
       OR ("loyalty_entries"."kind" = 'adjust'  AND "loyalty_entries"."reason" IS NOT NULL AND "loyalty_entries"."staff_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "promotion_redemptions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "promotion_redemptions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"promotion_id" bigint NOT NULL,
	"voucher_code_id" bigint,
	"branch_id" text NOT NULL,
	"order_id" bigint NOT NULL,
	"discount_vnd" bigint NOT NULL,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotion_redemptions_amount_check" CHECK ("promotion_redemptions"."discount_vnd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "promotions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "promotions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"percent_bp" integer,
	"amount_vnd" bigint,
	"target_dish_id" text,
	"set_price_vnd" bigint,
	"max_discount_vnd" bigint,
	"channels" text[] DEFAULT '{}'::text[] NOT NULL,
	"branch_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"weekdays" smallint[] DEFAULT '{}'::smallint[] NOT NULL,
	"from_minute" integer,
	"to_minute" integer,
	"min_order_vnd" bigint DEFAULT 0 NOT NULL,
	"requires_voucher" boolean DEFAULT false NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"approval_id" bigint,
	"activated_at" timestamp with time zone,
	"activated_by" bigint,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "promotions_code_unique" UNIQUE("code"),
	CONSTRAINT "promotions_kind_check" CHECK ("promotions"."kind" IN ('percent','amount','free_dish','set_price')),
	CONSTRAINT "promotions_state_check" CHECK ("promotions"."state" IN ('draft','active','paused','ended')),
	CONSTRAINT "promotions_value_check" CHECK (("promotions"."kind" = 'percent'   AND "promotions"."percent_bp" BETWEEN 1 AND 10000
                                   AND "promotions"."amount_vnd" IS NULL AND "promotions"."set_price_vnd" IS NULL)
       OR ("promotions"."kind" = 'amount'    AND "promotions"."amount_vnd" > 0
                                   AND "promotions"."percent_bp" IS NULL AND "promotions"."set_price_vnd" IS NULL)
       OR ("promotions"."kind" = 'free_dish' AND "promotions"."target_dish_id" IS NOT NULL
                                   AND "promotions"."percent_bp" IS NULL AND "promotions"."amount_vnd" IS NULL
                                   AND "promotions"."set_price_vnd" IS NULL)
       OR ("promotions"."kind" = 'set_price' AND "promotions"."target_dish_id" IS NOT NULL AND "promotions"."set_price_vnd" >= 0
                                   AND "promotions"."percent_bp" IS NULL AND "promotions"."amount_vnd" IS NULL)),
	CONSTRAINT "promotions_window_check" CHECK ("promotions"."ends_on" >= "promotions"."starts_on"),
	CONSTRAINT "promotions_hour_check" CHECK (("promotions"."from_minute" IS NULL AND "promotions"."to_minute" IS NULL)
       OR ("promotions"."from_minute" BETWEEN 0 AND 1439 AND "promotions"."to_minute" BETWEEN 1 AND 1440
           AND "promotions"."to_minute" > "promotions"."from_minute")),
	CONSTRAINT "promotions_min_order_check" CHECK ("promotions"."min_order_vnd" >= 0),
	CONSTRAINT "promotions_max_discount_check" CHECK ("promotions"."max_discount_vnd" IS NULL OR "promotions"."max_discount_vnd" > 0),
	CONSTRAINT "promotions_activated_check" CHECK ("promotions"."state" <> 'active' OR ("promotions"."activated_at" IS NOT NULL AND "promotions"."activated_by" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "voucher_codes" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "voucher_codes_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"promotion_id" bigint NOT NULL,
	"code" text NOT NULL,
	"max_uses" integer DEFAULT 1 NOT NULL,
	"used_count" integer DEFAULT 0 NOT NULL,
	"expires_on" date,
	"state" text DEFAULT 'live' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "voucher_codes_code_unique" UNIQUE("code"),
	CONSTRAINT "voucher_codes_state_check" CHECK ("voucher_codes"."state" IN ('live','void')),
	CONSTRAINT "voucher_codes_max_uses_check" CHECK ("voucher_codes"."max_uses" >= 1),
	CONSTRAINT "voucher_codes_used_check" CHECK ("voucher_codes"."used_count" >= 0 AND "voucher_codes"."used_count" <= "voucher_codes"."max_uses")
);
--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "online_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "categories" ADD COLUMN "table_visible" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "sale_from" date;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "sale_to" date;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "sale_days" integer DEFAULT 127 NOT NULL;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "sale_start_minute" integer;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "sale_end_minute" integer;--> statement-breakpoint
ALTER TABLE "ingredients" ADD COLUMN "prep_yield_base" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "prep_recipe_lines" ADD CONSTRAINT "prep_recipe_lines_prep_id_ingredients_id_fk" FOREIGN KEY ("prep_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "prep_recipe_lines" ADD CONSTRAINT "prep_recipe_lines_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_versions" ADD CONSTRAINT "recipe_versions_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_charges" ADD CONSTRAINT "corporate_charges_corporate_id_corporate_customers_id_fk" FOREIGN KEY ("corporate_id") REFERENCES "public"."corporate_customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_charges" ADD CONSTRAINT "corporate_charges_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_charges" ADD CONSTRAINT "corporate_charges_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_charges" ADD CONSTRAINT "corporate_charges_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_charges" ADD CONSTRAINT "corporate_charges_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_customers" ADD CONSTRAINT "corporate_customers_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_settlements" ADD CONSTRAINT "corporate_settlements_charge_id_corporate_charges_id_fk" FOREIGN KEY ("charge_id") REFERENCES "public"."corporate_charges"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_settlements" ADD CONSTRAINT "corporate_settlements_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "corporate_settlements" ADD CONSTRAINT "corporate_settlements_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_assigned_to_staff_id_fk" FOREIGN KEY ("assigned_to") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_resolved_by_staff_id_fk" FOREIGN KEY ("resolved_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "loyalty_entries" ADD CONSTRAINT "loyalty_entries_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_voucher_code_id_voucher_codes_id_fk" FOREIGN KEY ("voucher_code_id") REFERENCES "public"."voucher_codes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotion_redemptions" ADD CONSTRAINT "promotion_redemptions_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_target_dish_id_dishes_id_fk" FOREIGN KEY ("target_dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_activated_by_staff_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "promotions" ADD CONSTRAINT "promotions_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "voucher_codes" ADD CONSTRAINT "voucher_codes_promotion_id_promotions_id_fk" FOREIGN KEY ("promotion_id") REFERENCES "public"."promotions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "prep_recipe_lines_ingredient_idx" ON "prep_recipe_lines" USING btree ("ingredient_id");--> statement-breakpoint
CREATE UNIQUE INDEX "recipe_versions_one_per_version" ON "recipe_versions" USING btree ("subject_kind","subject_id","version");--> statement-breakpoint
CREATE INDEX "recipe_versions_recent_idx" ON "recipe_versions" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "corporate_charges_one_per_order" ON "corporate_charges" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "corporate_charges_aging_idx" ON "corporate_charges" USING btree ("corporate_id","due_on");--> statement-breakpoint
CREATE INDEX "corporate_charges_branch_date_idx" ON "corporate_charges" USING btree ("branch_id","charged_on");--> statement-breakpoint
CREATE INDEX "corporate_settlements_charge_idx" ON "corporate_settlements" USING btree ("charge_id");--> statement-breakpoint
CREATE INDEX "corporate_settlements_date_idx" ON "corporate_settlements" USING btree ("paid_on");--> statement-breakpoint
CREATE INDEX "customers_last_seen_idx" ON "customers" USING btree ("last_seen_on");--> statement-breakpoint
CREATE UNIQUE INDEX "feedback_one_per_order" ON "feedback" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "feedback_branch_date_idx" ON "feedback" USING btree ("branch_id","business_date");--> statement-breakpoint
CREATE INDEX "feedback_queue_idx" ON "feedback" USING btree ("branch_id","state") WHERE state <> 'resolved';--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_entries_one_earn_per_order" ON "loyalty_entries" USING btree ("order_id") WHERE kind = 'earn';--> statement-breakpoint
CREATE UNIQUE INDEX "loyalty_entries_one_reclaim_per_order" ON "loyalty_entries" USING btree ("order_id") WHERE kind = 'reclaim';--> statement-breakpoint
CREATE INDEX "loyalty_entries_customer_idx" ON "loyalty_entries" USING btree ("customer_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "promotion_redemptions_one_per_order" ON "promotion_redemptions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "promotion_redemptions_promo_date_idx" ON "promotion_redemptions" USING btree ("promotion_id","business_date");--> statement-breakpoint
CREATE INDEX "promotion_redemptions_branch_date_idx" ON "promotion_redemptions" USING btree ("branch_id","business_date");--> statement-breakpoint
CREATE INDEX "promotions_live_idx" ON "promotions" USING btree ("state","starts_on","ends_on") WHERE state = 'active';--> statement-breakpoint
CREATE INDEX "voucher_codes_promotion_idx" ON "voucher_codes" USING btree ("promotion_id");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_parent_id_categories_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "categories_parent_idx" ON "categories" USING btree ("parent_id","sort");--> statement-breakpoint
ALTER TABLE "categories" ADD CONSTRAINT "categories_not_own_parent" CHECK ("categories"."parent_id" IS NULL OR "categories"."parent_id" <> "categories"."id");--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_sale_days_check" CHECK ("dishes"."sale_days" BETWEEN 1 AND 127);--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_sale_range_check" CHECK ("dishes"."sale_from" IS NULL OR "dishes"."sale_to" IS NULL OR "dishes"."sale_to" >= "dishes"."sale_from");--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_sale_window_check" CHECK (("dishes"."sale_start_minute" IS NULL) = ("dishes"."sale_end_minute" IS NULL)
       AND ("dishes"."sale_start_minute" IS NULL
            OR ("dishes"."sale_start_minute" BETWEEN 0 AND 1439 AND "dishes"."sale_end_minute" BETWEEN 1 AND 1440
                AND "dishes"."sale_end_minute" > "dishes"."sale_start_minute")));--> statement-breakpoint
ALTER TABLE "ingredients" ADD CONSTRAINT "ingredients_prep_yield_check" CHECK ("ingredients"."prep_yield_base" >= 0 AND ("ingredients"."prep_yield_base" = 0 OR "ingredients"."is_semi_finished"));