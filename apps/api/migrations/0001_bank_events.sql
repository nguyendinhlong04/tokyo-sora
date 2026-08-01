CREATE TABLE "bank_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "bank_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"provider" text NOT NULL,
	"bank_ref" text NOT NULL,
	"va_number" text,
	"amount" bigint NOT NULL,
	"raw" jsonb NOT NULL,
	"received_at" timestamp with time zone DEFAULT now() NOT NULL,
	"matched_payment_id" bigint,
	"match_state" text NOT NULL,
	CONSTRAINT "bank_events_bank_ref_unique" UNIQUE("bank_ref"),
	CONSTRAINT "bank_events_match_state_check" CHECK ("bank_events"."match_state" IN ('matched','unmatched','amount_mismatch'))
);
--> statement-breakpoint
CREATE INDEX "bank_events_unmatched_idx" ON "bank_events" USING btree ("received_at") WHERE match_state <> 'matched';