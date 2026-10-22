CREATE TABLE "org_units" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "org_units_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"parent_id" bigint,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"branch_id" text,
	"station_id" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_units_kind_check" CHECK ("org_units"."kind" IN ('cong-ty','khoi','phong','chi-nhanh','bo-phan','to')),
	CONSTRAINT "org_units_root_check" CHECK (("org_units"."kind" = 'cong-ty') = ("org_units"."parent_id" IS NULL)),
	CONSTRAINT "org_units_branch_check" CHECK (("org_units"."kind" = 'chi-nhanh') = ("org_units"."branch_id" IS NOT NULL)),
	CONSTRAINT "org_units_not_own_parent" CHECK ("org_units"."parent_id" IS NULL OR "org_units"."parent_id" <> "org_units"."id")
);
--> statement-breakpoint
CREATE TABLE "position_assignments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "position_assignments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"staff_id" bigint NOT NULL,
	"position_id" bigint NOT NULL,
	"kind" text DEFAULT 'chinh' NOT NULL,
	"from_date" date NOT NULL,
	"to_date" date,
	"document_id" bigint,
	"end_document_id" bigint,
	"note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "position_assignments_kind_check" CHECK ("position_assignments"."kind" IN ('chinh','kiem-nhiem')),
	CONSTRAINT "position_assignments_range_check" CHECK ("position_assignments"."to_date" IS NULL OR "position_assignments"."to_date" >= "position_assignments"."from_date"),
	CONSTRAINT "position_assignments_basis_check" CHECK ("position_assignments"."document_id" IS NOT NULL OR "position_assignments"."note" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "positions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "positions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"unit_id" bigint NOT NULL,
	"title" text NOT NULL,
	"is_head" boolean DEFAULT false NOT NULL,
	"headcount" smallint DEFAULT 1 NOT NULL,
	"suggested_role" text,
	"duties" text[] DEFAULT '{}'::text[] NOT NULL,
	"authorities" text[] DEFAULT '{}'::text[] NOT NULL,
	"requirements" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "positions_headcount_check" CHECK ("positions"."headcount" BETWEEN 0 AND 500),
	CONSTRAINT "positions_head_headcount_check" CHECK (NOT "positions"."is_head" OR "positions"."headcount" = 1),
	CONSTRAINT "positions_suggested_role_check" CHECK ("positions"."suggested_role" IS NULL OR "positions"."suggested_role"
          IN ('R1','R2','R3','R4','R5','R6','R7','R8','R9','R10','R11','R12','R13')),
	CONSTRAINT "positions_job_lines_check" CHECK (cardinality("positions"."duties") <= 20 AND cardinality("positions"."authorities") <= 20
          AND cardinality("positions"."requirements") <= 20)
);
--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_parent_id_org_units_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_units" ADD CONSTRAINT "org_units_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_assignments" ADD CONSTRAINT "position_assignments_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_assignments" ADD CONSTRAINT "position_assignments_position_id_positions_id_fk" FOREIGN KEY ("position_id") REFERENCES "public"."positions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_assignments" ADD CONSTRAINT "position_assignments_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "positions" ADD CONSTRAINT "positions_unit_id_org_units_id_fk" FOREIGN KEY ("unit_id") REFERENCES "public"."org_units"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "org_units_one_root" ON "org_units" USING btree ("kind") WHERE parent_id IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "org_units_one_per_branch" ON "org_units" USING btree ("branch_id") WHERE branch_id IS NOT NULL;--> statement-breakpoint
CREATE INDEX "org_units_parent_idx" ON "org_units" USING btree ("parent_id","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "position_assignments_one_main" ON "position_assignments" USING btree ("staff_id") WHERE kind = 'chinh' AND to_date IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "position_assignments_no_dup" ON "position_assignments" USING btree ("staff_id","position_id") WHERE to_date IS NULL;--> statement-breakpoint
CREATE INDEX "position_assignments_position_idx" ON "position_assignments" USING btree ("position_id","from_date");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_unit_title_unique" ON "positions" USING btree ("unit_id","title");--> statement-breakpoint
CREATE UNIQUE INDEX "positions_one_head_per_unit" ON "positions" USING btree ("unit_id") WHERE is_head AND active;