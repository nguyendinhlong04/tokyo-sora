CREATE TABLE "org_document_counters" (
	"kind" text NOT NULL,
	"period" date NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "org_document_counters_kind_period_pk" PRIMARY KEY("kind","period")
);
--> statement-breakpoint
CREATE TABLE "org_document_receipts" (
	"document_id" bigint NOT NULL,
	"staff_id" bigint NOT NULL,
	"read_at" timestamp with time zone,
	"acked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_document_receipts_document_id_staff_id_pk" PRIMARY KEY("document_id","staff_id"),
	CONSTRAINT "org_document_receipts_ack_check" CHECK ("org_document_receipts"."acked_at" IS NULL OR "org_document_receipts"."read_at" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "org_documents" (
	"id" bigint PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "org_documents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"kind" text NOT NULL,
	"decision_type" text,
	"number" text,
	"title" text NOT NULL,
	"body" text NOT NULL,
	"attachments" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"targets" jsonb NOT NULL,
	"changes" jsonb,
	"requires_ack" boolean DEFAULT false NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"state" text DEFAULT 'draft' NOT NULL,
	"author_id" bigint NOT NULL,
	"signer_id" bigint,
	"return_note" text,
	"signed_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"revoked_by" bigint,
	"revoke_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "org_documents_number_unique" UNIQUE("number"),
	CONSTRAINT "org_documents_kind_check" CHECK ("org_documents"."kind" IN ('thong-bao','quyet-dinh','quy-dinh')),
	CONSTRAINT "org_documents_decision_type_check" CHECK (("org_documents"."kind" = 'quyet-dinh' AND "org_documents"."decision_type"
           IN ('bo-nhiem','dieu-chuyen','mien-nhiem','khen-thuong','ky-luat','khac'))
          OR ("org_documents"."kind" <> 'quyet-dinh' AND "org_documents"."decision_type" IS NULL)),
	CONSTRAINT "org_documents_changes_check" CHECK (("org_documents"."changes" IS NOT NULL)
          = (coalesce("org_documents"."decision_type", '') IN ('bo-nhiem','dieu-chuyen','mien-nhiem'))),
	CONSTRAINT "org_documents_json_check" CHECK (jsonb_typeof("org_documents"."targets") = 'array' AND jsonb_typeof("org_documents"."attachments") = 'array'
          AND ("org_documents"."changes" IS NULL OR jsonb_typeof("org_documents"."changes") = 'array')),
	CONSTRAINT "org_documents_effective_check" CHECK ("org_documents"."effective_to" IS NULL OR "org_documents"."effective_to" >= "org_documents"."effective_from"),
	CONSTRAINT "org_documents_state_check" CHECK ("org_documents"."state" IN ('draft','pending','issued','revoked')),
	CONSTRAINT "org_documents_signer_check" CHECK ("org_documents"."state" = 'draft' OR "org_documents"."signer_id" IS NOT NULL),
	CONSTRAINT "org_documents_issued_check" CHECK (("org_documents"."state" IN ('issued','revoked')) = ("org_documents"."number" IS NOT NULL AND "org_documents"."signed_at" IS NOT NULL)),
	CONSTRAINT "org_documents_revoked_check" CHECK (("org_documents"."state" = 'revoked')
          = ("org_documents"."revoked_at" IS NOT NULL AND "org_documents"."revoked_by" IS NOT NULL AND "org_documents"."revoke_reason" IS NOT NULL))
);
--> statement-breakpoint
ALTER TABLE "org_document_receipts" ADD CONSTRAINT "org_document_receipts_document_id_org_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."org_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_document_receipts" ADD CONSTRAINT "org_document_receipts_staff_id_staff_id_fk" FOREIGN KEY ("staff_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_documents" ADD CONSTRAINT "org_documents_author_id_staff_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_documents" ADD CONSTRAINT "org_documents_signer_id_staff_id_fk" FOREIGN KEY ("signer_id") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_documents" ADD CONSTRAINT "org_documents_revoked_by_staff_id_fk" FOREIGN KEY ("revoked_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "org_document_receipts_unread_idx" ON "org_document_receipts" USING btree ("staff_id") WHERE read_at IS NULL;--> statement-breakpoint
CREATE INDEX "org_documents_state_idx" ON "org_documents" USING btree ("state","created_at");--> statement-breakpoint
CREATE INDEX "org_documents_to_sign_idx" ON "org_documents" USING btree ("signer_id") WHERE state = 'pending';--> statement-breakpoint
ALTER TABLE "position_assignments" ADD CONSTRAINT "position_assignments_document_id_org_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "public"."org_documents"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "position_assignments" ADD CONSTRAINT "position_assignments_end_document_id_org_documents_id_fk" FOREIGN KEY ("end_document_id") REFERENCES "public"."org_documents"("id") ON DELETE no action ON UPDATE no action;