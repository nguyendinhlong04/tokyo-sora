CREATE TABLE "site_hero_images" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "site_hero_images_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"image_url" text NOT NULL,
	"caption" text,
	"caption_ja" text,
	"sort" integer DEFAULT 0 NOT NULL,
	"published" boolean DEFAULT false NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_hero_images" ADD CONSTRAINT "site_hero_images_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "site_hero_images_published_idx" ON "site_hero_images" USING btree ("published","sort");