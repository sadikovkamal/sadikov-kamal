import {
  pgTable,
  uuid,
  text,
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
  },
  (t) => [index("sources_slug_idx").on(t.slug)]
);

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
