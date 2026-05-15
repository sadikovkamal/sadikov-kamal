import {
  pgTable,
  uuid,
  text,
  integer,
  pgEnum,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const sourceKindEnum = pgEnum("source_kind", [
  "olympiad",
  "book",
  "course",
  "other",
]);

export const topics = pgTable(
  "topics",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    parentId: uuid("parent_id").references((): AnyPgColumn => topics.id, {
      onDelete: "set null",
    }),
    description: text("description"),
  },
  (t) => [
    index("topics_slug_idx").on(t.slug),
    index("topics_parent_id_idx").on(t.parentId),
  ]
);

export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    kind: sourceKindEnum("kind").notNull().default("olympiad"),
    country: text("country"),
    // Self-referential parent. Mirrors the topics hierarchy: groups like
    // "IMO" → "IMO 2020", "IMO Shortlist", or "DTM" → individual years.
    // ON DELETE SET NULL so removing a parent group leaves its children
    // intact as roots (admin can re-parent them).
    parentId: uuid("parent_id").references((): AnyPgColumn => sources.id, {
      onDelete: "set null",
    }),
  },
  (t) => [
    index("sources_slug_idx").on(t.slug),
    index("sources_parent_id_idx").on(t.parentId),
  ]
);

/**
 * Flat age-band classification (e.g. "Boshlang'ich", "O'rta", "Yuqori",
 * or olimpiada-style cohorts). No parent/child — kept deliberately simple.
 * Order is admin-controlled via `sortOrder` so the UI can list them in a
 * meaningful sequence rather than alphabetical.
 */
export const ageCategories = pgTable(
  "age_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    description: text("description"),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [index("age_categories_slug_idx").on(t.slug)]
);

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type AgeCategory = typeof ageCategories.$inferSelect;
export type NewAgeCategory = typeof ageCategories.$inferInsert;
