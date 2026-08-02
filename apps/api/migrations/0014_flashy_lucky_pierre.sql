CREATE TABLE "leave_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leave_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"employee_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date NOT NULL,
	"counterpart_id" bigint,
	"reason" text NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"decided_by" bigint,
	"decided_at" timestamp with time zone,
	"decision_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leave_requests_kind_check" CHECK ("leave_requests"."kind" IN ('nghi-phep','nghi-khong-luong','nghi-om','doi-ca')),
	CONSTRAINT "leave_requests_state_check" CHECK ("leave_requests"."state" IN ('pending','approved','rejected')),
	CONSTRAINT "leave_requests_range_check" CHECK ("leave_requests"."to_date" >= "leave_requests"."from_date"),
	CONSTRAINT "leave_requests_counterpart_check" CHECK (("leave_requests"."kind" = 'doi-ca' AND "leave_requests"."counterpart_id" IS NOT NULL)
       OR ("leave_requests"."kind" <> 'doi-ca' AND "leave_requests"."counterpart_id" IS NULL)),
	CONSTRAINT "leave_requests_not_self" CHECK ("leave_requests"."counterpart_id" IS DISTINCT FROM "leave_requests"."employee_id"),
	CONSTRAINT "leave_requests_decided_check" CHECK ("leave_requests"."state" = 'pending' OR ("leave_requests"."decided_by" IS NOT NULL AND "leave_requests"."decided_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "time_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"employee_id" bigint NOT NULL,
	"work_date" date NOT NULL,
	"schedule_entry_id" bigint,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_out" timestamp with time zone,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"source" text DEFAULT 'kiosk' NOT NULL,
	"photo_url" text,
	"edit_reason" text,
	"edited_by" bigint,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_source_check" CHECK ("time_entries"."source" IN ('kiosk','manual','pos')),
	CONSTRAINT "time_entries_order_check" CHECK ("time_entries"."clock_out" IS NULL OR "time_entries"."clock_out" > "time_entries"."clock_in"),
	CONSTRAINT "time_entries_break_nonneg" CHECK ("time_entries"."break_minutes" >= 0),
	CONSTRAINT "time_entries_edit_reason_check" CHECK ("time_entries"."source" <> 'manual' OR "time_entries"."edit_reason" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_counterpart_id_employees_id_fk" FOREIGN KEY ("counterpart_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_decided_by_staff_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_employee_id_employees_id_fk" FOREIGN KEY ("employee_id") REFERENCES "public"."employees"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_schedule_entry_id_schedule_entries_id_fk" FOREIGN KEY ("schedule_entry_id") REFERENCES "public"."schedule_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_edited_by_staff_id_fk" FOREIGN KEY ("edited_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leave_requests_queue_idx" ON "leave_requests" USING btree ("branch_id","state","from_date");--> statement-breakpoint
CREATE UNIQUE INDEX "time_entries_one_per_day" ON "time_entries" USING btree ("employee_id","work_date");--> statement-breakpoint
CREATE INDEX "time_entries_board_idx" ON "time_entries" USING btree ("branch_id","work_date");