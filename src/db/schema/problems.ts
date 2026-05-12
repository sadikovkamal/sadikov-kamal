import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  index,
  uniqueIndex,
  check,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";
import { users } from "./users";
import { sources, topics } from "./taxonomy";
import { importBatches } from "./imports";

export const problems = pgTable(
  "problems",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    bodyMd: text("body_md").notNull(),
    solutionMd: text("solution_md"),
    answer: text("answer"),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => sources.id, { onDelete: "restrict" }),
    year: integer("year"),
    problemNumber: text("problem_number"), // text because "Day 2 / 3" is valid
    createdBy: uuid("created_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    importBatchId: uuid("import_batch_id").references(() => importBatches.id, {
      onDelete: "set null",
    }),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("problems_source_year_idx").on(t.sourceId, t.year),
    // Full-text search index on body_md (Uzbek content -> 'simple' config)
    index("problems_body_fts_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.bodyMd})`
    ),
    // Prevent duplicate problems from the same source/year/number combo
    uniqueIndex("problems_source_year_number_unique")
      .on(t.sourceId, t.year, t.problemNumber)
      .where(sql`${t.problemNumber} IS NOT NULL`),
    check(
      "problems_year_check",
      sql`${t.year} IS NULL OR (${t.year} >= 1900 AND ${t.year} <= 2100)`
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

export const problemClasses = pgTable(
  "problem_classes",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    classNumber: integer("class_number").notNull(), // 5..11
  },
  (t) => [
    primaryKey({ columns: [t.problemId, t.classNumber] }),
    check(
      "problem_classes_class_check",
      sql`${t.classNumber} >= 5 AND ${t.classNumber} <= 11`
    ),
  ]
);

export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type Image = typeof images.$inferSelect;
export type NewImage = typeof images.$inferInsert;
export type ProblemTopic = typeof problemTopics.$inferSelect;
export type ProblemClass = typeof problemClasses.$inferSelect;
