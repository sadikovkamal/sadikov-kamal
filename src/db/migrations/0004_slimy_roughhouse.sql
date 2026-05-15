CREATE TABLE "age_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "age_categories_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "problem_age_categories" (
	"problem_id" uuid NOT NULL,
	"age_category_id" uuid NOT NULL,
	CONSTRAINT "problem_age_categories_problem_id_age_category_id_pk" PRIMARY KEY("problem_id","age_category_id")
);
--> statement-breakpoint
ALTER TABLE "problem_age_categories" ADD CONSTRAINT "problem_age_categories_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "problem_age_categories" ADD CONSTRAINT "problem_age_categories_age_category_id_age_categories_id_fk" FOREIGN KEY ("age_category_id") REFERENCES "public"."age_categories"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "age_categories_slug_idx" ON "age_categories" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "problem_age_categories_age_category_id_idx" ON "problem_age_categories" USING btree ("age_category_id");