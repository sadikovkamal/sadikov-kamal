import { sql } from "drizzle-orm";
import {
  pgTable,
  uuid,
  text,
  index,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

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

/**
 * Sources — olympiads, books, courses, etc. Same nested taxonomy shape
 * as `topics`: stable `S######` code + display `name` + self-referencing
 * `parent_id` so admins can group like
 *
 *   Olimpiadalar / IMO / IMO 2025
 *   Kitoblar     / Skanavi
 *
 * `kind` and `country` were dropped — those are now expressed by which
 * parent a source sits under. ON DELETE SET NULL on the FK matches
 * topics so deleting a parent orphans children rather than cascading.
 */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => sources.id, {
      onDelete: "set null",
    }),
    /**
     * Optional R2 object key (e.g. `sources/<uuid>/logo.png`). When set,
     * the explorer renders this image; when null, it falls back to a
     * deterministic abbreviation card.
     */
    logoStorageKey: text("logo_storage_key"),
    /**
     * Optional free-form admin notes — links, scope hints, anything
     * useful. Not shown on the explorer card itself; surfaced in the
     * info modal on demand to keep the grid scannable.
     */
    description: text("description"),
  },
  (t) => [
    index("sources_code_idx").on(t.code),
    index("sources_parent_id_idx").on(t.parentId),
    index("sources_name_lower_idx").on(sql`lower(${t.name})`),
  ]
);

/**
 * Age categories — flat taxonomy that replaces the old integer
 * `class_number` (5..11). The set is admin-editable: seed ships with
 * 1-sinf … 11-sinf + "Talaba", but admins can add new buckets
 * ("Professional", "Havaskor", …) without a migration.
 *
 * - `code` is the stable A###### handle (mirrors topics.code). Display
 *   order across the app sorts by `code`, so the seeded ladder appears
 *   in natural reading order and new entries land at the end. We don't
 *   carry an explicit sort_order column — admins reorder by renaming
 *   if they care; the auto-incrementing code keeps things stable.
 * - `name` is the display label ("9-sinf", "Talaba"). NOT unique because
 *   we want the same convenience as topics (e.g. multiple "Boshqa"
 *   variants in the future).
 */
export const ageCategories = pgTable(
  "age_categories",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    code: text("code").notNull().unique(),
    name: text("name").notNull(),
    description: text("description"),
  },
  (t) => [index("age_categories_code_idx").on(t.code)]
);

export type Topic = typeof topics.$inferSelect;
export type NewTopic = typeof topics.$inferInsert;
export type Source = typeof sources.$inferSelect;
export type NewSource = typeof sources.$inferInsert;
export type AgeCategory = typeof ageCategories.$inferSelect;
export type NewAgeCategory = typeof ageCategories.$inferInsert;
