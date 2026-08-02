CREATE TABLE "assets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "assets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"cost_vnd" bigint NOT NULL,
	"in_service_from" date NOT NULL,
	"depreciation_months" integer NOT NULL,
	"retired_on" date,
	"note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assets_cost_check" CHECK ("assets"."cost_vnd" > 0),
	CONSTRAINT "assets_months_check" CHECK ("assets"."depreciation_months" BETWEEN 1 AND 600)
);
--> statement-breakpoint
CREATE TABLE "expense_budgets" (
	"branch_id" text NOT NULL,
	"category_id" text NOT NULL,
	"month" date NOT NULL,
	"amount_vnd" bigint NOT NULL,
	CONSTRAINT "expense_budgets_branch_id_category_id_month_pk" PRIMARY KEY("branch_id","category_id","month"),
	CONSTRAINT "expense_budgets_amount_check" CHECK ("expense_budgets"."amount_vnd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "expense_categories" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"name" text NOT NULL,
	"pnl_line" text NOT NULL,
	"automatic" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "expense_categories_pnl_line_check" CHECK ("expense_categories"."pnl_line" IN ('cogs','labour','rent','utilities','depreciation','marketing','payment-fee','other-opex','tax'))
);
--> statement-breakpoint
CREATE TABLE "expense_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expense_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"category_id" text NOT NULL,
	"month" date NOT NULL,
	"amount_vnd" bigint NOT NULL,
	"source" text NOT NULL,
	"voucher_id" bigint,
	"asset_id" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_entries_source_check" CHECK ("expense_entries"."source" IN ('voucher','depreciation')),
	CONSTRAINT "expense_entries_amount_check" CHECK ("expense_entries"."amount_vnd" > 0),
	CONSTRAINT "expense_entries_source_link" CHECK (("expense_entries"."source" = 'voucher' AND "expense_entries"."voucher_id" IS NOT NULL)
       OR ("expense_entries"."source" = 'depreciation' AND "expense_entries"."asset_id" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "expense_vouchers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "expense_vouchers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"category_id" text NOT NULL,
	"kind" text DEFAULT 'expense' NOT NULL,
	"supplier" text,
	"memo" text,
	"amount_vnd" bigint NOT NULL,
	"vat_vnd" bigint DEFAULT 0 NOT NULL,
	"method" text NOT NULL,
	"amortize_months" integer DEFAULT 1 NOT NULL,
	"amortize_from" date NOT NULL,
	"advance_employee_id" bigint,
	"settled_period_id" bigint,
	"state" text DEFAULT 'draft' NOT NULL,
	"recurring_id" bigint,
	"asset_id" bigint,
	"paid_on" date NOT NULL,
	"created_by" bigint,
	"approved_by" bigint,
	"approved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "expense_vouchers_kind_check" CHECK ("expense_vouchers"."kind" IN ('expense','advance')),
	CONSTRAINT "expense_vouchers_method_check" CHECK ("expense_vouchers"."method" IN ('cash','transfer')),
	CONSTRAINT "expense_vouchers_state_check" CHECK ("expense_vouchers"."state" IN ('draft','approved','void')),
	CONSTRAINT "expense_vouchers_amount_check" CHECK ("expense_vouchers"."amount_vnd" > 0),
	CONSTRAINT "expense_vouchers_vat_check" CHECK ("expense_vouchers"."vat_vnd" >= 0 AND "expense_vouchers"."vat_vnd" <= "expense_vouchers"."amount_vnd"),
	CONSTRAINT "expense_vouchers_amortize_check" CHECK ("expense_vouchers"."amortize_months" BETWEEN 1 AND 60),
	CONSTRAINT "expense_vouchers_advance_check" CHECK ("expense_vouchers"."kind" <> 'advance'
       OR ("expense_vouchers"."advance_employee_id" IS NOT NULL AND "expense_vouchers"."amortize_months" = 1)),
	CONSTRAINT "expense_vouchers_approved_check" CHECK (("expense_vouchers"."state" = 'approved') = ("expense_vouchers"."approved_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "recurring_expenses" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "recurring_expenses_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"category_id" text NOT NULL,
	"name" text NOT NULL,
	"supplier" text,
	"expected_vnd" bigint NOT NULL,
	"day_of_month" integer NOT NULL,
	"method" text DEFAULT 'transfer' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "recurring_expenses_day_check" CHECK ("recurring_expenses"."day_of_month" BETWEEN 1 AND 28),
	CONSTRAINT "recurring_expenses_amount_check" CHECK ("recurring_expenses"."expected_vnd" > 0),
	CONSTRAINT "recurring_expenses_method_check" CHECK ("recurring_expenses"."method" IN ('cash','transfer'))
);
--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assets" ADD CONSTRAINT "assets_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_budgets" ADD CONSTRAINT "expense_budgets_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_entries" ADD CONSTRAINT "expense_entries_voucher_id_expense_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."expense_vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_vouchers" ADD CONSTRAINT "expense_vouchers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_vouchers" ADD CONSTRAINT "expense_vouchers_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_vouchers" ADD CONSTRAINT "expense_vouchers_advance_employee_id_employees_id_fk" FOREIGN KEY ("advance_employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_vouchers" ADD CONSTRAINT "expense_vouchers_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "expense_vouchers" ADD CONSTRAINT "expense_vouchers_approved_by_staff_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurring_expenses" ADD CONSTRAINT "recurring_expenses_category_id_expense_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."expense_categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "assets_branch_idx" ON "assets" USING btree ("branch_id","in_service_from");--> statement-breakpoint
CREATE INDEX "expense_categories_parent_idx" ON "expense_categories" USING btree ("parent_id","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "expense_entries_one_depreciation_per_month" ON "expense_entries" USING btree ("asset_id","month") WHERE source = 'depreciation';--> statement-breakpoint
CREATE INDEX "expense_entries_branch_month_idx" ON "expense_entries" USING btree ("branch_id","month");--> statement-breakpoint
CREATE INDEX "expense_entries_voucher_idx" ON "expense_entries" USING btree ("voucher_id");--> statement-breakpoint
CREATE INDEX "expense_vouchers_branch_date_idx" ON "expense_vouchers" USING btree ("branch_id","paid_on");--> statement-breakpoint
CREATE INDEX "expense_vouchers_category_idx" ON "expense_vouchers" USING btree ("category_id","paid_on");--> statement-breakpoint
CREATE INDEX "recurring_expenses_branch_idx" ON "recurring_expenses" USING btree ("branch_id","active");