/**
 * Cap on how many problems can be processed by a single bulk action
 * (delete or update). The number is shared between the client UI (so
 * the buttons can disable + a warning can render before the user
 * clicks) and the server action schemas (so a tampered client can't
 * push past it). Keep them in lock-step by importing from here on
 * both sides.
 */
export const BULK_OP_LIMIT = 500;
