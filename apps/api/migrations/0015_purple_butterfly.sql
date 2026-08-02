CREATE TABLE "input_invoices" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "input_invoices_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"branch_id" text NOT NULL,
	"voucher_id" bigint,
	"seller_name" text NOT NULL,
	"seller_tax_code" text NOT NULL,
	"invoice_no" text NOT NULL,
	"serial" text,
	"issued_on" date NOT NULL,
	"net_vnd" bigint NOT NULL,
	"vat_vnd" bigint DEFAULT 0 NOT NULL,
	"deductible" boolean DEFAULT true NOT NULL,
	"note" text,
	"created_by" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "input_invoices_amount_check" CHECK ("input_invoices"."net_vnd" > 0 AND "input_invoices"."vat_vnd" >= 0),
	CONSTRAINT "input_invoices_vat_check" CHECK ("input_invoices"."vat_vnd" <= "input_invoices"."net_vnd"),
	CONSTRAINT "input_invoices_tax_code_check" CHECK ("input_invoices"."seller_tax_code" ~ '^[0-9]{10}(-[0-9]{3})?$')
);
--> statement-breakpoint
ALTER TABLE "input_invoices" ADD CONSTRAINT "input_invoices_branch_id_branches_id_fk" FOREIGN KEY ("branch_id") REFERENCES "public"."branches"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_invoices" ADD CONSTRAINT "input_invoices_voucher_id_expense_vouchers_id_fk" FOREIGN KEY ("voucher_id") REFERENCES "public"."expense_vouchers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_invoices" ADD CONSTRAINT "input_invoices_created_by_staff_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "input_invoices_seller_no_unique" ON "input_invoices" USING btree ("seller_tax_code","invoice_no");--> statement-breakpoint
CREATE INDEX "input_invoices_branch_date_idx" ON "input_invoices" USING btree ("branch_id","issued_on");--> statement-breakpoint
CREATE INDEX "input_invoices_voucher_idx" ON "input_invoices" USING btree ("voucher_id");