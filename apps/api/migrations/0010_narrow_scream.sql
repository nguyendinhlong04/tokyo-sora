CREATE TABLE "employees" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "employees_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"staff_id" bigint NOT NULL,
	"branch_id" text NOT NULL,
	"position" text NOT NULL,
	"pay_kind" text NOT NULL,
	"hourly_rate_vnd" bigint DEFAULT 0 NOT NULL,
	"monthly_salary_vnd" bigint DEFAULT 0 NOT NULL,
	"fixed_allowance_vnd" bigint DEFAULT 0 NOT NULL,
	"started_on" date NOT NULL,
	"ended_on" date,
	"bank_account" text,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "employees_staff_id_unique" UNIQUE("staff_id"),
	CONSTRAINT "employees_pay_kind_check" CHECK ("employees"."pay_kind" IN ('hourly','monthly')),
	CONSTRAINT "employees_rate_nonneg" CHECK ("employees"."hourly_rate_vnd" >= 0 AND "employees"."monthly_salary_vnd" >= 0 AND "employees"."fixed_allowance_vnd" >= 0),
	CONSTRAINT "employees_rate_required" CHECK (("employees"."pay_kind" = 'hourly' AND "employees"."hourly_rate_vnd" > 0)
       OR ("employees"."pay_kind" = 'monthly' AND "employees"."monthly_salary_vnd" > 0)),
	CONSTRAINT "employees_ended_after_started" CHECK ("employees"."ended_on" IS NULL OR "employees"."ended_on" >= "employees"."started_on")
);
--> statement-breakpoint
CREATE TABLE "payroll_lines" (
	"period_id" bigint NOT NULL,
	"employee_id" bigint NOT NULL,
	"name_snapshot" text NOT NULL,
	"position_snapshot" text NOT NULL,
	"pay_kind" text NOT NULL,
	"rate_snapshot_vnd" bigint NOT NULL,
	"worked_minutes" integer DEFAULT 0 NOT NULL,
	"ot_normal_minutes" integer DEFAULT 0 NOT NULL,
	"ot_rest_minutes" integer DEFAULT 0 NOT NULL,
	"ot_holiday_minutes" integer DEFAULT 0 NOT NULL,
	"base_pay_vnd" bigint DEFAULT 0 NOT NULL,
	"overtime_pay_vnd" bigint DEFAULT 0 NOT NULL,
	"allowance_vnd" bigint DEFAULT 0 NOT NULL,
	"bonus_vnd" bigint DEFAULT 0 NOT NULL,
	"gross_pay_vnd" bigint DEFAULT 0 NOT NULL,
	"insurance_vnd" bigint DEFAULT 0 NOT NULL,
	"tax_vnd" bigint DEFAULT 0 NOT NULL,
	"advance_vnd" bigint DEFAULT 0 NOT NULL,
	"net_pay_vnd" bigint DEFAULT 0 NOT NULL,
	"note" text,
	CONSTRAINT "payroll_lines_nonneg" CHECK ("payroll_lines"."base_pay_vnd" >= 0 AND "payroll_lines"."overtime_pay_vnd" >= 0 AND "payroll_lines"."allowance_vnd" >= 0
      AND "payroll_lines"."bonus_vnd" >= 0 AND "payroll_lines"."insurance_vnd" >= 0 AND "payroll_lines"."tax_vnd" >= 0
      AND "payroll_lines"."advance_vnd" >= 0),
	CONSTRAINT "payroll_lines_minutes_nonneg" CHECK ("payroll_lines"."worked_minutes" >= 0 AND "payroll_lines"."ot_normal_minutes" >= 0
      AND "payroll_lines"."ot_rest_minutes" >= 0 AND "payroll_lines"."ot_holiday_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "payroll_periods" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payroll_periods_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" bigint,
	"submitted_at" timestamp with time zone,
	"submitted_by" bigint,
	"checked_at" timestamp with time zone,
	"checked_by" bigint,
	"approved_at" timestamp with time zone,
	"approved_by" bigint,
	"paid_at" timestamp with time zone,
	"rates" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_periods_state_check" CHECK ("payroll_periods"."state" IN ('draft','locked','submitted','checked','approved','paid')),
	CONSTRAINT "payroll_periods_range_check" CHECK ("payroll_periods"."period_end" >= "payroll_periods"."period_start"),
	CONSTRAINT "payroll_periods_order_check" CHECK (("payroll_periods"."state" = 'draft')
       OR ("payroll_periods"."state" = 'locked'    AND "payroll_periods"."locked_at" IS NOT NULL)
       OR ("payroll_periods"."state" = 'submitted' AND "payroll_periods"."locked_at" IS NOT NULL AND "payroll_periods"."submitted_at" IS NOT NULL)
       OR ("payroll_periods"."state" = 'checked'   AND "payroll_periods"."submitted_at" IS NOT NULL AND "payroll_periods"."checked_at" IS NOT NULL)
       OR ("payroll_periods"."state" = 'approved'  AND "payroll_periods"."checked_at" IS NOT NULL AND "payroll_periods"."approved_at" IS NOT NULL)
       OR ("payroll_periods"."state" = 'paid'      AND "payroll_periods"."approved_at" IS NOT NULL AND "payroll_periods"."paid_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "schedule_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "schedule_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"employee_id" bigint NOT NULL,
	"work_date" date NOT NULL,
	"template_id" bigint,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"day_kind" text DEFAULT 'thuong' NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"note" text,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "schedule_entries_range_check" CHECK ("schedule_entries"."end_minute" > "schedule_entries"."start_minute"),
	CONSTRAINT "schedule_entries_break_check" CHECK ("schedule_entries"."break_minutes" >= 0 AND "schedule_entries"."break_minutes" < "schedule_entries"."end_minute" - "schedule_entries"."start_minute"),
	CONSTRAINT "schedule_entries_state_check" CHECK ("schedule_entries"."state" IN ('draft','published')),
	CONSTRAINT "schedule_entries_day_kind_check" CHECK ("schedule_entries"."day_kind" IN ('thuong','nghi','le')),
	CONSTRAINT "schedule_entries_published_at_check" CHECK (("schedule_entries"."state" = 'draft' AND "schedule_entries"."published_at" IS NULL)
       OR ("schedule_entries"."state" = 'published' AND "schedule_entries"."published_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "shift_templates" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shift_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "shift_templates_range_check" CHECK ("shift_templates"."end_minute" > "shift_templates"."start_minute"),
	CONSTRAINT "shift_templates_break_check" CHECK ("shift_templates"."break_minutes" >= 0 AND "shift_templates"."break_minutes" < "shift_templates"."end_minute" - "shift_templates"."start_minute")
);
--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_period_id_payroll_periods_id_fk" FOREIGN KEY ("period_id") REFERENCES "public"."payroll_periods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_lines" ADD CONSTRAINT "payroll_lines_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_locked_by_staff_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_submitted_by_staff_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_checked_by_staff_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_approved_by_staff_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schedule_entries" ADD CONSTRAINT "schedule_entries_template_id_shift_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_templates" ADD CONSTRAINT "shift_templates_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "employees_branch_idx" ON "employees" USING btree ("branch_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_lines_one_per_employee" ON "payroll_lines" USING btree ("period_id","employee_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payroll_periods_one_per_range" ON "payroll_periods" USING btree ("branch_id","period_start","period_end");--> statement-breakpoint
CREATE UNIQUE INDEX "schedule_entries_one_per_day" ON "schedule_entries" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "schedule_entries_grid_idx" ON "schedule_entries" USING btree ("branch_id","work_date");--> statement-breakpoint
CREATE INDEX "shift_templates_branch_idx" ON "shift_templates" USING btree ("branch_id","sort");