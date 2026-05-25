-- Methods taxonomy (yechish metodi) — parallel of `topics`.
--
-- A problem can be solved with zero or more methods (induktsiya, qarama-qarshilik,
-- generating functions, …). Nested so admins can group families
-- ("Kombinatorika metodlari" → "Bijektsiya", "Inklyuziya–eksklyuziya").
--
-- Same shape and conventions as topics: stable `M######` code, name, optional
-- parent_id (ON DELETE SET NULL — parent removal orphans children, doesn't
-- cascade), optional description.
--
-- Junction `problem_methods` is ON DELETE CASCADE on the problem side
-- (problem deletion drops its method links) and ON DELETE RESTRICT on the
-- method side (deleting a method that's still in use fails — the action
-- layer surfaces it as a friendly error, same as topics).

CREATE TABLE "methods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "code" text NOT NULL UNIQUE,
  "name" text NOT NULL,
  "parent_id" uuid REFERENCES "methods"("id") ON DELETE SET NULL,
  "description" text
);
CREATE INDEX "methods_code_idx" ON "methods" ("code");
CREATE INDEX "methods_parent_id_idx" ON "methods" ("parent_id");
CREATE INDEX "methods_name_lower_idx" ON "methods" (lower("name"));

CREATE TABLE "problem_methods" (
  "problem_id" uuid NOT NULL REFERENCES "problems"("id") ON DELETE CASCADE,
  "method_id" uuid NOT NULL REFERENCES "methods"("id") ON DELETE RESTRICT,
  PRIMARY KEY ("problem_id", "method_id")
);
CREATE INDEX "problem_methods_method_id_idx" ON "problem_methods" ("method_id");
