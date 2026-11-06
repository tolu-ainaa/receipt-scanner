import type { Category } from "../../supabase/functions/scan-receipt/categories.ts";
import type { LineItem, ReceiptExtraction } from "../../supabase/functions/scan-receipt/schema.ts";
import { amountToInput, parseAmount } from "./money.ts";
import { supabase } from "./supabase.ts";

export type { Category, LineItem, ReceiptExtraction };

export interface Receipt {
  id: string;
  merchant: string;
  purchased_on: string | null;
  currency: string;
  subtotal: number | null;
  tax: number | null;
  tip: number | null;
  total: number;
  category: Category;
  payment_method: string | null;
  notes: string | null;
  items: LineItem[];
  image_path: string | null;
  created_at: string;
}

export interface DraftItem {
  description: string;
  quantity: string;
  line_total: string;
}

/** The review form's state. Amounts stay strings while someone is typing them. */
export interface Draft {
  merchant: string;
  purchased_on: string;
  currency: string;
  subtotal: string;
  tax: string;
  tip: string;
  total: string;
  category: Category;
  payment_method: string;
  notes: string;
  items: DraftItem[];
}

export const emptyDraft = (currency = ""): Draft => ({
  merchant: "",
  purchased_on: "",
  currency,
  subtotal: "",
  tax: "",
  tip: "",
  total: "",
  category: "other",
  payment_method: "",
  notes: "",
  items: [],
});

type DraftSource = Pick<
  ReceiptExtraction,
  "merchant" | "purchased_on" | "currency" | "subtotal" | "tax" | "tip" | "total" | "category" | "payment_method" | "items"
> & { notes?: string | null };

export function toDraft(source: DraftSource): Draft {
  return {
    merchant: source.merchant ?? "",
    purchased_on: source.purchased_on ?? "",
    currency: source.currency ?? "",
    subtotal: amountToInput(source.subtotal),
    tax: amountToInput(source.tax),
    tip: amountToInput(source.tip),
    total: amountToInput(source.total),
    category: source.category,
    payment_method: source.payment_method ?? "",
    notes: source.notes ?? "",
    items: source.items.map((item) => ({
      description: item.description,
      quantity: amountToInput(item.quantity),
      line_total: amountToInput(item.line_total),
    })),
  };
}

/** Returns field-level problems that block saving. Empty means the draft is valid. */
export function validateDraft(draft: Draft): Partial<Record<"merchant" | "currency" | "total", string>> {
  const errors: Partial<Record<"merchant" | "currency" | "total", string>> = {};
  if (!draft.merchant.trim()) errors.merchant = "Add the merchant.";
  if (!/^[A-Za-z]{3}$/.test(draft.currency.trim())) errors.currency = "Use a 3-letter code, like USD.";
  if (parseAmount(draft.total) === null) errors.total = "Add the total.";
  return errors;
}

/**
 * Checks whether the numbers on the draft agree with each other, to catch misreads.
 * Returns a message for the reviewer, or null when they add up or can't be checked.
 */
export function reconcile(draft: Draft): string | null {
  const total = parseAmount(draft.total);
  if (total === null) return null;

  const tax = parseAmount(draft.tax) ?? 0;
  const tip = parseAmount(draft.tip) ?? 0;
  const subtotal = parseAmount(draft.subtotal);
  const lineTotals = draft.items.map((item) => parseAmount(item.line_total));
  const close = (a: number, b: number) => Math.abs(a - b) < 0.015;

  if (subtotal !== null && !close(subtotal + tax + tip, total)) {
    // Tax-inclusive receipts print tax without adding it on top.
    if (!close(subtotal + tip, total)) {
      return `Subtotal, tax and tip come to ${(subtotal + tax + tip).toFixed(2)}, not ${total.toFixed(2)}.`;
    }
  }

  if (lineTotals.length > 0 && lineTotals.every((value) => value !== null)) {
    const itemSum = (lineTotals as number[]).reduce((sum, value) => sum + value, 0);
    const expected = subtotal ?? total - tax - tip;
    if (!close(itemSum, expected) && !close(itemSum, total)) {
      return `Line items add up to ${itemSum.toFixed(2)}, not ${expected.toFixed(2)}.`;
    }
  }
  return null;
}

function draftToRow(draft: Draft) {
  return {
    merchant: draft.merchant.trim(),
    purchased_on: draft.purchased_on || null,
    currency: draft.currency.trim().toUpperCase(),
    subtotal: parseAmount(draft.subtotal),
    tax: parseAmount(draft.tax),
    tip: parseAmount(draft.tip),
    total: parseAmount(draft.total),
    category: draft.category,
    payment_method: draft.payment_method.trim() || null,
    notes: draft.notes.trim() || null,
    items: draft.items
      .filter((item) => item.description.trim())
      .map((item) => ({
        description: item.description.trim(),
        quantity: parseAmount(item.quantity),
        line_total: parseAmount(item.line_total),
      })),
  };
}

