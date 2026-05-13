import { sql } from "drizzle-orm";
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
    /**
     * Human-readable stable code, format `T######` (six digits zero-padded).
     * Sequential within the table — never reused, never re-assigned. Admins
     * use this in conversation ("masalan, T000042"); the code stays stable
     * even if the name is renamed. Width supports up to 999,999 topics
     * before the digits naturally overflow.
     */
    code: text("code").notNull().unique(),
    /**
     * Display name. Not globally unique — generic labels like "Boshqa"
     * are allowed to appear under multiple parents. The case-insensitive
     * lookup at import time still works because we narrow by parent or
     * accept any match for free-form rows; for stable lookups, code is
     * the authoritative handle.
     */
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => topics.id, {
      onDelete: "set null",
    }),
    description: text("description"),
  },
  (t) => [
    index("topics_code_idx").on(t.code),
    index("topics_parent_id_idx").on(t.parentId),
    index("topics_name_lower_idx").on(sql`lower(${t.name})`),
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
