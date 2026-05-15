# Phase 1 — Database Schema

**Goal:** Define the full database schema in Drizzle, generate and run
migrations, seed essential reference data (default topics, sources, etc.),
and confirm everything works through Drizzle Studio.

**Estimated time:** 1 session (~3 hours)

---

## What you'll have at the end

- 11 tables defined in Drizzle schema files (split by domain)
- Migration SQL generated and applied to the local DB
- Seed script that populates default topics, sources, and creates
  the first admin user
- Generated TypeScript types you can import anywhere
- Drizzle Studio shows all tables and seeded data

---

## Schema overview

### Core entity tables

| Table | Purpose |
|---|---|
| `users` | Auth identities (admins now, students later) |
| `sessions` | Active login sessions (server-side, revocable) |
| `problems` | The main problem records |
| `topics` | Hierarchical math topics (algebra > inequalities > AM-GM) |
| `sources` | Olympiads, books, courses where problems come from |
| `tags` | Free-form labels (induction, vieta, pigeonhole) |
| `images` | Problem images stored in R2 |

### Junction (M:N) tables

| Table | Joins |
|---|---|
| `problem_topics` | problems ↔ topics |
| `problem_tags` | problems ↔ tags |
| `problem_classes` | problems ↔ class numbers (5–11) |

### Operational tables

| Table | Purpose |
|---|---|
| `import_batches` | Audit trail of bulk imports |

---

## Steps

### 1.1. Schema file structure

We split the schema into domain files, all re-exported from
`src/db/schema/index.ts`:

```
src/db/schema/
├── index.ts          (re-exports everything)
├── users.ts          (users, sessions)
├── taxonomy.ts       (topics, sources, tags)
├── problems.ts       (problems, images, junction tables)
└── imports.ts        (import_batches)
```

### 1.2. `src/db/schema/users.ts`

```typescript
import {
  pgTable,
  uuid,
  text,
  timestamp,
  pgEnum,
  index,
} from "drizzle-orm/pg-core";

export const userRoleEnum = pgEnum("user_role", ["super_admin", "admin"]);

export const users = pgTable(
  "users",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    email: text("email").notNull().unique(),
    passwordHash: text("password_hash").notNull(),
    fullName: text("full_name").notNull(),
    role: userRoleEnum("role").notNull().default("admin"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    emailIdx: index("users_email_idx").on(t.email),
  })
);

export const sessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(), // random 256-bit token, base64
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => ({
    userIdx: index("sessions_user_id_idx").on(t.userId),
    expiresIdx: index("sessions_expires_at_idx").on(t.expiresAt),
  })
);

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
```

### 1.3. `src/db/schema/taxonomy.ts`

```typescript
import {
  pgTable,
  uuid,
  text,
  pgEnum,
  index,
  AnyPgColumn,
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
  (t) => ({
    slugIdx: index("topics_slug_idx").on(t.slug),
    parentIdx: index("topics_parent_id_idx").on(t.parentId),
  })
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
  (t) => ({
    slugIdx: index("sources_slug_idx").on(t.slug),
  })
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    name: text("name").notNull().unique(),
    slug: text("slug").notNull().unique(),
  },
  (t) => ({
    slugIdx: index("tags_slug_idx").on(t.slug),
  })
);

export type Topic = typeof topics.$inferSelect;
export type Source = typeof sources.$inferSelect;
export type Tag = typeof tags.$inferSelect;
```

### 1.4. `src/db/schema/problems.ts`

