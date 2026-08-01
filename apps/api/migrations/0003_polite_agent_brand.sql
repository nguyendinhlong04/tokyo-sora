CREATE TABLE "table_feedback" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "table_feedback_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"table_session_id" bigint NOT NULL,
	"stars" integer NOT NULL,
	"comment" text,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_feedback_table_session_id_unique" UNIQUE("table_session_id"),
	CONSTRAINT "table_feedback_stars_check" CHECK ("table_feedback"."stars" BETWEEN 1 AND 5)
);
--> statement-breakpoint
ALTER TABLE "table_feedback" ADD CONSTRAINT "table_feedback_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_feedback" ADD CONSTRAINT "table_feedback_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "table_feedback_branch_date_idx" ON "table_feedback" USING btree ("branch_id","business_date");