import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";
import { users } from "./users";

export const importStatusEnum = pgEnum("import_status", [
  "pending",
  "processing",
  "success",
  "partial",
  "failed",
]);

export const importBatches = pgTable(
  "import_batches",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    uploadedBy: uuid("uploaded_by")
      .notNull()
      .references(() => users.id, { onDelete: "restrict" }),
    filename: text("filename").notNull(),
    status: importStatusEnum("status").notNull().default("pending"),
    totalCount: integer("total_count").notNull().default(0),
    successCount: integer("success_count").notNull().default(0),
    errorLog: jsonb("error_log").notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    finishedAt: timestamp("finished_at", { withTimezone: true }),
  },
  (t) => [
    index("import_batches_uploaded_by_idx").on(t.uploadedBy),
    index("import_batches_status_idx").on(t.status),
  ]
);

export type ImportBatch = typeof importBatches.$inferSelect;
export type NewImportBatch = typeof importBatches.$inferInsert;
