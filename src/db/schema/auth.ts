import { pgTable, text, timestamp, index } from "drizzle-orm/pg-core";

/**
 * Per-identifier (IP or email) login attempt log used for rate limiting.
 *
 * Each failed/attempted login appends a row; the rate-limit check counts
 * rows for an identifier within a sliding window. A daily cron clears
 * rows older than 24h so the table stays tiny.
 */
export const loginAttempts = pgTable(
  "login_attempts",
  {
    id: text("id").primaryKey(), // 16 hex bytes from crypto.randomBytes
    identifier: text("identifier").notNull(), // "ip:1.2.3.4" or "email:foo@bar"
    attemptedAt: timestamp("attempted_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("login_attempts_identifier_idx").on(t.identifier),
    index("login_attempts_time_idx").on(t.attemptedAt),
  ]
);

export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type NewLoginAttempt = typeof loginAttempts.$inferInsert;
