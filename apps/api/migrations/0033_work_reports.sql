CREATE TABLE "incidents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "incidents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"branch_id" text NOT NULL,
	"category" text NOT NULL,
	"severity" text NOT NULL,
	"occurred_at" timestamp with time zone NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_date" date NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"immediate_action" text,
	"injured_count" integer DEFAULT 0 NOT NULL,
	"customer_involved" boolean DEFAULT false NOT NULL,
	"order_id" bigint,
	"root_cause" text,
	"corrective_action" text,
	"loss_estimate_vnd" bigint,
	"external_report_required" boolean DEFAULT false NOT NULL,
	"external_reported_at" timestamp with time zone,
	"external_report_ref" text,
	"evidence_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"reported_by" bigint NOT NULL,
	"owner_id" bigint,
	"closed_by" bigint,
	"closed_at" timestamp with time zone,
	"close_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "incidents_code_unique" UNIQUE("code"),
	CONSTRAINT "incidents_category_check" CHECK ("incidents"."category" IN ('tai-nan-lao-dong','an-toan-thuc-pham','khieu-nai-nghiem-trong',
                            'hong-thiet-bi','an-ninh-mat-mat','chay-no','khac')),
	CONSTRAINT "incidents_severity_check" CHECK ("incidents"."severity" IN ('nhe','trung-binh','nghiem-trong','rat-nghiem-trong')),
	CONSTRAINT "incidents_state_check" CHECK ("incidents"."state" IN ('open','investigating','closed')),
	CONSTRAINT "incidents_time_check" CHECK ("incidents"."occurred_at" <= "incidents"."reported_at"),
	CONSTRAINT "incidents_numbers_check" CHECK ("incidents"."injured_count" >= 0 AND ("incidents"."loss_estimate_vnd" IS NULL OR "incidents"."loss_estimate_vnd" >= 0)
          AND cardinality("incidents"."evidence_urls") <= 10),
	CONSTRAINT "incidents_external_check" CHECK ("incidents"."external_report_required"
          OR NOT ("incidents"."category" IN ('tai-nan-lao-dong','an-toan-thuc-pham','chay-no')
                  AND "incidents"."severity" IN ('nghiem-trong','rat-nghiem-trong'))),
	CONSTRAINT "incidents_closed_check" CHECK ("incidents"."state" <> 'closed'
          OR ("incidents"."root_cause" IS NOT NULL AND "incidents"."corrective_action" IS NOT NULL
              AND "incidents"."closed_by" IS NOT NULL AND "incidents"."closed_at" IS NOT NULL
              AND (NOT "incidents"."external_report_required" OR "incidents"."external_reported_at" IS NOT NULL))),
	CONSTRAINT "incidents_close_not_self" CHECK ("incidents"."state" <> 'closed' OR "incidents"."severity" IN ('nhe','trung-binh')
          OR "incidents"."closed_by" <> "incidents"."reported_by")
);
--> statement-breakpoint
CREATE TABLE "report_template_positions" (
	"template_id" bigint NOT NULL,
	"position_id" bigint NOT NULL,
	"role" text NOT NULL,
	CONSTRAINT "report_template_positions_template_id_position_id_pk" PRIMARY KEY("template_id","position_id"),
	CONSTRAINT "report_template_positions_role_check" CHECK ("report_template_positions"."role" IN ('nop','du-phong'))
);
--> statement-breakpoint
CREATE TABLE "report_templates" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "report_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"name" text NOT NULL,
	"cadence" text NOT NULL,
	"branch_id" text NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"fields" jsonb NOT NULL,
	"shift_template_ids" bigint[] DEFAULT '{}'::bigint[] NOT NULL,
	"due_offset_minutes" integer NOT NULL,
	"review_mode" text NOT NULL,
	"kenh_nv" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "report_templates_cadence_check" CHECK ("report_templates"."cadence" IN ('ca','ngay','tuan','thang')),
	CONSTRAINT "report_templates_review_mode_check" CHECK ("report_templates"."review_mode" IN ('cap-tren','ca-sau','khong')),
	CONSTRAINT "report_templates_fields_check" CHECK (jsonb_typeof("report_templates"."fields") = 'array'),
	CONSTRAINT "report_templates_due_check" CHECK ("report_templates"."due_offset_minutes" BETWEEN 0 AND 4320)
);
--> statement-breakpoint
CREATE TABLE "work_report_addenda" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_report_addenda_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"report_id" bigint NOT NULL,
	"author_id" bigint NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_report_addenda_body_check" CHECK (length("work_report_addenda"."body") BETWEEN 1 AND 4000)
);
--> statement-breakpoint
CREATE TABLE "work_reports" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "work_reports_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"template_id" bigint NOT NULL,
	"template_version" integer NOT NULL,
	"fields_snapshot" jsonb NOT NULL,
	"branch_id" text NOT NULL,
	"business_date" date NOT NULL,
	"shift_template_id" bigint,
	"period_key" text NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"values" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auto_values" jsonb,
	"author_id" bigint NOT NULL,
	"channel" text,
	"due_at" timestamp with time zone NOT NULL,
	"submitted_at" timestamp with time zone,
	"on_time" boolean,
	"reviewed_by" bigint,
	"reviewed_at" timestamp with time zone,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_reports_state_check" CHECK ("work_reports"."state" IN ('draft','submitted','reviewed')),
	CONSTRAINT "work_reports_channel_check" CHECK ("work_reports"."channel" IS NULL OR "work_reports"."channel" IN ('office','kenh-nv')),
	CONSTRAINT "work_reports_submitted_check" CHECK ("work_reports"."state" = 'draft'
          OR ("work_reports"."submitted_at" IS NOT NULL AND "work_reports"."auto_values" IS NOT NULL
              AND "work_reports"."channel" IS NOT NULL AND "work_reports"."on_time" IS NOT NULL)),
	CONSTRAINT "work_reports_reviewed_check" CHECK (("work_reports"."state" = 'reviewed') = ("work_reports"."reviewed_by" IS NOT NULL AND "work_reports"."reviewed_at" IS NOT NULL)),
	CONSTRAINT "work_reports_review_not_self" CHECK ("work_reports"."reviewed_by" IS NULL OR "work_reports"."reviewed_by" <> "work_reports"."author_id")
);
--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_reported_by_staff_id_fk" FOREIGN KEY ("reported_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_owner_id_staff_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "incidents" ADD CONSTRAINT "incidents_closed_by_staff_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_template_positions" ADD CONSTRAINT "report_template_positions_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_template_positions" ADD CONSTRAINT "report_template_positions_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "report_templates" ADD CONSTRAINT "report_templates_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_report_addenda" ADD CONSTRAINT "work_report_addenda_report_id_work_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."work_reports"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_report_addenda" ADD CONSTRAINT "work_report_addenda_author_id_staff_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_template_id_report_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."report_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_author_id_staff_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_reports" ADD CONSTRAINT "work_reports_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "incidents_branch_state_idx" ON "incidents" USING btree ("branch_id","state");--> statement-breakpoint
CREATE UNIQUE INDEX "report_templates_branch_code" ON "report_templates" USING btree ("branch_id","code");--> statement-breakpoint
CREATE INDEX "work_report_addenda_report_idx" ON "work_report_addenda" USING btree ("report_id");--> statement-breakpoint
CREATE UNIQUE INDEX "work_reports_one_per_slot" ON "work_reports" USING btree ("template_id","period_key",coalesce("shift_template_id", 0));--> statement-breakpoint
CREATE INDEX "work_reports_branch_date_idx" ON "work_reports" USING btree ("branch_id","business_date");