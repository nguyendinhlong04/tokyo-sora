CREATE TABLE "dish_stories" (
	"dish_id" text PRIMARY KEY NOT NULL,
	"chapter_no" text,
	"portion_label" text,
	"name_ja_full" text,
	"intro" text,
	"note" text,
	"craft" text,
	"footer_image_url" text,
	"banner_ja" text,
	"banner_vi" text,
	"closing" text,
	"pairing_dish_ids" text[],
	"origin" text,
	"origin_kanji" text,
	"origin_image_url" text,
	"flavours" text[],
	"cuts_label" text,
	"cuts" jsonb,
	"fire" text,
	"fire_image_url" text,
	"dip" text,
	"dip_image_url" text,
	"condiments" jsonb,
	"serves" text,
	"duration" text,
	"flow" text[],
	"extra_dish_ids" text[]
);
--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "image_url" text;--> statement-breakpoint
ALTER TABLE "dish_stories" ADD CONSTRAINT "dish_stories_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE cascade ON UPDATE no action;