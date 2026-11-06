import { z } from "zod";
import { CATEGORIES } from "./categories.ts";


const LineItem = z.object({
  description: z.string(),
  quantity: z.number().nullable(),
  line_total: z.number().nullable(),
});

export const ReceiptExtraction = z.object({
  is_receipt: z.boolean().describe("False if the image is not a receipt or invoice."),
  merchant: z.string().nullable(),
  purchased_on: z.string().nullable().describe("Purchase date as YYYY-MM-DD."),
  currency: z.string().nullable().describe("ISO 4217 code, e.g. USD, NGN, EUR."),
  subtotal: z.number().nullable(),
  tax: z.number().nullable(),
  tip: z.number().nullable(),
  total: z.number().nullable().describe("The final amount paid."),
  category: z.enum(CATEGORIES),
  payment_method: z.string().nullable().describe("e.g. Cash, Visa. Never a full card number."),
  items: z.array(LineItem),
  warnings: z
    .array(z.string())
    .describe("Short notes on anything illegible, cut off or uncertain, for the person reviewing."),
});

export type ReceiptExtraction = z.infer<typeof ReceiptExtraction>;
export type LineItem = z.infer<typeof LineItem>;

const round2 = (n: number | null) => (n === null ? null : Math.round(n * 100) / 100);

function validDate(value: string | null): string | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00Z`);
  // Rejects rollovers such as 2026-02-31, which Date would turn into March.
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(value) ? value : null;
}

/** Cleans model output so it can go straight into the review form and database checks. */
export function normalizeExtraction(raw: ReceiptExtraction): ReceiptExtraction {
  const currency = raw.currency?.trim().toUpperCase() ?? null;
  const date = validDate(raw.purchased_on);
  const warnings = [...raw.warnings];
  if (raw.purchased_on && !date) warnings.push(`Couldn't read the date "${raw.purchased_on}".`);

  return {
    ...raw,
    merchant: raw.merchant?.trim() || null,
    purchased_on: date,
    currency: currency && /^[A-Z]{3}$/.test(currency) ? currency : null,
    subtotal: round2(raw.subtotal),
    tax: round2(raw.tax),
    tip: round2(raw.tip),
    total: round2(raw.total),
    items: raw.items.map((item) => ({
      ...item,
      line_total: round2(item.line_total),
    })),
    warnings,
  };
}
