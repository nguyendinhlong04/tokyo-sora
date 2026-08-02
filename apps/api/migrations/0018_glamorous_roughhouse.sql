ALTER TABLE "staff" ADD COLUMN "channel_token_hash" text;--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD COLUMN "scope" text DEFAULT 'full' NOT NULL;--> statement-breakpoint
ALTER TABLE "staff" ADD CONSTRAINT "staff_channel_token_hash_unique" UNIQUE("channel_token_hash");--> statement-breakpoint
ALTER TABLE "staff_sessions" ADD CONSTRAINT "staff_sessions_scope_check" CHECK ("staff_sessions"."scope" IN ('full','self'));