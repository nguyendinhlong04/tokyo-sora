CREATE TABLE "kpi_cycles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kpi_cycles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"kind" text NOT NULL,
	"period_start" date NOT NULL,
	"period_end" date NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"rules" jsonb,
	"policy_url" text,
	"created_by" bigint NOT NULL,
	"opened_by" bigint,
	"opened_at" timestamp with time zone,
	"review_started_by" bigint,
	"review_started_at" timestamp with time zone,
	"closed_by" bigint,
	"closed_at" timestamp with time zone,
	"last_computed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_cycles_kind_check" CHECK ("kpi_cycles"."kind" IN ('thang','quy')),
	CONSTRAINT "kpi_cycles_state_check" CHECK ("kpi_cycles"."state" IN ('draft','open','review','closed')),
	CONSTRAINT "kpi_cycles_range_check" CHECK ("kpi_cycles"."period_end" > "kpi_cycles"."period_start"),
	CONSTRAINT "kpi_cycles_order_check" CHECK (("kpi_cycles"."state" = 'draft' OR ("kpi_cycles"."opened_at" IS NOT NULL AND "kpi_cycles"."rules" IS NOT NULL))
          AND ("kpi_cycles"."state" NOT IN ('review','closed') OR "kpi_cycles"."review_started_at" IS NOT NULL)
          AND ("kpi_cycles"."state" <> 'closed' OR ("kpi_cycles"."closed_at" IS NOT NULL AND "kpi_cycles"."closed_by" IS NOT NULL)))
);
--> statement-breakpoint
CREATE TABLE "kpi_observations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kpi_observations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"kind" text NOT NULL,
	"observed_on" date NOT NULL,
	"score_milli" integer NOT NULL,
	"evidence_url" text NOT NULL,
	"note" text,
	"observer_id" bigint NOT NULL,
	"voided_at" timestamp with time zone,
	"voided_by" bigint,
	"void_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_observations_kind_check" CHECK ("kpi_observations"."kind" IN ('ve-sinh','khach-bi-mat')),
	CONSTRAINT "kpi_observations_score_check" CHECK ("kpi_observations"."score_milli" BETWEEN 0 AND 100000),
	CONSTRAINT "kpi_observations_evidence_check" CHECK ("kpi_observations"."evidence_url" ~ '^https://'),
	CONSTRAINT "kpi_observations_void_check" CHECK (("kpi_observations"."voided_at" IS NULL) = ("kpi_observations"."voided_by" IS NULL)
          AND ("kpi_observations"."voided_at" IS NULL OR "kpi_observations"."void_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "kpi_review_items" (
	"review_id" bigint NOT NULL,
	"metric_code" text NOT NULL,
	"label" text NOT NULL,
	"unit" text NOT NULL,
	"direction" text NOT NULL,
	"source" text NOT NULL,
	"weight_pct" smallint NOT NULL,
	"target_milli" bigint NOT NULL,
	"target_source" text DEFAULT 'mau' NOT NULL,
	"target_note" text,
	"actual_milli" bigint,
	"sample_count" integer,
	"self_score" smallint,
	"manager_score" smallint,
	"excluded_reason" text,
	"excluded_by" bigint,
	"achievement_milli" integer,
	"contribution_milli" integer,
	CONSTRAINT "kpi_review_items_review_id_metric_code_pk" PRIMARY KEY("review_id","metric_code"),
	CONSTRAINT "kpi_review_items_direction_check" CHECK ("kpi_review_items"."direction" IN ('cao','thap')),
	CONSTRAINT "kpi_review_items_score_check" CHECK (("kpi_review_items"."self_score" IS NULL OR "kpi_review_items"."self_score" BETWEEN 1 AND 5)
          AND ("kpi_review_items"."manager_score" IS NULL OR "kpi_review_items"."manager_score" BETWEEN 1 AND 5)),
	CONSTRAINT "kpi_review_items_target_check" CHECK ("kpi_review_items"."target_source" = 'mau' OR "kpi_review_items"."target_note" IS NOT NULL),
	CONSTRAINT "kpi_review_items_excluded_check" CHECK (("kpi_review_items"."excluded_reason" IS NULL) = ("kpi_review_items"."excluded_by" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "kpi_reviews" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kpi_reviews_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"cycle_id" bigint NOT NULL,
	"staff_id" bigint NOT NULL,
	"employee_id" bigint NOT NULL,
	"position_id" bigint,
	"position_title" text,
	"unit_id" bigint,
	"template_id" bigint,
	"reviewer_id" bigint,
	"exempt" boolean DEFAULT false NOT NULL,
	"exempt_reason" text,
	"self_comment" text,
	"self_submitted_at" timestamp with time zone,
	"manager_comment" text,
	"finalized_by" bigint,
	"finalized_at" timestamp with time zone,
	"score_milli" bigint,
	"coverage_milli" integer,
	"grade" text,
	"suggested_bonus_vnd" bigint,
	"bonus_basis" text,
	"employee_ack_at" timestamp with time zone,
	"employee_feedback" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "kpi_reviews_grade_check" CHECK ("kpi_reviews"."grade" IS NULL OR "kpi_reviews"."grade" IN ('A','B','C','D')),
	CONSTRAINT "kpi_reviews_not_self" CHECK ("kpi_reviews"."reviewer_id" IS NULL OR "kpi_reviews"."reviewer_id" <> "kpi_reviews"."staff_id"),
	CONSTRAINT "kpi_reviews_finalizer_not_self" CHECK ("kpi_reviews"."finalized_by" IS NULL OR "kpi_reviews"."finalized_by" <> "kpi_reviews"."staff_id"),
	CONSTRAINT "kpi_reviews_exempt_check" CHECK (NOT "kpi_reviews"."exempt" OR "kpi_reviews"."exempt_reason" IS NOT NULL),
	CONSTRAINT "kpi_reviews_bonus_check" CHECK ("kpi_reviews"."suggested_bonus_vnd" IS NULL OR "kpi_reviews"."suggested_bonus_vnd" >= 0)
);
--> statement-breakpoint
CREATE TABLE "kpi_template_items" (
	"template_id" bigint NOT NULL,
	"metric_code" text NOT NULL,
	"weight_pct" smallint NOT NULL,
	"default_target_milli" bigint NOT NULL,
	CONSTRAINT "kpi_template_items_template_id_metric_code_pk" PRIMARY KEY("template_id","metric_code"),
	CONSTRAINT "kpi_template_items_weight_check" CHECK ("kpi_template_items"."weight_pct" BETWEEN 1 AND 100)
);
--> statement-breakpoint
CREATE TABLE "kpi_templates" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "kpi_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"position_id" bigint NOT NULL,
	"branch_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "kpi_cycles" ADD CONSTRAINT "kpi_cycles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_cycles" ADD CONSTRAINT "kpi_cycles_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_cycles" ADD CONSTRAINT "kpi_cycles_opened_by_staff_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_cycles" ADD CONSTRAINT "kpi_cycles_review_started_by_staff_id_fk" FOREIGN KEY ("review_started_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_cycles" ADD CONSTRAINT "kpi_cycles_closed_by_staff_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_observations" ADD CONSTRAINT "kpi_observations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_observations" ADD CONSTRAINT "kpi_observations_observer_id_staff_id_fk" FOREIGN KEY ("observer_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_observations" ADD CONSTRAINT "kpi_observations_voided_by_staff_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_review_items" ADD CONSTRAINT "kpi_review_items_review_id_kpi_reviews_id_fk" FOREIGN KEY ("review_id") REFERENCES "public"."kpi_reviews"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_review_items" ADD CONSTRAINT "kpi_review_items_excluded_by_staff_id_fk" FOREIGN KEY ("excluded_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_cycle_id_kpi_cycles_id_fk" FOREIGN KEY ("cycle_id") REFERENCES "public"."kpi_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_unit_id_org_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_template_id_kpi_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."kpi_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_reviewer_id_staff_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_reviews" ADD CONSTRAINT "kpi_reviews_finalized_by_staff_id_fk" FOREIGN KEY ("finalized_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_template_items" ADD CONSTRAINT "kpi_template_items_template_id_kpi_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."kpi_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_templates" ADD CONSTRAINT "kpi_templates_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_templates" ADD CONSTRAINT "kpi_templates_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "kpi_templates" ADD CONSTRAINT "kpi_templates_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_cycles_one_per_range" ON "kpi_cycles" USING btree ("branch_id","period_start","period_end");--> statement-breakpoint
CREATE INDEX "kpi_observations_branch_idx" ON "kpi_observations" USING btree ("branch_id","observed_on");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_reviews_one_per_cycle" ON "kpi_reviews" USING btree ("cycle_id","staff_id");--> statement-breakpoint
CREATE INDEX "kpi_reviews_reviewer_idx" ON "kpi_reviews" USING btree ("reviewer_id");--> statement-breakpoint
CREATE UNIQUE INDEX "kpi_templates_one_active" ON "kpi_templates" USING btree ("position_id") WHERE active;