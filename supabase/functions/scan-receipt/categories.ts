// Kept apart from schema.ts so the frontend can import this without bundling zod.
// Must match the check constraint on public.receipts.category.
export const CATEGORIES = [
  "groceries",
  "dining",
  "transport",
  "fuel",
  "shopping",
  "health",
  "utilities",
  "entertainment",
  "travel",
  "office",
  "other",
] as const;

export type Category = (typeof CATEGORIES)[number];
