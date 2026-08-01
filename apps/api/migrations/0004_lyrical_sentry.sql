CREATE TABLE "delivery_zones" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "delivery_zones_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"wards" text[] NOT NULL,
	"fee_vnd" bigint NOT NULL,
	"min_order_vnd" bigint DEFAULT 0 NOT NULL,
	"eta_minutes" integer DEFAULT 30 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "delivery_zones_fee_nonneg" CHECK ("delivery_zones"."fee_vnd" >= 0 AND "delivery_zones"."min_order_vnd" >= 0),
	CONSTRAINT "delivery_zones_eta_positive" CHECK ("delivery_zones"."eta_minutes" > 0),
	CONSTRAINT "delivery_zones_wards_not_empty" CHECK (array_length("delivery_zones"."wards", 1) > 0)
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "track_token_hash" text;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "shipper" jsonb;--> statement-breakpoint
ALTER TABLE "delivery_zones" ADD CONSTRAINT "delivery_zones_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "delivery_zones_branch_idx" ON "delivery_zones" USING btree ("branch_id","sort");--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_track_token_hash_unique" UNIQUE("track_token_hash");