CREATE TABLE "dish_recipes" (
	"dish_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty_base" bigint NOT NULL,
	"waste_bp" integer DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dish_recipes_dish_id_ingredient_id_pk" PRIMARY KEY("dish_id","ingredient_id"),
	CONSTRAINT "dish_recipes_qty_check" CHECK ("dish_recipes"."qty_base" > 0),
	CONSTRAINT "dish_recipes_waste_check" CHECK ("dish_recipes"."waste_bp" >= 0 AND "dish_recipes"."waste_bp" <= 10000)
);
--> statement-breakpoint
CREATE TABLE "ingredients" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"group_name" text,
	"base_unit" text NOT NULL,
	"purchase_unit" text NOT NULL,
	"base_per_purchase" bigint NOT NULL,
	"cost_per_base_milli" bigint DEFAULT 0 NOT NULL,
	"min_level_base" bigint DEFAULT 0 NOT NULL,
	"lot_required" boolean DEFAULT false NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "ingredients_code_unique" UNIQUE("code"),
	CONSTRAINT "ingredients_base_per_purchase_check" CHECK ("ingredients"."base_per_purchase" > 0),
	CONSTRAINT "ingredients_cost_nonneg" CHECK ("ingredients"."cost_per_base_milli" >= 0),
	CONSTRAINT "ingredients_min_level_nonneg" CHECK ("ingredients"."min_level_base" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stock_levels" (
	"branch_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"qty_base" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_levels_branch_id_ingredient_id_pk" PRIMARY KEY("branch_id","ingredient_id")
);
--> statement-breakpoint
CREATE TABLE "stock_moves" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "stock_moves_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"ingredient_id" text NOT NULL,
	"kind" text NOT NULL,
	"qty_base" bigint NOT NULL,
	"cost_vnd" bigint NOT NULL,
	"order_line_id" bigint,
	"note" text,
	"actor_id" bigint,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stock_moves_kind_check" CHECK ("stock_moves"."kind" IN ('receipt','sale','count_adjust')),
	CONSTRAINT "stock_moves_sign_check" CHECK (("stock_moves"."kind" = 'receipt' AND "stock_moves"."qty_base" > 0)
       OR ("stock_moves"."kind" = 'sale' AND "stock_moves"."qty_base" < 0)
       OR ("stock_moves"."kind" = 'count_adjust' AND "stock_moves"."qty_base" <> 0)),
	CONSTRAINT "stock_moves_sale_needs_line" CHECK ("stock_moves"."kind" <> 'sale' OR "stock_moves"."order_line_id" IS NOT NULL),
	CONSTRAINT "stock_moves_adjust_needs_note" CHECK ("stock_moves"."kind" <> 'count_adjust' OR "stock_moves"."note" IS NOT NULL)
);
--> statement-breakpoint
ALTER TABLE "dish_recipes" ADD CONSTRAINT "dish_recipes_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_recipes" ADD CONSTRAINT "dish_recipes_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_ingredient_id_ingredients_id_fk" FOREIGN KEY ("ingredient_id") REFERENCES "public"."ingredients"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_moves" ADD CONSTRAINT "stock_moves_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "dish_recipes_ingredient_idx" ON "dish_recipes" USING btree ("ingredient_id");--> statement-breakpoint
CREATE INDEX "ingredients_group_idx" ON "ingredients" USING btree ("group_name","sort");--> statement-breakpoint
CREATE UNIQUE INDEX "stock_moves_one_sale_per_line" ON "stock_moves" USING btree ("order_line_id","ingredient_id") WHERE kind = 'sale';--> statement-breakpoint
CREATE INDEX "stock_moves_branch_date_idx" ON "stock_moves" USING btree ("branch_id","business_date");--> statement-breakpoint
CREATE INDEX "stock_moves_ingredient_idx" ON "stock_moves" USING btree ("ingredient_id","created_at");