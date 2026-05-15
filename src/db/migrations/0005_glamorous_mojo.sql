ALTER TABLE "sources" ADD COLUMN "parent_id" uuid;--> statement-breakpoint
ALTER TABLE "sources" ADD CONSTRAINT "sources_parent_id_sources_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."sources"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "sources_parent_id_idx" ON "sources" USING btree ("parent_id");