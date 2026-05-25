import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { sources, topics, ageCategories, methods } from "./taxonomy";

export const problems = pgTable(
  "problems",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    /**
     * Human-facing stable code in `P#######` format (P + 7 zero-padded
     * digits — P0000001, P0000042, P0001234, …). Auto-assigned at
     * create time by reading max(code) and incrementing; UNIQUE on the
     * column turns concurrent inserts that race for the same code into
     * a clean retryable error. Mirrors the topics/sources/age-categories
     * pattern, just with a 7-digit tail to leave room for millions of
     * problems.
     */
    code: text("code").notNull().unique(),
    bodyMd: text("body_md").notNull(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("problems_source_idx").on(t.sourceId),
    index("problems_code_idx").on(t.code),
    // Full-text search index on body_md (Uzbek content -> 'simple' config)
    index("problems_body_fts_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.bodyMd})`
    ),
  ]
);

export const images = pgTable(
  "images",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    storageKey: text("storage_key").notNull(), // R2 object key
    originalFilename: text("original_filename").notNull(),
    altText: text("alt_text"),
    sizeBytes: integer("size_bytes").notNull(),
    mimeType: text("mime_type").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("images_problem_id_idx").on(t.problemId)]
);

export const problemTopics = pgTable(
  "problem_topics",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    topicId: uuid("topic_id")
      .notNull()
      .references(() => topics.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.topicId] }),
    index("problem_topics_topic_id_idx").on(t.topicId),
  ]
);

/**
 * Junction table linking problems to age categories. Replaces the older
 * `problem_classes` integer-range table — age buckets are now an
 * admin-editable taxonomy ({@link ageCategories}) instead of a hard
 * 5..11 CHECK constraint, so the FK does all the validation work.
 *
 * `onDelete: "restrict"` on the age-category side mirrors topics: an
 * admin can't delete a bucket while problems still reference it. The
 * action layer surfaces that as a friendly error.
 */
export const problemAgeCategories = pgTable(
  "problem_age_categories",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    ageCategoryId: uuid("age_category_id")
      .notNull()
      .references(() => ageCategories.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.ageCategoryId] }),
    index("problem_age_categories_age_category_id_idx").on(t.ageCategoryId),
  ]
);

/**
 * Junction table linking problems to methods. Same shape and FK semantics
 * as `problemTopics`: `ON DELETE CASCADE` on the problem side so deleting
 * a problem drops its method links automatically; `ON DELETE RESTRICT` on
 * the method side so an admin can't delete a method that's still in use
 * (the action layer surfaces that as a friendly error).
 *
 * Methods are optional per problem — empty set is valid, unlike topics
 * which require ≥ 1.
 */
export const problemMethods = pgTable(
  "problem_methods",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    methodId: uuid("method_id")
      .notNull()
      .references(() => methods.id, { onDelete: "restrict" }),
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.methodId] }),
    index("problem_methods_method_id_idx").on(t.methodId),
  ]
);

export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
export type ProblemTopic = typeof problemTopics.$inferSelect;
export type ProblemAgeCategory = typeof problemAgeCategories.$inferSelect;
export type ProblemMethod = typeof problemMethods.$inferSelect;