```typescript
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
import { sources, topics, tags } from "./taxonomy";
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
    difficulty: integer("difficulty").notNull(), // 1..5
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
  (t) => ({
    sourceYearIdx: index("problems_source_year_idx").on(t.sourceId, t.year),
    difficultyIdx: index("problems_difficulty_idx").on(t.difficulty),
    // Full-text search index on body_md
    bodyFtsIdx: index("problems_body_fts_idx").using(
      "gin",
      sql`to_tsvector('simple', ${t.bodyMd})`
    ),
    // Prevent duplicate problems from the same source/year
    sourceYearNumberUnique: uniqueIndex("problems_source_year_number_unique")
      .on(t.sourceId, t.year, t.problemNumber)
      .where(sql`${t.problemNumber} IS NOT NULL`),
    difficultyCheck: check(
      "problems_difficulty_check",
      sql`${t.difficulty} >= 1 AND ${t.difficulty} <= 5`
    ),
    yearCheck: check(
      "problems_year_check",
      sql`${t.year} IS NULL OR (${t.year} >= 1900 AND ${t.year} <= 2100)`
    ),
  })
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
  (t) => ({
    problemIdx: index("images_problem_id_idx").on(t.problemId),
  })
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
  (t) => ({
    pk: primaryKey({ columns: [t.problemId, t.topicId] }),
    topicIdx: index("problem_topics_topic_id_idx").on(t.topicId),
  })
);

export const problemTags = pgTable(
  "problem_tags",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "restrict" }),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.problemId, t.tagId] }),
    tagIdx: index("problem_tags_tag_id_idx").on(t.tagId),
  })
);

export const problemClasses = pgTable(
  "problem_classes",
  {
    problemId: uuid("problem_id")
      .notNull()
      .references(() => problems.id, { onDelete: "cascade" }),
    classNumber: integer("class_number").notNull(), // 5..11
  },
  (t) => ({
    pk: primaryKey({ columns: [t.problemId, t.classNumber] }),
    classCheck: check(
      "problem_classes_class_check",
      sql`${t.classNumber} >= 5 AND ${t.classNumber} <= 11`
    ),
  })
);

export type Problem = typeof problems.$inferSelect;
export type NewProblem = typeof problems.$inferInsert;
export type Image = typeof images.$inferSelect;
```

### 1.5. `src/db/schema/imports.ts`

```typescript
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
  (t) => ({
    uploadedByIdx: index("import_batches_uploaded_by_idx").on(t.uploadedBy),
    statusIdx: index("import_batches_status_idx").on(t.status),
  })
);

export type ImportBatch = typeof importBatches.$inferSelect;
```

### 1.6. `src/db/schema/index.ts`

```typescript
export * from "./users";
export * from "./taxonomy";
export * from "./problems";
export * from "./imports";
```

### 1.7. Generate the migration

```bash
npm run db:generate
```

This creates a SQL file in `src/db/migrations/`. Inspect it — it should
have all `CREATE TABLE`, `CREATE INDEX`, `CREATE TYPE` statements.

### 1.8. Apply the migration

```bash
npm run db:migrate
```

Confirm with Drizzle Studio:

```bash
npm run db:studio
```

You should see all 11 tables in the sidebar.

### 1.9. Seed script

Create `src/db/seed.ts`:

```typescript
import "dotenv/config";
import { db } from "./index";
import { users, topics, sources, tags } from "./schema";
import bcrypt from "bcryptjs";

async function seed() {
  console.log("Seeding database...");

  // 1. First admin user
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? "admin@example.com";
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? "ChangeMe123!";
  const adminName = process.env.SEED_ADMIN_NAME ?? "Admin";

  const passwordHash = await bcrypt.hash(adminPassword, 12);

  await db
    .insert(users)
    .values({
      email: adminEmail,
      passwordHash,
      fullName: adminName,
      role: "super_admin",
    })
    .onConflictDoNothing({ target: users.email });

  console.log(`Admin user: ${adminEmail} / ${adminPassword}`);

  // 2. Default top-level topics (Uzbek + slug)
  const topicData = [
    { name: "Algebra", slug: "algebra" },
    { name: "Geometriya", slug: "geometry" },
    { name: "Sonlar nazariyasi", slug: "number-theory" },
    { name: "Kombinatorika", slug: "combinatorics" },
    { name: "Tengsizliklar", slug: "inequalities" },
    { name: "Funksional tenglamalar", slug: "functional-equations" },
  ];
  await db.insert(topics).values(topicData).onConflictDoNothing({
    target: topics.slug,
  });

  // 3. Default sources
  const sourceData = [
    { name: "IMO", slug: "imo", kind: "olympiad" as const },
    { name: "IMO Shortlist", slug: "imo-shortlist", kind: "olympiad" as const },
    {
      name: "Respublika olimpiadasi",
      slug: "uzbekistan-national",
      kind: "olympiad" as const,
      country: "UZ",
    },
    {
      name: "Hudud olimpiadasi",
      slug: "regional-olympiad",
      kind: "olympiad" as const,
      country: "UZ",
    },
    { name: "Boshqa", slug: "other", kind: "other" as const },
  ];
  await db.insert(sources).values(sourceData).onConflictDoNothing({
    target: sources.slug,
  });

  // 4. A few starter tags
  const tagData = [
    { name: "induction", slug: "induction" },
    { name: "vieta", slug: "vieta" },
    { name: "pigeonhole", slug: "pigeonhole" },
    { name: "AM-GM", slug: "am-gm" },
    { name: "Cauchy-Schwarz", slug: "cauchy-schwarz" },
  ];
  await db.insert(tags).values(tagData).onConflictDoNothing({
    target: tags.slug,
  });

  console.log("Seed complete.");
  process.exit(0);
}

seed().catch((e) => {
  console.error("Seed failed:", e);
  process.exit(1);
});
```

