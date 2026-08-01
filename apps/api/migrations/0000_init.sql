CREATE TABLE "branches" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"address" text,
	"phone" text,
	"email" text,
	"timezone" text DEFAULT 'Asia/Ho_Chi_Minh' NOT NULL,
	"open_hours" jsonb,
	"bank" jsonb,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "devices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "devices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"station_id" text,
	"token_hash" text NOT NULL,
	"paired_by" bigint,
	"paired_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "devices_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "devices_kind_check" CHECK ("devices"."kind" IN ('pos','cashier','kds','kiosk','bridge'))
);
--> statement-breakpoint
CREATE TABLE "pairing_codes" (
	"code" text PRIMARY KEY NOT NULL,
	"branch_id" text NOT NULL,
	"kind" text NOT NULL,
	"station_id" text,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_by" bigint,
	CONSTRAINT "pairing_codes_code_check" CHECK ("pairing_codes"."code" ~ '^[0-9]{6}$')
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "shifts_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"device_id" bigint,
	"cashier_id" bigint NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"opening_cash" bigint DEFAULT 0 NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closing_cash_counted" bigint,
	"closing_expected" bigint,
	"closed_at" timestamp with time zone,
	"note" text,
	"business_date" date NOT NULL,
	CONSTRAINT "shifts_state_check" CHECK ("shifts"."state" IN ('open','closed'))
);
--> statement-breakpoint
CREATE TABLE "staff" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "staff_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"code" text NOT NULL,
	"full_name" text NOT NULL,
	"phone" text,
	"pin_hash" text,
	"email" text,
	"password_hash" text,
	"totp_secret_enc" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "staff_code_unique" UNIQUE("code"),
	CONSTRAINT "staff_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "staff_roles" (
	"staff_id" bigint NOT NULL,
	"role_code" text NOT NULL,
	"branch_id" text,
	CONSTRAINT "staff_roles_role_code_check" CHECK ("staff_roles"."role_code" IN ('R0','R1','R2','R3','R4','R5','R6','R7','R8','R9','R10','R11','R12','R13'))
);
--> statement-breakpoint
CREATE TABLE "categories" (
	"id" text PRIMARY KEY NOT NULL,
	"parent_id" text,
	"name_vi" text NOT NULL,
	"name_en" text,
	"name_ja" text,
	"kanji" text,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dish_availability" (
	"branch_id" text NOT NULL,
	"dish_id" text NOT NULL,
	"business_date" date NOT NULL,
	"status" text NOT NULL,
	"remaining" integer,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dish_availability_branch_id_dish_id_pk" PRIMARY KEY("branch_id","dish_id"),
	CONSTRAINT "dish_availability_status_check" CHECK ("dish_availability"."status" IN ('sold_out','limited')),
	CONSTRAINT "dish_availability_remaining_check" CHECK (("dish_availability"."status" = 'sold_out' AND "dish_availability"."remaining" IS NULL) OR ("dish_availability"."status" = 'limited' AND "dish_availability"."remaining" >= 0))
);
--> statement-breakpoint
CREATE TABLE "dish_branch_overrides" (
	"dish_id" text NOT NULL,
	"branch_id" text NOT NULL,
	"price" bigint,
	"active" boolean,
	"station_grill" text,
	"station_no_grill" text,
	CONSTRAINT "dish_branch_overrides_dish_id_branch_id_pk" PRIMARY KEY("dish_id","branch_id")
);
--> statement-breakpoint
CREATE TABLE "dish_modifier_groups" (
	"dish_id" text NOT NULL,
	"group_id" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dish_modifier_groups_dish_id_group_id_pk" PRIMARY KEY("dish_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "dishes" (
	"id" text PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'dish' NOT NULL,
	"category_id" text,
	"name_vi" text NOT NULL,
	"name_en" text,
	"name_ja" text,
	"kana" text,
	"short_desc" text,
	"long_desc" text,
	"allergens" text[],
	"tags" text[],
	"routing_method" text,
	"station_grill" text,
	"station_no_grill" text,
	"station_takeaway" text,
	"station_delivery" text,
	"secondary_station" text,
	"primary_label" text,
	"secondary_label" text,
	"prep_seconds" integer DEFAULT 300 NOT NULL,
	"base_price" bigint NOT NULL,
	"vat_code" text DEFAULT 'standard' NOT NULL,
	"online_visible" boolean DEFAULT false NOT NULL,
	"table_orderable" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dishes_code_unique" UNIQUE("code"),
	CONSTRAINT "dishes_kind_check" CHECK ("dishes"."kind" IN ('dish','set','drink')),
	CONSTRAINT "dishes_routing_method_check" CHECK ("dishes"."routing_method" IS NULL OR "dishes"."routing_method" IN ('fixed','song','nuong','linh_hoat')),
	CONSTRAINT "dishes_base_price_check" CHECK ("dishes"."base_price" >= 0),
	CONSTRAINT "dishes_routing_required" CHECK ("dishes"."kind" = 'set' OR ("dishes"."station_grill" IS NOT NULL AND "dishes"."station_no_grill" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "modifier_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"multi" boolean DEFAULT false NOT NULL,
	"pick_min" integer DEFAULT 0 NOT NULL,
	"pick_max" integer,
	CONSTRAINT "modifier_groups_pick_check" CHECK ("modifier_groups"."pick_max" IS NULL OR "modifier_groups"."pick_max" >= "modifier_groups"."pick_min")
);
--> statement-breakpoint
CREATE TABLE "modifier_options" (
	"id" text PRIMARY KEY NOT NULL,
	"group_id" text NOT NULL,
	"name" text NOT NULL,
	"price_delta" bigint DEFAULT 0 NOT NULL,
	"affects_stock" boolean DEFAULT false NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "set_group_items" (
	"group_id" text NOT NULL,
	"dish_id" text NOT NULL,
	"qty" integer DEFAULT 1 NOT NULL,
	"portion_label" text,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "set_group_items_group_id_dish_id_pk" PRIMARY KEY("group_id","dish_id"),
	CONSTRAINT "set_group_items_qty_check" CHECK ("set_group_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "set_groups" (
	"id" text PRIMARY KEY NOT NULL,
	"set_dish_id" text NOT NULL,
	"label" text NOT NULL,
	"kanji" text,
	"pick_count" integer,
	"batch_offset" integer DEFAULT 0 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "set_groups_pick_count_check" CHECK ("set_groups"."pick_count" IS NULL OR "set_groups"."pick_count" > 0),
	CONSTRAINT "set_groups_batch_offset_check" CHECK ("set_groups"."batch_offset" >= 0)
);
--> statement-breakpoint
CREATE TABLE "stations" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"kanji" text,
	"color" text,
	"ticket_prefix" text NOT NULL,
	"columns" integer DEFAULT 5 NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "areas" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "areas_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"name" text NOT NULL,
	"sort" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "table_requests" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "table_requests_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"table_session_id" bigint NOT NULL,
	"kind" text NOT NULL,
	"note" text,
	"state" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"handled_by" bigint,
	"handled_at" timestamp with time zone,
	CONSTRAINT "table_requests_kind_check" CHECK ("table_requests"."kind" IN ('phuc-vu','them-than','da-nuoc','tinh-tien','khac')),
	CONSTRAINT "table_requests_state_check" CHECK ("table_requests"."state" IN ('open','done'))
);
--> statement-breakpoint
CREATE TABLE "table_sessions" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "table_sessions_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"table_id" bigint NOT NULL,
	"merged_table_ids" bigint[],
	"status" text DEFAULT 'open' NOT NULL,
	"guest_count" integer DEFAULT 1 NOT NULL,
	"note" text,
	"opened_by" bigint,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"closed_by" bigint,
	"closed_at" timestamp with time zone,
	"qr_token_hash" text,
	"business_date" date NOT NULL,
	CONSTRAINT "table_sessions_qr_token_hash_unique" UNIQUE("qr_token_hash"),
	CONSTRAINT "table_sessions_status_check" CHECK ("table_sessions"."status" IN ('open','paid_wait_clear','closed')),
	CONSTRAINT "table_sessions_guest_count_check" CHECK ("table_sessions"."guest_count" > 0)
);
--> statement-breakpoint
CREATE TABLE "tables" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tables_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"area_id" bigint,
	"code" text NOT NULL,
	"kind" text DEFAULT 'standard' NOT NULL,
	"has_grill" boolean DEFAULT false NOT NULL,
	"grill_type" text,
	"seat_min" integer DEFAULT 2 NOT NULL,
	"seat_max" integer DEFAULT 4 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "tables_kind_check" CHECK ("tables"."kind" IN ('standard','grill','private')),
	CONSTRAINT "tables_grill_type_check" CHECK ("tables"."grill_type" IS NULL OR "tables"."grill_type" IN ('than','gas','dien')),
	CONSTRAINT "tables_seats_check" CHECK ("tables"."seat_max" >= "tables"."seat_min" AND "tables"."seat_min" > 0),
	CONSTRAINT "tables_grill_consistency" CHECK (NOT "tables"."has_grill" OR "tables"."grill_type" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "display_counters" (
	"branch_id" text NOT NULL,
	"kind" text NOT NULL,
	"business_date" date NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "display_counters_branch_id_kind_business_date_pk" PRIMARY KEY("branch_id","kind","business_date")
);
--> statement-breakpoint
CREATE TABLE "order_batches" (
	"order_id" bigint NOT NULL,
	"batch_no" smallint NOT NULL,
	"state" text DEFAULT 'held' NOT NULL,
	"fired_at" timestamp with time zone,
	"fired_by" bigint,
	CONSTRAINT "order_batches_order_id_batch_no_pk" PRIMARY KEY("order_id","batch_no"),
	CONSTRAINT "order_batches_state_check" CHECK ("order_batches"."state" IN ('held','fired')),
	CONSTRAINT "order_batches_no_check" CHECK ("order_batches"."batch_no" > 0),
	CONSTRAINT "order_batches_fired_at_check" CHECK (("order_batches"."state" = 'held' AND "order_batches"."fired_at" IS NULL) OR ("order_batches"."state" = 'fired' AND "order_batches"."fired_at" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "order_lines" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "order_lines_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"order_id" bigint NOT NULL,
	"parent_line_id" bigint,
	"kind" text DEFAULT 'dish' NOT NULL,
	"batch_no" smallint DEFAULT 1 NOT NULL,
	"dish_id" text NOT NULL,
	"dish_code" text NOT NULL,
	"name_snapshot" text NOT NULL,
	"qty" integer NOT NULL,
	"unit_price" bigint NOT NULL,
	"price_total" bigint NOT NULL,
	"modifiers" jsonb,
	"note" text,
	"set_label" text,
	"portion_label" text,
	"station_id" text,
	"state" text DEFAULT 'draft' NOT NULL,
	"void_reason" text,
	"voided_by" bigint,
	"approval_id" bigint,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_lines_kind_check" CHECK ("order_lines"."kind" IN ('dish','set_parent')),
	CONSTRAINT "order_lines_state_check" CHECK ("order_lines"."state" IN ('draft','queued','cooking','ready','served','voided')),
	CONSTRAINT "order_lines_qty_check" CHECK ("order_lines"."qty" > 0),
	CONSTRAINT "order_lines_price_check" CHECK ("order_lines"."unit_price" >= 0 AND "order_lines"."price_total" >= 0),
	CONSTRAINT "order_lines_child_price_zero" CHECK ("order_lines"."parent_line_id" IS NULL OR "order_lines"."price_total" = 0),
	CONSTRAINT "order_lines_void_reason_required" CHECK ("order_lines"."state" <> 'voided' OR "order_lines"."void_reason" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "orders_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"display_code" text NOT NULL,
	"branch_id" text NOT NULL,
	"channel" text NOT NULL,
	"type" text NOT NULL,
	"status" text DEFAULT 'new' NOT NULL,
	"table_session_id" bigint,
	"customer" jsonb,
	"slot_mode" text,
	"slot_at" timestamp with time zone,
	"money_sub" bigint DEFAULT 0 NOT NULL,
	"money_discount" bigint DEFAULT 0 NOT NULL,
	"money_service" bigint DEFAULT 0 NOT NULL,
	"money_vat" bigint DEFAULT 0 NOT NULL,
	"money_ship" bigint DEFAULT 0 NOT NULL,
	"money_round" bigint DEFAULT 0 NOT NULL,
	"money_total" bigint DEFAULT 0 NOT NULL,
	"pricing_bundle_version" text,
	"payment_state" text DEFAULT 'unpaid' NOT NULL,
	"cancel_reason" text,
	"created_by_kind" text NOT NULL,
	"created_by_id" text,
	"version" integer DEFAULT 1 NOT NULL,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	CONSTRAINT "orders_display_code_unique" UNIQUE("display_code"),
	CONSTRAINT "orders_channel_check" CHECK ("orders"."channel" IN ('web','table','pos','grab','shopee','be')),
	CONSTRAINT "orders_type_check" CHECK ("orders"."type" IN ('dinein','takeaway','delivery')),
	CONSTRAINT "orders_status_check" CHECK ("orders"."status" IN ('new','confirmed','cooking','ready','delivering','done','cancelled')),
	CONSTRAINT "orders_payment_state_check" CHECK ("orders"."payment_state" IN ('unpaid','partial','paid','refunded')),
	CONSTRAINT "orders_slot_mode_check" CHECK ("orders"."slot_mode" IS NULL OR "orders"."slot_mode" IN ('asap','scheduled')),
	CONSTRAINT "orders_created_by_kind_check" CHECK ("orders"."created_by_kind" IN ('staff','customer','device','system')),
	CONSTRAINT "orders_cancel_reason_required" CHECK ("orders"."status" <> 'cancelled' OR "orders"."cancel_reason" IS NOT NULL),
	CONSTRAINT "orders_money_nonneg" CHECK ("orders"."money_sub" >= 0 AND "orders"."money_total" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ticket_items" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "ticket_items_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"ticket_id" bigint NOT NULL,
	"order_line_id" bigint NOT NULL,
	"dish_id" text NOT NULL,
	"name_snapshot" text NOT NULL,
	"qty" integer NOT NULL,
	"note" text,
	"set_label" text,
	"component_label" text,
	"portion_label" text,
	"link_group" text,
	"state" text DEFAULT 'queued' NOT NULL,
	"weight_grams" integer,
	CONSTRAINT "ticket_items_state_check" CHECK ("ticket_items"."state" IN ('queued','cooking','done','voided')),
	CONSTRAINT "ticket_items_qty_check" CHECK ("ticket_items"."qty" > 0)
);
--> statement-breakpoint
CREATE TABLE "tickets" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "tickets_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"display_code" text NOT NULL,
	"order_id" bigint NOT NULL,
	"branch_id" text NOT NULL,
	"station_id" text NOT NULL,
	"source" text NOT NULL,
	"table_code" text,
	"batch_no" smallint NOT NULL,
	"priority" text DEFAULT 'normal' NOT NULL,
	"state" text DEFAULT 'waiting' NOT NULL,
	"grill_service_note" text,
	"prep_seconds" integer NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"queued_at" timestamp with time zone,
	"started_at" timestamp with time zone,
	"ready_at" timestamp with time zone,
	"due_at" timestamp with time zone,
	"start_by" timestamp with time zone,
	CONSTRAINT "tickets_source_check" CHECK ("tickets"."source" IN ('online','table','pos')),
	CONSTRAINT "tickets_priority_check" CHECK ("tickets"."priority" IN ('normal','rush','late')),
	CONSTRAINT "tickets_state_check" CHECK ("tickets"."state" IN ('waiting','queued','cooking','ready','closed','voided')),
	CONSTRAINT "tickets_clock_check" CHECK (("tickets"."state" = 'waiting' AND "tickets"."queued_at" IS NULL) OR ("tickets"."state" <> 'waiting' AND "tickets"."queued_at" IS NOT NULL)),
	CONSTRAINT "tickets_prep_seconds_check" CHECK ("tickets"."prep_seconds" > 0)
);
--> statement-breakpoint
CREATE TABLE "payment_lines" (
	"payment_id" bigint NOT NULL,
	"order_line_id" bigint NOT NULL,
	"live" text DEFAULT 'yes' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payments" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "payments_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"order_id" bigint,
	"table_session_id" bigint,
	"shift_id" bigint,
	"kind" text NOT NULL,
	"amount" bigint NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"va_number" text,
	"qr_string" text,
	"expires_at" timestamp with time zone,
	"bank_ref" text,
	"paid_at" timestamp with time zone,
	"created_by_kind" text NOT NULL,
	"created_by_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"business_date" date NOT NULL,
	CONSTRAINT "payments_bank_ref_unique" UNIQUE("bank_ref"),
	CONSTRAINT "payments_kind_check" CHECK ("payments"."kind" IN ('cash','vietqr','card','cod')),
	CONSTRAINT "payments_state_check" CHECK ("payments"."state" IN ('pending','paid','failed','expired','refunded','mismatch')),
	CONSTRAINT "payments_amount_check" CHECK ("payments"."amount" > 0),
	CONSTRAINT "payments_paid_at_check" CHECK (("payments"."state" = 'paid') = ("payments"."paid_at" IS NOT NULL)),
	CONSTRAINT "payments_target_required" CHECK ("payments"."order_id" IS NOT NULL OR "payments"."table_session_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "config_bundles" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "config_bundles_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"version" text NOT NULL,
	"payload" jsonb NOT NULL,
	"published_by" bigint,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parameter_history" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "parameter_history_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"key" text NOT NULL,
	"branch_id" text,
	"old_value" jsonb,
	"new_value" jsonb NOT NULL,
	"changed_by" bigint,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "parameters" (
	"key" text NOT NULL,
	"branch_id" text,
	"value" jsonb NOT NULL,
	"unit" text,
	"overridable" boolean DEFAULT true NOT NULL,
	"sensitive" boolean DEFAULT false NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "approvals" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "approvals_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text,
	"action" text NOT NULL,
	"requested_by" bigint NOT NULL,
	"approved_by" bigint NOT NULL,
	"reason" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "approvals_separation_of_duties" CHECK ("approvals"."requested_by" <> "approvals"."approved_by")
);
--> statement-breakpoint
CREATE TABLE "audit_log" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "audit_log_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text,
	"actor_kind" text NOT NULL,
	"actor_id" text,
	"action" text NOT NULL,
	"entity" text NOT NULL,
	"entity_id" text NOT NULL,
	"payload" jsonb,
	"approval_id" bigint,
	"device_id" bigint,
	"ip" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_log_actor_kind_check" CHECK ("audit_log"."actor_kind" IN ('staff','customer','device','system'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"key" text PRIMARY KEY NOT NULL,
	"actor" text NOT NULL,
	"endpoint" text NOT NULL,
	"request_hash" text NOT NULL,
	"response_status" integer,
	"response_body" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "journal_entries" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "journal_entries_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"kind" text NOT NULL,
	"order_id" bigint,
	"payment_id" bigint,
	"amount" bigint NOT NULL,
	"actor_id" bigint,
	"approval_id" bigint,
	"memo" text,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "journal_entries_kind_check" CHECK ("journal_entries"."kind" IN ('sale','discount','comp','void','refund','payment','shift_adjust'))
);
--> statement-breakpoint
CREATE TABLE "outbox_events" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "outbox_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text,
	"topic" text NOT NULL,
	"payload" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dispatched_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "devices" ADD CONSTRAINT "devices_paired_by_staff_id_fk" FOREIGN KEY ("paired_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pairing_codes" ADD CONSTRAINT "pairing_codes_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_device_id_devices_id_fk" FOREIGN KEY ("device_id") REFERENCES "public"."devices"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_cashier_id_staff_id_fk" FOREIGN KEY ("cashier_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "staff_roles" ADD CONSTRAINT "staff_roles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_availability" ADD CONSTRAINT "dish_availability_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_availability" ADD CONSTRAINT "dish_availability_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_availability" ADD CONSTRAINT "dish_availability_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_branch_overrides" ADD CONSTRAINT "dish_branch_overrides_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_branch_overrides" ADD CONSTRAINT "dish_branch_overrides_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_branch_overrides" ADD CONSTRAINT "dish_branch_overrides_station_grill_stations_id_fk" FOREIGN KEY ("station_grill") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_branch_overrides" ADD CONSTRAINT "dish_branch_overrides_station_no_grill_stations_id_fk" FOREIGN KEY ("station_no_grill") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_modifier_groups" ADD CONSTRAINT "dish_modifier_groups_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dish_modifier_groups" ADD CONSTRAINT "dish_modifier_groups_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_station_grill_stations_id_fk" FOREIGN KEY ("station_grill") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_station_no_grill_stations_id_fk" FOREIGN KEY ("station_no_grill") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_station_takeaway_stations_id_fk" FOREIGN KEY ("station_takeaway") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_station_delivery_stations_id_fk" FOREIGN KEY ("station_delivery") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dishes" ADD CONSTRAINT "dishes_secondary_station_stations_id_fk" FOREIGN KEY ("secondary_station") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modifier_options" ADD CONSTRAINT "modifier_options_group_id_modifier_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."modifier_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_group_items" ADD CONSTRAINT "set_group_items_group_id_set_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."set_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_group_items" ADD CONSTRAINT "set_group_items_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "set_groups" ADD CONSTRAINT "set_groups_set_dish_id_dishes_id_fk" FOREIGN KEY ("set_dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "areas" ADD CONSTRAINT "areas_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_requests" ADD CONSTRAINT "table_requests_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_requests" ADD CONSTRAINT "table_requests_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_requests" ADD CONSTRAINT "table_requests_handled_by_staff_id_fk" FOREIGN KEY ("handled_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_table_id_tables_id_fk" FOREIGN KEY ("table_id") REFERENCES "public"."tables"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_opened_by_staff_id_fk" FOREIGN KEY ("opened_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "table_sessions" ADD CONSTRAINT "table_sessions_closed_by_staff_id_fk" FOREIGN KEY ("closed_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tables" ADD CONSTRAINT "tables_area_id_areas_id_fk" FOREIGN KEY ("area_id") REFERENCES "public"."areas"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "display_counters" ADD CONSTRAINT "display_counters_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_batches" ADD CONSTRAINT "order_batches_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_batches" ADD CONSTRAINT "order_batches_fired_by_staff_id_fk" FOREIGN KEY ("fired_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_lines" ADD CONSTRAINT "order_lines_voided_by_staff_id_fk" FOREIGN KEY ("voided_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_ticket_id_tickets_id_fk" FOREIGN KEY ("ticket_id") REFERENCES "public"."tickets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ticket_items" ADD CONSTRAINT "ticket_items_dish_id_dishes_id_fk" FOREIGN KEY ("dish_id") REFERENCES "public"."dishes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tickets" ADD CONSTRAINT "tickets_station_id_stations_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."stations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_payment_id_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."payments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_lines" ADD CONSTRAINT "payment_lines_order_line_id_order_lines_id_fk" FOREIGN KEY ("order_line_id") REFERENCES "public"."order_lines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_table_session_id_table_sessions_id_fk" FOREIGN KEY ("table_session_id") REFERENCES "public"."table_sessions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payments" ADD CONSTRAINT "payments_shift_id_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."shifts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_bundles" ADD CONSTRAINT "config_bundles_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "config_bundles" ADD CONSTRAINT "config_bundles_published_by_staff_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parameter_history" ADD CONSTRAINT "parameter_history_changed_by_staff_id_fk" FOREIGN KEY ("changed_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parameters" ADD CONSTRAINT "parameters_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parameters" ADD CONSTRAINT "parameters_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_requested_by_staff_id_fk" FOREIGN KEY ("requested_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "approvals" ADD CONSTRAINT "approvals_approved_by_staff_id_fk" FOREIGN KEY ("approved_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_actor_id_staff_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "devices_branch_idx" ON "devices" USING btree ("branch_id","kind");--> statement-breakpoint
CREATE INDEX "shifts_branch_idx" ON "shifts" USING btree ("branch_id","business_date");--> statement-breakpoint
CREATE UNIQUE INDEX "staff_roles_unique" ON "staff_roles" USING btree ("staff_id","role_code",coalesce("branch_id", '*'));--> statement-breakpoint
CREATE INDEX "dishes_category_idx" ON "dishes" USING btree ("category_id","sort");--> statement-breakpoint
CREATE INDEX "table_requests_queue_idx" ON "table_requests" USING btree ("branch_id","created_at") WHERE state = 'open';--> statement-breakpoint
CREATE UNIQUE INDEX "table_sessions_one_live_per_table" ON "table_sessions" USING btree ("table_id") WHERE status <> 'closed';--> statement-breakpoint
CREATE INDEX "table_sessions_branch_idx" ON "table_sessions" USING btree ("branch_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "tables_branch_code_unique" ON "tables" USING btree ("branch_id","code");--> statement-breakpoint
CREATE INDEX "order_lines_order_idx" ON "order_lines" USING btree ("order_id","batch_no");--> statement-breakpoint
CREATE INDEX "order_lines_parent_idx" ON "order_lines" USING btree ("parent_line_id");--> statement-breakpoint
CREATE INDEX "orders_dispatch_idx" ON "orders" USING btree ("branch_id","status","created_at") WHERE status NOT IN ('done','cancelled');--> statement-breakpoint
CREATE INDEX "orders_branch_date_idx" ON "orders" USING btree ("branch_id","business_date");--> statement-breakpoint
CREATE INDEX "orders_table_session_idx" ON "orders" USING btree ("table_session_id");--> statement-breakpoint
CREATE INDEX "ticket_items_ticket_idx" ON "ticket_items" USING btree ("ticket_id");--> statement-breakpoint
CREATE INDEX "ticket_items_link_group_idx" ON "ticket_items" USING btree ("link_group");--> statement-breakpoint
CREATE INDEX "tickets_station_queue_idx" ON "tickets" USING btree ("branch_id","station_id","state","opened_at");--> statement-breakpoint
CREATE INDEX "tickets_order_idx" ON "tickets" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "tickets_live_idx" ON "tickets" USING btree ("branch_id","state") WHERE state IN ('waiting','queued','cooking');--> statement-breakpoint
CREATE UNIQUE INDEX "payment_lines_one_live_claim" ON "payment_lines" USING btree ("order_line_id") WHERE live = 'yes';--> statement-breakpoint
CREATE INDEX "payment_lines_payment_idx" ON "payment_lines" USING btree ("payment_id");--> statement-breakpoint
CREATE INDEX "payments_branch_state_idx" ON "payments" USING btree ("branch_id","state","created_at");--> statement-breakpoint
CREATE INDEX "payments_session_idx" ON "payments" USING btree ("table_session_id");--> statement-breakpoint
CREATE INDEX "payments_pending_idx" ON "payments" USING btree ("branch_id","created_at") WHERE state IN ('pending','mismatch');--> statement-breakpoint
CREATE UNIQUE INDEX "config_bundles_branch_version_unique" ON "config_bundles" USING btree ("branch_id","version");--> statement-breakpoint
CREATE INDEX "config_bundles_latest_idx" ON "config_bundles" USING btree ("branch_id","id");--> statement-breakpoint
CREATE INDEX "parameter_history_key_idx" ON "parameter_history" USING btree ("key","changed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "parameters_key_scope_unique" ON "parameters" USING btree ("key",coalesce("branch_id", '*'));--> statement-breakpoint
CREATE INDEX "approvals_entity_idx" ON "approvals" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "audit_log_branch_time_idx" ON "audit_log" USING btree ("branch_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_log_entity_idx" ON "audit_log" USING btree ("entity","entity_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_created_idx" ON "idempotency_keys" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "journal_entries_branch_date_idx" ON "journal_entries" USING btree ("branch_id","business_date");--> statement-breakpoint
CREATE INDEX "outbox_events_branch_idx" ON "outbox_events" USING btree ("branch_id","id");--> statement-breakpoint
CREATE INDEX "outbox_events_undispatched_idx" ON "outbox_events" USING btree ("id") WHERE dispatched_at IS NULL;