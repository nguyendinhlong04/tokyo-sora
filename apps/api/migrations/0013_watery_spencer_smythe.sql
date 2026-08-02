CREATE TABLE "printers" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "printers_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"kind" text NOT NULL,
	"station_id" text,
	"host" text NOT NULL,
	"port" integer DEFAULT 9100 NOT NULL,
	"template" text NOT NULL,
	"copies" smallint DEFAULT 1 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "printers_kind_check" CHECK ("printers"."kind" IN ('bill','tem')),
	CONSTRAINT "printers_template_check" CHECK ("printers"."template" IN ('k80-bill','k58-bill','tem-40x30','tem-50x30')),
	CONSTRAINT "printers_station_check" CHECK (("printers"."kind" = 'tem' AND "printers"."station_id" IS NOT NULL)
       OR ("printers"."kind" = 'bill' AND "printers"."station_id" IS NULL)),
	CONSTRAINT "printers_port_check" CHECK ("printers"."port" BETWEEN 1 AND 65535),
	CONSTRAINT "printers_copies_check" CHECK ("printers"."copies" BETWEEN 1 AND 5)
);
--> statement-breakpoint
CREATE TABLE "site_jobs" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "site_jobs_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"branch_id" text,
	"employment" text NOT NULL,
	"slots" smallint DEFAULT 1 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "site_jobs_slots_check" CHECK ("site_jobs"."slots" BETWEEN 1 AND 99)
);
--> statement-breakpoint
CREATE TABLE "site_posts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "site_posts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"category" text NOT NULL,
	"excerpt" text,
	"published_on" date NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "printers" ADD CONSTRAINT "printers_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_jobs" ADD CONSTRAINT "site_jobs_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_jobs" ADD CONSTRAINT "site_jobs_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "site_posts" ADD CONSTRAINT "site_posts_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "printers_branch_name_unique" ON "printers" USING btree ("branch_id","name");--> statement-breakpoint
CREATE INDEX "site_jobs_published_idx" ON "site_jobs" USING btree ("published","sort");--> statement-breakpoint
CREATE INDEX "site_posts_published_idx" ON "site_posts" USING btree ("published","published_on");