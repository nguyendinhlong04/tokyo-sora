ALTER TABLE "dish_branch_overrides" ADD COLUMN "online_visible" boolean;--> statement-breakpoint
ALTER TABLE "dish_branch_overrides" ADD COLUMN "online_price" bigint;--> statement-breakpoint
ALTER TABLE "dishes" ADD COLUMN "online_price" bigint;