CREATE TABLE "invoices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "invoices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"order_id" bigint NOT NULL,
	"serial" text NOT NULL,
	"invoice_no" text,
	"tax_code" text,
	"state" text DEFAULT 'pending' NOT NULL,
	"last_error" text,
	"buyer_name" text,
	"buyer_tax_code" text,
	"amount_sub" bigint NOT NULL,
	"amount_vat" bigint NOT NULL,
	"amount_total" bigint NOT NULL,
	"replaces_id" bigint,
	"void_reason" text,
	"approval_id" bigint,
	"issued_at" timestamp with time zone,
	"issued_by" bigint,
	"business_date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invoices_state_check" CHECK ("invoices"."state" IN ('pending','issued','failed','voided','replaced')),
	CONSTRAINT "invoices_issued_check" CHECK ("invoices"."state" <> 'issued'
       OR ("invoices"."invoice_no" IS NOT NULL AND "invoices"."tax_code" IS NOT NULL AND "invoices"."issued_at" IS NOT NULL)),
	CONSTRAINT "invoices_void_check" CHECK ("invoices"."state" <> 'voided' OR ("invoices"."void_reason" IS NOT NULL AND "invoices"."approval_id" IS NOT NULL)),
	CONSTRAINT "invoices_amount_check" CHECK ("invoices"."amount_total" >= 0 AND "invoices"."amount_vat" >= 0)
);
--> statement-breakpoint
CREATE TABLE "period_locks" (
	"branch_id" text NOT NULL,
	"month" date NOT NULL,
	"locked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_by" bigint,
	"note" text,
	CONSTRAINT "period_locks_branch_id_month_pk" PRIMARY KEY("branch_id","month")
);
--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_approval_id_approvals_id_fk" FOREIGN KEY ("approval_id") REFERENCES "public"."approvals"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invoices" ADD CONSTRAINT "invoices_issued_by_staff_id_fk" FOREIGN KEY ("issued_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "period_locks" ADD CONSTRAINT "period_locks_locked_by_staff_id_fk" FOREIGN KEY ("locked_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_one_live_per_order" ON "invoices" USING btree ("order_id") WHERE state IN ('pending','issued','failed');--> statement-breakpoint
CREATE UNIQUE INDEX "invoices_serial_number_unique" ON "invoices" USING btree ("serial","invoice_no") WHERE invoice_no IS NOT NULL;--> statement-breakpoint
CREATE INDEX "invoices_branch_date_idx" ON "invoices" USING btree ("branch_id","business_date");--> statement-breakpoint
CREATE INDEX "invoices_queue_idx" ON "invoices" USING btree ("branch_id","state") WHERE state IN ('pending','failed');