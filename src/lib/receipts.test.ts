import { describe, expect, it, vi } from "vitest";

vi.mock("./supabase.ts", () => ({ supabase: {} }));

import { emptyDraft, type Receipt, reconcile, summarizeMonth, toCsv, validateDraft } from "./receipts.ts";

const receipt = (overrides: Partial<Receipt>): Receipt => ({
  id: "1",
  merchant: "Shop",
  purchased_on: "2026-11-02",
  currency: "USD",
  subtotal: null,
  tax: null,
  tip: null,
  total: 10,
  category: "other",
  payment_method: null,
  notes: null,
  items: [],
  image_path: null,
  created_at: "2026-11-02T00:00:00Z",
  ...overrides,
});

describe("reconcile", () => {
  const draft = (patch: object) => ({ ...emptyDraft("USD"), ...patch });
  const item = (line_total: string) => ({ description: "x", quantity: "", line_total });

  it("accepts numbers that add up", () => {
    expect(reconcile(draft({ subtotal: "10.00", tax: "0.80", tip: "2", total: "12.80" }))).toBeNull();
  });

  it("flags a total that doesn't match", () => {
    expect(reconcile(draft({ subtotal: "10.00", tax: "0.80", total: "18.80" }))).toContain("10.80");
  });

  it("accepts tax-inclusive receipts, where tax is printed but not added on top", () => {
    expect(reconcile(draft({ subtotal: "10.00", tax: "1.67", total: "10.00" }))).toBeNull();
  });

  it("flags line items that don't sum to the subtotal", () => {
    const result = reconcile(draft({ subtotal: "10.00", total: "10.00", items: [item("4.00"), item("5.00")] }));
    expect(result).toContain("9.00");
  });

  it("copes with floating point sums", () => {
    const items = [item("0.10"), item("0.20")];
    expect(reconcile(draft({ subtotal: "0.30", total: "0.30", items }))).toBeNull();
  });

  it("counts negative discount lines", () => {
    expect(reconcile(draft({ total: "8.00", items: [item("10.00"), item("-2.00")] }))).toBeNull();
  });

  it("skips the item check when an item has no amount", () => {
    expect(reconcile(draft({ total: "8.00", items: [item("10.00"), item("")] }))).toBeNull();
  });

  it("has nothing to say without a total", () => {
    expect(reconcile(draft({ subtotal: "10.00" }))).toBeNull();
  });
});

describe("validateDraft", () => {
  it("requires merchant, currency and total", () => {
    expect(Object.keys(validateDraft(emptyDraft()))).toEqual(["merchant", "currency", "total"]);
  });

  it("accepts a complete draft, and zero as a total", () => {
    expect(validateDraft({ ...emptyDraft("NGN"), merchant: "Shoprite", total: "0" })).toEqual({});
  });
});

describe("summarizeMonth", () => {
  it("never adds different currencies together", () => {
    const rows = [
      receipt({ total: 10, currency: "USD" }),
      receipt({ total: 5000, currency: "NGN" }),
      receipt({ total: 2.5, currency: "USD" }),
    ];
    expect(summarizeMonth(rows, "2026-11").map((r) => [r.currency, r.total, r.count])).toEqual([
      ["USD", 12.5, 2],
      ["NGN", 5000, 1],
    ]);
  });

  it("ignores other months and undated receipts", () => {
    const rows = [receipt({ purchased_on: "2026-10-31" }), receipt({ purchased_on: null })];
    expect(summarizeMonth(rows, "2026-11")).toEqual([]);
  });

  it("picks the top category by spend, not by count", () => {
    const rows = [
      receipt({ category: "dining", total: 5 }),
      receipt({ category: "dining", total: 5 }),
      receipt({ category: "travel", total: 100 }),
    ];
    expect(summarizeMonth(rows, "2026-11")[0].topCategory).toBe("travel");
  });
});

describe("toCsv", () => {
  it("quotes commas and quotes", () => {
    expect(toCsv([receipt({ merchant: 'Joe\'s "Bar", Inc' })])).toContain('"Joe\'s ""Bar"", Inc"');
  });

  it("neutralises formulas in text read from photos", () => {
    const line = toCsv([receipt({ merchant: '=HYPERLINK("http://evil")' })]).split("\r\n")[1];
    expect(line).toContain(`"'=HYPERLINK`);
  });

  it("leaves negative amounts as numbers", () => {
    expect(toCsv([receipt({ total: -5 })])).toContain(",-5,");
  });
});
