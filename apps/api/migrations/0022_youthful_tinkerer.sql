CREATE TABLE "table_devices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "table_devices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"table_session_id" bigint NOT NULL,
	"token_hash" text NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"is_host" boolean DEFAULT false NOT NULL,
	"admitted_via" text,
	"admitted_by_staff_id" bigint,
	"admitted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "table_devices_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "table_devices_state_check" CHECK ("table_devices"."state" IN ('waiting','admitted','rejected')),
	CONSTRAINT "table_devices_admitted_via_check" CHECK ("table_devices"."admitted_via" IS NULL OR "table_devices"."admitted_via" IN ('wifi','host','staff')),
	CONSTRAINT "table_devices_host_admitted" CHECK (NOT "table_devices"."is_host" OR "table_devices"."state" = 'admitted')
);
--> statement-breakpoint
ALTER TABLE "table_devices" ADD CONSTRAINT "table_devices_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_devices" ADD CONSTRAINT "table_devices_admitted_by_staff_id_staff_id_fk" FOREIGN KEY ("admitted_by_staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "table_devices_one_host" ON "table_devices" USING btree ("table_session_id") WHERE is_host;--> statement-breakpoint
CREATE INDEX "table_devices_session_idx" ON "table_devices" USING btree ("table_session_id","state");