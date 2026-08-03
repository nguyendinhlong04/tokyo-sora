CREATE TABLE "reservation_reminders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "reservation_reminders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"reservation_id" bigint NOT NULL,
	"stage" text NOT NULL,
	"channel" text NOT NULL,
	"outcome" text NOT NULL,
	"sent_by" bigint,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reservation_reminders_stage_check" CHECK ("reservation_reminders"."stage" IN ('h24','h2')),
	CONSTRAINT "reservation_reminders_channel_check" CHECK ("reservation_reminders"."channel" IN ('phone','zalo','sms','messenger')),
	CONSTRAINT "reservation_reminders_outcome_check" CHECK ("reservation_reminders"."outcome" IN ('reached','no_answer'))
);
--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "guest_token" text;--> statement-breakpoint
ALTER TABLE "reservations" ADD COLUMN "guest_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reservation_reminders" ADD CONSTRAINT "reservation_reminders_reservation_id_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reservation_reminders" ADD CONSTRAINT "reservation_reminders_sent_by_staff_id_fk" FOREIGN KEY ("sent_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "reservation_reminders_by_reservation_idx" ON "reservation_reminders" USING btree ("reservation_id","stage");--> statement-breakpoint
ALTER TABLE "reservations" ADD CONSTRAINT "reservations_guest_token_unique" UNIQUE("guest_token");