ALTER TABLE "orders" DROP CONSTRAINT "orders_display_code_unique";--> statement-breakpoint
ALTER TABLE "reservations" DROP CONSTRAINT "reservations_display_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "orders_branch_display_code_unique" ON "orders" USING btree ("branch_id","display_code");--> statement-breakpoint
CREATE UNIQUE INDEX "reservations_branch_display_code_unique" ON "reservations" USING btree ("branch_id","display_code");