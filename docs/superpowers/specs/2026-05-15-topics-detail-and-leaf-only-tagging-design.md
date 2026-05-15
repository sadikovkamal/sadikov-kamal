# Topics: Detail Page, Tree Toggle, Leaf-Only Tagging

**Date:** 2026-05-15
**Scope:** Topics taxonomy gets a per-topic detail page. Tree gets an expand toggle. Problem tagging UI restricts to leaf topics.

## Goals

1. Problems can be tagged only with leaf topics (no children). Parent topics are organizational only.
2. Topics tree: expand/collapse is driven by a chevron icon. Clicking the topic name navigates to its detail page.
3. `/admin/topics/[id]` shows either child topics (parent mode) or tagged problems (leaf mode), with filters.

## Decisions

- **Parent definition**: a topic with at least one child (any topic referencing it via `parentId`). Computed from the existing flat topics array — no schema change.
- **Leaf-only enforcement**: client-side UI filter in `TopicMultiSelect`. We do NOT enforce server-side (would break existing rows tagged with parents). Existing data is untouched.
- **Tree expansion state**: in-memory only (`useState`). Restoring across navigation adds complexity for marginal gain.
- **Detail page filters**: search (always) + class multi-select (leaf mode only — classes don't apply to child topics).

## Files

### Changed
- `src/components/metadata-form.tsx` — `TopicMultiSelect` filters out topics that appear as another topic's `parentId`.
- `src/app/admin/topics/topics-tree.tsx` — chevron-only toggle; name becomes `Link`.
- `src/lib/taxonomy/queries.ts` — add `getTopicById`, `getTopicChildren`, `getTopicAncestors`.

### New
- `src/app/admin/topics/[id]/page.tsx` — branching detail (parent vs leaf).
- `src/app/admin/topics/[id]/children-list.tsx` — parent-mode list with search.
- `src/app/admin/topics/[id]/class-filter.tsx` — URL-state class filter (used in leaf mode).
- `src/app/admin/topics/[id]/topic-search-input.tsx` — search input (re-uses problems search pattern, but scoped to this page's URL).

## Component sketches

### TopicMultiSelect change (one-line filter)
```ts
const leafAvailable = useMemo(() => {
  const parentIds = new Set(available.map(t => t.parentId).filter(Boolean));
  return available.filter(t => !parentIds.has(t.id));
}, [available]);
```
Render the dropdown from `leafAvailable`. The selected set is unchanged (existing parent tags stay rendered as chips).

### Topics tree row
```
[chevron 16px | toggles] [name (Link → /admin/topics/[id])]  [slug]  [count]  [Tahrirlash]
```
Chevron only present when node has children. Otherwise a 16px spacer keeps alignment.

### Detail page branching
```ts
const topic = await getTopicById(id);
const children = await getTopicChildren(id); // includes problemCount per child
if (children.length > 0) return <ChildrenList ... />
else return <ProblemsList topicId={id} filters={...} />
```

### Breadcrumb
`Mavzular / [ancestor names…] / [current]` — built from `getTopicAncestors(id)`.

## Test plan

- `/admin/problems` → New problem dialog → topic dropdown excludes any topic that has children.
- `/admin/topics` → chevron toggles only; name click navigates to detail.
- `/admin/topics/[parentId]` → child topics listed with problem counts; search filters child names; clicking a child drills in.
- `/admin/topics/[leafId]` → problems table with search and class filter; URL state persists across reload.
- TypeScript clean; dev server compiles.
