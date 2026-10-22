CREATE TABLE "task_check_items" (
	"task_id" bigint NOT NULL,
	"idx" smallint NOT NULL,
	"label" text NOT NULL,
	"checked_by" bigint,
	"checked_at" timestamp with time zone,
	CONSTRAINT "task_check_items_task_id_idx_pk" PRIMARY KEY("task_id","idx"),
	CONSTRAINT "task_check_items_idx_check" CHECK ("task_check_items"."idx" BETWEEN 0 AND 29),
	CONSTRAINT "task_check_items_checked_check" CHECK (("task_check_items"."checked_by" IS NULL) = ("task_check_items"."checked_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "task_templates" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "task_templates_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text,
	"title" text NOT NULL,
	"note" text,
	"checklist" text[] DEFAULT '{}'::text[] NOT NULL,
	"assignee_position_id" bigint NOT NULL,
	"reviewer_position_id" bigint,
	"recurrence" text NOT NULL,
	"weekday" smallint,
	"month_day" smallint,
	"shift_template_id" bigint,
	"due_minute" integer,
	"priority" text DEFAULT 'thuong' NOT NULL,
	"document_id" bigint,
	"starts_on" date NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_by" bigint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_templates_recurrence_check" CHECK ("task_templates"."recurrence" IN ('hang-ngay','hang-tuan','hang-thang','theo-ca')),
	CONSTRAINT "task_templates_shape_check" CHECK (("task_templates"."recurrence" = 'hang-tuan') = ("task_templates"."weekday" IS NOT NULL)
          AND ("task_templates"."weekday" IS NULL OR "task_templates"."weekday" BETWEEN 1 AND 7)
          AND ("task_templates"."recurrence" = 'hang-thang') = ("task_templates"."month_day" IS NOT NULL)
          AND ("task_templates"."month_day" IS NULL OR "task_templates"."month_day" BETWEEN 1 AND 28)
          AND ("task_templates"."recurrence" = 'theo-ca') = ("task_templates"."shift_template_id" IS NOT NULL)
          AND ("task_templates"."recurrence" <> 'theo-ca' OR "task_templates"."branch_id" IS NOT NULL)
          AND ("task_templates"."recurrence" = 'theo-ca' OR "task_templates"."due_minute" IS NOT NULL)
          AND ("task_templates"."due_minute" IS NULL OR "task_templates"."due_minute" BETWEEN 0 AND 1800)),
	CONSTRAINT "task_templates_reviewer_check" CHECK ("task_templates"."reviewer_position_id" IS NULL OR "task_templates"."reviewer_position_id" <> "task_templates"."assignee_position_id"),
	CONSTRAINT "task_templates_checklist_check" CHECK (cardinality("task_templates"."checklist") <= 30),
	CONSTRAINT "task_templates_priority_check" CHECK ("task_templates"."priority" IN ('thuong','gap'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tasks_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text,
	"title" text NOT NULL,
	"note" text,
	"priority" text DEFAULT 'thuong' NOT NULL,
	"assignee_staff_id" bigint,
	"assignee_position_id" bigint,
	"reviewer_staff_id" bigint,
	"reviewer_position_id" bigint,
	"due_at" timestamp with time zone NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"accepted_at" timestamp with time zone,
	"template_id" bigint,
	"occurrence_date" date,
	"shift_template_id" bigint,
	"entity" text,
	"entity_id" bigint,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"result_note" text,
	"submitted_by" bigint,
	"submitted_at" timestamp with time zone,
	"done_by" bigint,
	"done_at" timestamp with time zone,
	"reviewed_by" bigint,
	"reviewed_at" timestamp with time zone,
	"manager_note" text,
	"cancelled_by" bigint,
	"cancelled_at" timestamp with time zone,
	"cancel_reason" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "tasks_state_check" CHECK ("tasks"."state" IN ('open','submitted','done','cancelled')),
	CONSTRAINT "tasks_priority_check" CHECK ("tasks"."priority" IN ('thuong','gap')),
	CONSTRAINT "tasks_assignee_check" CHECK ("tasks"."assignee_staff_id" IS NOT NULL OR "tasks"."assignee_position_id" IS NOT NULL),
	CONSTRAINT "tasks_reviewer_check" CHECK ("tasks"."reviewer_staff_id" IS NULL OR "tasks"."reviewer_position_id" IS NULL),
	CONSTRAINT "tasks_review_not_self" CHECK (("tasks"."reviewer_staff_id" IS NULL OR "tasks"."assignee_staff_id" IS NULL
             OR "tasks"."reviewer_staff_id" <> "tasks"."assignee_staff_id")
          AND ("tasks"."reviewer_position_id" IS NULL OR "tasks"."assignee_position_id" IS NULL
             OR "tasks"."reviewer_position_id" <> "tasks"."assignee_position_id")
          AND ("tasks"."reviewed_by" IS NULL OR "tasks"."submitted_by" IS NULL
             OR "tasks"."reviewed_by" <> "tasks"."submitted_by")),
	CONSTRAINT "tasks_occurrence_check" CHECK (("tasks"."template_id" IS NULL) = ("tasks"."occurrence_date" IS NULL)),
	CONSTRAINT "tasks_entity_check" CHECK (("tasks"."entity" IS NULL) = ("tasks"."entity_id" IS NULL)
          AND ("tasks"."entity" IS NULL OR "tasks"."entity" IN ('feedback','incident','work-report','document'))),
	CONSTRAINT "tasks_attachments_check" CHECK (jsonb_typeof("tasks"."attachments") = 'array' AND jsonb_array_length("tasks"."attachments") <= 10),
	CONSTRAINT "tasks_submitted_check" CHECK ("tasks"."state" <> 'submitted' OR ("tasks"."submitted_at" IS NOT NULL AND "tasks"."submitted_by" IS NOT NULL)),
	CONSTRAINT "tasks_done_check" CHECK ("tasks"."state" <> 'done' OR ("tasks"."done_at" IS NOT NULL AND "tasks"."done_by" IS NOT NULL)),
	CONSTRAINT "tasks_cancel_check" CHECK (("tasks"."state" = 'cancelled')
          = ("tasks"."cancelled_at" IS NOT NULL AND "tasks"."cancelled_by" IS NOT NULL AND "tasks"."cancel_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "task_check_items" ADD CONSTRAINT "task_check_items_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_check_items" ADD CONSTRAINT "task_check_items_checked_by_staff_id_fk" FOREIGN KEY ("checked_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_assignee_position_id_positions_id_fk" FOREIGN KEY ("assignee_position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_reviewer_position_id_positions_id_fk" FOREIGN KEY ("reviewer_position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_document_id_org_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."org_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_templates" ADD CONSTRAINT "task_templates_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_staff_id_staff_id_fk" FOREIGN KEY ("assignee_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_assignee_position_id_positions_id_fk" FOREIGN KEY ("assignee_position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_staff_id_staff_id_fk" FOREIGN KEY ("reviewer_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewer_position_id_positions_id_fk" FOREIGN KEY ("reviewer_position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_template_id_task_templates_id_fk" FOREIGN KEY ("template_id") REFERENCES "public"."task_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_shift_template_id_shift_templates_id_fk" FOREIGN KEY ("shift_template_id") REFERENCES "public"."shift_templates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_submitted_by_staff_id_fk" FOREIGN KEY ("submitted_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_done_by_staff_id_fk" FOREIGN KEY ("done_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_reviewed_by_staff_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_cancelled_by_staff_id_fk" FOREIGN KEY ("cancelled_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_templates_branch_idx" ON "task_templates" USING btree ("branch_id","active");--> statement-breakpoint
CREATE UNIQUE INDEX "tasks_one_per_occurrence" ON "tasks" USING btree ("template_id","occurrence_date");--> statement-breakpoint
CREATE INDEX "tasks_assignee_open_idx" ON "tasks" USING btree ("assignee_staff_id") WHERE state IN ('open','submitted');--> statement-breakpoint
CREATE INDEX "tasks_position_open_idx" ON "tasks" USING btree ("assignee_position_id","occurrence_date") WHERE state IN ('open','submitted');--> statement-breakpoint
CREATE INDEX "tasks_branch_due_idx" ON "tasks" USING btree ("branch_id","due_at");--> statement-breakpoint
CREATE INDEX "tasks_entity_idx" ON "tasks" USING btree ("entity","entity_id");