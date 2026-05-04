CREATE TABLE "login_attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"attempted_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "login_attempts_identifier_idx" ON "login_attempts" USING btree ("identifier");--> statement-breakpoint
CREATE INDEX "login_attempts_time_idx" ON "login_attempts" USING btree ("attempted_at");