export async function listReceipts(): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from("receipts")
    .select("*")
    .order("purchased_on", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(1000);
  if (error) throw error;
  return (data ?? []).map(fromRow);
}

// PostgREST returns numeric columns as numbers, but be strict: totals feed sums.
function fromRow(row: Record<string, unknown>): Receipt {
  const num = (value: unknown) => (value === null || value === undefined ? null : Number(value));
  return {
    ...(row as unknown as Receipt),
    subtotal: num(row.subtotal),
    tax: num(row.tax),
    tip: num(row.tip),
    total: Number(row.total),
  };
}

export async function createReceipt(draft: Draft, imagePath: string | null): Promise<Receipt> {
  const { data, error } = await supabase
    .from("receipts")
    .insert({ ...draftToRow(draft), image_path: imagePath })
    .select()
    .single();
  if (error) throw error;
  return fromRow(data);
}

export async function updateReceipt(id: string, draft: Draft): Promise<Receipt> {
  const { data, error } = await supabase.from("receipts").update(draftToRow(draft)).eq("id", id).select().single();
  if (error) throw error;
  return fromRow(data);
}

export async function deleteReceipt(receipt: Receipt): Promise<void> {
  const { error } = await supabase.from("receipts").delete().eq("id", receipt.id);
  if (error) throw error;
  if (receipt.image_path) await deleteImage(receipt.image_path);
}

export async function uploadImage(userId: string, image: Blob): Promise<string> {
  const path = `${userId}/${crypto.randomUUID()}.jpg`;
  const { error } = await supabase.storage.from("receipts").upload(path, image, { contentType: "image/jpeg" });
  if (error) throw error;
  return path;
}

/** Best effort: a leftover image is private and harmless, so this never blocks the person. */
export async function deleteImage(path: string): Promise<void> {
  const { error } = await supabase.storage.from("receipts").remove([path]);
  if (error) console.warn("Couldn't remove image", path, error.message);
}

export async function imageUrl(path: string): Promise<string | null> {
  const { data } = await supabase.storage.from("receipts").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

export interface ScanResult {
  extraction: ReceiptExtraction;
  remaining: number;
}

export class ScanFailure extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function scanReceipt(path: string): Promise<ScanResult> {
  const { data, error } = await supabase.functions.invoke<ScanResult>("scan-receipt", { body: { path } });
  if (!error && data) return data;

  // Non-2xx responses carry our { error: { code, message } } body in error.context.
  const response = (error as { context?: Response } | null)?.context;
  const body = await response?.json?.().catch(() => null);
  throw new ScanFailure(
    body?.error?.code ?? "network",
    body?.error?.message ?? "Couldn't reach the scanner. Check your connection and try again.",
  );
}

/** Neutralises spreadsheet formulas, since merchant text comes from a photo, not the user. */
function csvText(value: string | null): string {
  const text = value ?? "";
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

export function toCsv(receipts: Receipt[]): string {
  const header = "Date,Merchant,Category,Currency,Subtotal,Tax,Tip,Total,Payment method,Notes";
  const lines = receipts.map((r) =>
    [
      r.purchased_on ?? "",
      csvText(r.merchant),
      r.category,
      r.currency,
      r.subtotal ?? "",
      r.tax ?? "",
      r.tip ?? "",
      r.total,
      csvText(r.payment_method),
      csvText(r.notes),
    ].join(","),
  );
  return [header, ...lines].join("\r\n");
}

export interface MonthSummary {
  currency: string;
  total: number;
  count: number;
  topCategory: Category;
}

/**
 * Spend for one month ("YYYY-MM"), one entry per currency, largest count first.
 * Currencies are kept apart because adding them together would be meaningless.
 */
export function summarizeMonth(receipts: Receipt[], month: string): MonthSummary[] {
  const groups = new Map<string, Receipt[]>();
  for (const receipt of receipts) {
    if (!receipt.purchased_on?.startsWith(month)) continue;
    groups.set(receipt.currency, [...(groups.get(receipt.currency) ?? []), receipt]);
  }

  return [...groups.entries()]
    .map(([currency, rows]) => {
      const byCategory = new Map<Category, number>();
      for (const row of rows) byCategory.set(row.category, (byCategory.get(row.category) ?? 0) + row.total);
      const topCategory = [...byCategory.entries()].sort((a, b) => b[1] - a[1])[0][0];
      const total = Math.round(rows.reduce((sum, row) => sum + row.total, 0) * 100) / 100;
      return { currency, total, count: rows.length, topCategory };
    })
    .sort((a, b) => b.count - a.count);
}
