import { useMemo, useState } from "react";
import { CATEGORIES } from "../../supabase/functions/scan-receipt/categories.ts";
import { formatMoney } from "../lib/money.ts";
import { type Category, type Receipt, summarizeMonth, toCsv } from "../lib/receipts.ts";

interface Props {
  receipts: Receipt[] | null;
  error: string | null;
  onRetry: () => void;
  onOpen: (id: string) => void;
  onScan: () => void;
  onManual: () => void;
}

export const formatDate = (date: string | null) =>
  date ? new Date(`${date}T00:00:00`).toLocaleDateString(undefined, { dateStyle: "medium" }) : "No date";

const label = (category: string) => category[0].toUpperCase() + category.slice(1);

function downloadCsv(receipts: Receipt[]) {
  // The BOM makes Excel read non-ASCII merchant names and currency text correctly.
  const url = URL.createObjectURL(new Blob(["﻿", toCsv(receipts)], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "receipts.csv";
  link.click();
  URL.revokeObjectURL(url);
}

export function ReceiptList({ receipts, error, onRetry, onOpen, onScan, onManual }: Props) {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<Category | "all">("all");

  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const monthName = now.toLocaleDateString(undefined, { month: "long" });
  const summary = useMemo(() => summarizeMonth(receipts ?? [], month), [receipts, month]);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return (receipts ?? []).filter(
      (r) =>
        (category === "all" || r.category === category) &&
        (!needle ||
          r.merchant.toLowerCase().includes(needle) ||
          r.notes?.toLowerCase().includes(needle) ||
          r.items.some((item) => item.description.toLowerCase().includes(needle))),
    );
  }, [receipts, query, category]);

  if (error) {
    return (
      <div className="empty">
        <p className="error" role="alert">
          {error}
        </p>
        <button className="secondary" onClick={onRetry}>
          Try again
        </button>
      </div>
    );
  }
  if (receipts === null) return <p className="muted" aria-busy="true">Loading…</p>;

  if (receipts.length === 0) {
    return (
      <div className="empty">
        <h1>No receipts yet</h1>
        <p className="muted">Scan your first one and it'll show up here, itemised and searchable.</p>
        <div className="actions stacked">
          <button className="primary" onClick={onScan}>
            Scan a receipt
          </button>
          <button className="link" onClick={onManual}>
            Enter one by hand
          </button>
        </div>
      </div>
    );
  }

  return (
    <>
      <section className="summary" aria-label={`Spending in ${monthName}`}>
        <h2>{monthName}</h2>
        {summary.length === 0 && <p className="muted">Nothing dated this month yet.</p>}
        {summary.map((row) => (
          <div className="summary-row" key={row.currency}>
            <strong className="figure">{formatMoney(row.total, row.currency)}</strong>
            <span className="muted">
              {row.count} {row.count === 1 ? "receipt" : "receipts"} · mostly {row.topCategory}
            </span>
          </div>
        ))}
      </section>

      <div className="toolbar">
        <input
          type="search"
          placeholder="Search merchants and items"
          aria-label="Search receipts"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value as Category | "all")}
        >
          <option value="all">All categories</option>
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {label(c)}
            </option>
          ))}
        </select>
      </div>

      {visible.length === 0 ? (
        <p className="muted">No receipts match.</p>
      ) : (
        <ul className="receipts">
          {visible.map((receipt) => (
            <li key={receipt.id}>
              <button onClick={() => onOpen(receipt.id)}>
                <span className="receipt-main">
                  <span className="merchant">{receipt.merchant}</span>
                  <span className="muted">
                    {formatDate(receipt.purchased_on)} · {label(receipt.category)}
                  </span>
                </span>
                <span className="figure">{formatMoney(receipt.total, receipt.currency)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="list-footer">
        <button className="link" onClick={() => downloadCsv(visible)}>
          Export {visible.length === receipts.length ? "all" : visible.length} to CSV
        </button>
        <button className="link" onClick={onManual}>
          Enter one by hand
        </button>
      </div>

      <button className="fab primary" onClick={onScan}>
        Scan a receipt
      </button>
    </>
  );
}
