/**
 * Single source of truth for school grades.
 *
 * Pinned to 5..11 because:
 * - The `problem_classes` table has a CHECK constraint enforcing the same
 *   range (see `src/db/schema/problems.ts`).
 * - The bulk-import schema validates against the same range.
 * - Olympiad problems below grade 5 are out of scope for this project.
 *
 * Both the admin classes page (`/admin/classes`) and the problem create/
 * edit form import from here, so any future change (e.g. broadening to
 * include grade 4) is a one-place edit plus a matching DB migration.
 */
export const CLASS_NUMBERS = [5, 6, 7, 8, 9, 10, 11] as const;

export type ClassNumber = (typeof CLASS_NUMBERS)[number];
