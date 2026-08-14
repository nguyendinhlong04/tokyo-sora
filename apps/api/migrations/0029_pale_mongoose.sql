CREATE TABLE "recipe_docs" (
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"method_kind" text NOT NULL,
	"yield_label" text,
	"plate_label" text,
	"prep_minutes" integer DEFAULT 0 NOT NULL,
	"equipment" text[] DEFAULT '{}' NOT NULL,
	"input_spec" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spec_measured" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"spec_sensory" text[] DEFAULT '{}' NOT NULL,
	"ccp" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"storage" text,
	"tips" text[] DEFAULT '{}' NOT NULL,
	"pitfalls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"substitute_ids" text[] DEFAULT '{}' NOT NULL,
	"updated_by" bigint,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "recipe_docs_subject_kind_subject_id_pk" PRIMARY KEY("subject_kind","subject_id"),
	CONSTRAINT "recipe_docs_kind_check" CHECK ("recipe_docs"."subject_kind" IN ('dish','prep')),
	CONSTRAINT "recipe_docs_method_check" CHECK ("recipe_docs"."method_kind" IN ('song','nuong','nau','lap_rap')),
	CONSTRAINT "recipe_docs_prep_minutes_check" CHECK ("recipe_docs"."prep_minutes" >= 0)
);
--> statement-breakpoint
CREATE TABLE "recipe_steps" (
	"subject_kind" text NOT NULL,
	"subject_id" text NOT NULL,
	"phase" text NOT NULL,
	"sort" integer NOT NULL,
	"text" text NOT NULL,
	"seconds" integer,
	"param_label" text,
	"ingredient_ids" text[] DEFAULT '{}' NOT NULL,
	"is_ccp" boolean DEFAULT false NOT NULL,
	CONSTRAINT "recipe_steps_subject_kind_subject_id_phase_sort_pk" PRIMARY KEY("subject_kind","subject_id","phase","sort"),
	CONSTRAINT "recipe_steps_phase_check" CHECK ("recipe_steps"."phase" IN ('so_che','che_bien','hoan_thien')),
	CONSTRAINT "recipe_steps_sort_check" CHECK ("recipe_steps"."sort" >= 0),
	CONSTRAINT "recipe_steps_seconds_check" CHECK ("recipe_steps"."seconds" IS NULL OR "recipe_steps"."seconds" > 0)
);
--> statement-breakpoint
ALTER TABLE "recipe_docs" ADD CONSTRAINT "recipe_docs_updated_by_staff_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."staff"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_doc_fk" FOREIGN KEY ("subject_kind","subject_id") REFERENCES "public"."recipe_docs"("subject_kind","subject_id") ON DELETE cascade ON UPDATE no action;