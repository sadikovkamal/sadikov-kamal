# Provia — MVP Build Plan

> **Provia** — math olympiad problem database platform for Uzbekistan and beyond.
> The name comes from "prove" + "via" (path) — *the path to proof*.

A step-by-step plan to build the platform.

## Goal

Build a platform where **only admins** can add and view math olympiad problems.
The MVP focuses on getting a high-quality problem database in place quickly,
with infrastructure ready to expand into courses, lessons, student accounts,
discussions, and statistics later.

## Branding

- **Name:** Provia
- **Domain:** provia.uz (production), with .app or .com to be added later
- **Tagline (working):** "Olimpiada masalalari kutubxonasi" /
  "The math olympiad problem library"

## Final stack

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 15** (App Router) + **TypeScript** | One language full-stack, server actions, Vercel deploy |
| Database | **PostgreSQL** (vanilla, self-managed) | Relational data, JSONB, full-text search, no lock-in |
| ORM | **Drizzle ORM** | TS-first, close to SQL, lightweight, no abstraction hell |
| Auth | **Custom session-based auth** (bcrypt + sessions table) | Full control, no external auth library, easy to debug |
| File storage | **Cloudflare R2** (S3 SDK) | Cheap, free egress, S3-compatible |
| UI | **Tailwind CSS + shadcn/ui** | Fast prototyping, customizable |
| Math rendering | **KaTeX** (`react-katex`) | Fast, server-renderable |
| Markdown | **react-markdown + remark-math + rehype-katex + remark-gfm** | Safe HTML, math support, tables |
| Markdown editor | **CodeMirror 6** | Lightweight, syntax highlighting, drag-drop hooks |
| ZIP parsing | **JSZip** | Browser + server compatible |
| Frontmatter | **gray-matter** + **js-yaml** | Standard, reliable |
| Schema validation | **Zod** | Pairs with Drizzle, runtime validation |
| Email (later) | **Resend** | For email verification, password reset (post-MVP) |
| Hosting (app) | **Vercel** | Built for Next.js |
| Hosting (DB) | Local Docker → **Neon** or **Railway** for production | Vanilla Postgres anywhere |

## Plan structure

The plan is split into **10 phases**. Each phase ends in a working,
deployable state and has clear acceptance criteria.

| Phase | File | What you get at the end |
|---|---|---|
| 0 | [`phase-00-project-skeleton.md`](./phase-00-project-skeleton.md) | Empty Next.js app, lokal Postgres in Docker, Drizzle wired up, deployed to Vercel |
| 1 | [`phase-01-database-schema.md`](./phase-01-database-schema.md) | Full DB schema, migrations, seed data, generated TS types |
| 2 | [`phase-02-auth-and-admin-guard.md`](./phase-02-auth-and-admin-guard.md) | Custom session auth, login page, `/admin/*` protected, first admin user |
| 3 | [`phase-03-markdown-and-latex-rendering.md`](./phase-03-markdown-and-latex-rendering.md) | `<MarkdownPreview>` component renders LaTeX, tables, images correctly |
| 4 | [`phase-04-r2-storage-setup.md`](./phase-04-r2-storage-setup.md) | Cloudflare R2 bucket connected, upload/delete server actions, signed URL helper |
| 5 | [`phase-05-single-problem-crud.md`](./phase-05-single-problem-crud.md) | Admin can create/edit/delete a problem via UI with image upload |
| 6 | [`phase-06-problems-list-search-filter.md`](./phase-06-problems-list-search-filter.md) | Problems list with full-text search, multi-filter, pagination |
| 7 | [`phase-07-bulk-import-format-spec.md`](./phase-07-bulk-import-format-spec.md) | Bulk import format spec doc + AI prompt template (no UI yet, just spec) |
| 8 | [`phase-08-bulk-import-implementation.md`](./phase-08-bulk-import-implementation.md) | ZIP upload, parse, preview, validate, import with image handling |
| 9 | [`phase-09-taxonomy-crud-and-dashboard.md`](./phase-09-taxonomy-crud-and-dashboard.md) | Topics/sources/tags CRUD, admin dashboard with stats |
| 10 | [`phase-10-polish-and-production.md`](./phase-10-polish-and-production.md) | Production DB migration, error tracking, docs, hardening |

## How to use this plan

1. Read **one phase at a time** — don't try to hold the whole plan in your head.
2. Each phase has an **acceptance criteria** section. Don't move to the next
   phase until the current one passes.
3. Each phase lists **files to create/modify** so you (and Claude as the vibe-coding
   pair) can grep through what's expected.
4. **Commit after each phase** — these are natural checkpoint boundaries.
5. The phases are ordered so the app is **always deployable** at the end of
   each one. Even after Phase 0, you have a deployed (empty) app.

## Future expansion (post-MVP, not in this plan)

The schema and auth system are designed to support all of these without
breaking changes:

- Student accounts (add `role` to users, expand RLS-equivalent checks)
- "Solved" tracking (`attempts` table)
- Courses → lessons → lesson problems
- Discussions (`comments` table)
- Leaderboards (aggregations over `attempts`)
- Public mode (problems visible to all, solutions hidden until solved)
- Semantic similar-problem search (pgvector extension)
- AI-suggested tags from problem text

The `problems.metadata` JSONB column is a deliberate escape hatch for
adding fields without migrations.
