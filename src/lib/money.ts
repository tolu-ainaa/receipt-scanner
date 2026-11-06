export function formatMoney(amount: number, currency: string): string {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(amount);
  } catch {
    // Intl rejects malformed codes; well-formed but unknown ones format fine.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/** Parses what someone typed into an amount field. Returns null for blank or invalid input. */
export function parseAmount(input: string): number | null {
  const cleaned = input.trim().replace(/\s/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : null;
}

export const amountToInput = (value: number | null | undefined): string =>
  value === null || value === undefined ? "" : String(value);
