CREATE TABLE "reservation_holds" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reservation_holds_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"token_hash" text NOT NULL,
	"branch_id" text NOT NULL,
	"seat_kind" text NOT NULL,
	"guest_count" integer NOT NULL,
	"slot_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"reservation_id" bigint,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_holds_seat_kind_check" CHECK ("reservation_holds"."seat_kind" IN ('standard','grill','private')),
	CONSTRAINT "reservation_holds_guest_count_check" CHECK ("reservation_holds"."guest_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "reservations" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reservations_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"display_code" text NOT NULL,
	"branch_id" text NOT NULL,
	"seat_kind" text NOT NULL,
	"guest_count" integer NOT NULL,
	"slot_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"customer_name" text NOT NULL,
	"customer_phone" text NOT NULL,
	"note" text,
	"table_id" bigint,
	"source" text DEFAULT 'web' NOT NULL,
	"cancel_reason" text,
	"created_by" bigint,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"seated_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "reservations_display_code_unique" UNIQUE("display_code"),
	CONSTRAINT "reservations_seat_kind_check" CHECK ("reservations"."seat_kind" IN ('standard','grill','private')),
	CONSTRAINT "reservations_status_check" CHECK ("reservations"."status" IN ('pending','confirmed','seated','done','cancelled','no_show')),
	CONSTRAINT "reservations_source_check" CHECK ("reservations"."source" IN ('web','phone','walkin')),
	CONSTRAINT "reservations_guest_count_check" CHECK ("reservations"."guest_count" > 0),
	CONSTRAINT "reservations_window_check" CHECK ("reservations"."end_at" > "reservations"."slot_at")
);
--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "signature" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "reservation_holds" ADD CONSTRAINT "reservation_holds_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_holds" ADD CONSTRAINT "reservation_holds_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reservation_holds_token_unique" ON "reservation_holds" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "reservation_holds_live_idx" ON "reservation_holds" USING btree ("branch_id","business_date","seat_kind") WHERE reservation_id IS NULL;--> statement-breakpoint
CREATE INDEX "reservations_branch_day_idx" ON "reservations" USING btree ("branch_id","business_date","seat_kind");