Install bcrypt and dotenv:

```bash
npm install bcryptjs
npm install -D @types/bcryptjs tsx dotenv
```

Add a script to `package.json`:

```json
{
  "scripts": {
    "db:seed": "tsx src/db/seed.ts"
  }
}
```

Run it:

```bash
npm run db:seed
```

### 1.10. Verify in Drizzle Studio

Open `npm run db:studio`. Check:
- `users` has 1 row (the admin)
- `topics` has 6 rows
- `sources` has 5 rows
- `tags` has 5 rows
- All other tables exist but are empty

### 1.11. Add a typed db helper (optional nicety)

Update `src/db/index.ts` to attach the schema for typed relations:

```typescript
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

const connectionString = process.env.DATABASE_URL!;

declare global {
  // eslint-disable-next-line no-var
  var _pgClient: ReturnType<typeof postgres> | undefined;
}

const client = global._pgClient ?? postgres(connectionString, { max: 10 });
if (process.env.NODE_ENV !== "production") global._pgClient = client;

export const db = drizzle(client, { schema });
```

Now `db.query.problems.findMany(...)` is fully typed.

---

## File structure changes

```
src/db/
├── index.ts                (updated with schema)
├── seed.ts                 (new)
├── schema/
│   ├── index.ts            (re-exports)
│   ├── users.ts            (new)
│   ├── taxonomy.ts         (new)
│   ├── problems.ts         (new)
│   └── imports.ts          (new)
└── migrations/
    ├── 0000_xxxxx.sql      (generated)
    └── meta/
        ├── _journal.json
        └── 0000_snapshot.json
```

---

## Acceptance criteria

- [ ] `npm run db:generate` produces a migration file with no errors
- [ ] `npm run db:migrate` applies the migration successfully
- [ ] Drizzle Studio shows all 11 tables (`users`, `sessions`, `topics`,
      `sources`, `tags`, `problems`, `images`, `problem_topics`,
      `problem_tags`, `problem_classes`, `import_batches`)
- [ ] `npm run db:seed` runs successfully and creates the admin + reference data
- [ ] In `psql`, the FTS index is visible:
      `\d problems` shows `problems_body_fts_idx`
- [ ] All exported types (`Problem`, `User`, etc.) are importable in TS files
      without errors

---

## Common pitfalls

- **Self-referential FK in `topics.parent_id`** — Drizzle needs the
  `(): AnyPgColumn => topics.id` lazy reference. Don't try to use a normal
  reference, it'll break compile.
- **`uniqueIndex` with `WHERE` clause** — the partial unique index on
  `(source_id, year, problem_number)` only applies when `problem_number` is
  not null. This is intentional so problems without a number can coexist.
- **bcrypt vs bcryptjs** — we use `bcryptjs` (pure JS, no native build).
  Slower but no install issues across platforms. For a 12-cost hash this is
  fine for an admin login flow.
- **`pgEnum` migration after first create** — once an enum exists, adding
  values requires a special migration. For now we don't need to change
  enums; if you do later, look up `ALTER TYPE ... ADD VALUE`.
- **Forgot `to_tsvector` config** — we use `'simple'` not `'english'` because
  problems are in Uzbek. `'simple'` skips stemming/stopwords, which is what
  we want for math content. If you ever need real Uzbek stemming, install
  the `pg_simdic` extension or similar — but that's a future concern.

---

## Notes on schema decisions

**Why `text` for `problem_number`?** Real problems have numbers like
"P3", "Day 2 / 3", "A1" (shortlist). Forcing integer would lose info.

**Why `restrict` on FKs to `sources` and `users`?** You shouldn't be able
to delete a source while problems still reference it — that would orphan
data silently. `restrict` forces you to deal with the problems first.

**Why `cascade` on `problem_id` FK in junction tables?** When a problem is
deleted, its topic/tag/class associations should disappear automatically.

**Why `set null` on `import_batch_id`?** If you delete an import batch
record, the imported problems should still exist — just lose the back-reference.

**Why JSONB `metadata`?** Future-proofing. Want to add `videoSolutionUrl`
in 6 months? Just write to `metadata.videoSolutionUrl`. No migration needed.
For fields that get queried often, promote them to real columns later.

---

## Next phase

→ [Phase 2 — Auth and Admin Guard](./phase-02-auth-and-admin-guard.md)
