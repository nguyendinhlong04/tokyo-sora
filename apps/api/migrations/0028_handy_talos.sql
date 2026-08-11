CREATE TABLE "address_points" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "address_points_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"name_folded" text NOT NULL,
	"ward" text DEFAULT '' NOT NULL,
	"ward_folded" text DEFAULT '' NOT NULL,
	"lat" double precision,
	"lng" double precision,
	"hits" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "address_points_unique" ON "address_points" USING btree ("kind","name_folded","ward_folded");--> statement-breakpoint
CREATE INDEX "address_points_search_idx" ON "address_points" USING btree ("name_folded");