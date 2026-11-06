import { type FormEvent, useMemo, useState } from "react";
import { CATEGORIES } from "../../supabase/functions/scan-receipt/categories.ts";
import { type Category, type Draft, type DraftItem, reconcile, validateDraft } from "../lib/receipts.ts";

interface Props {
  title: string;
  initial: Draft;
  submitLabel: string;
  warnings?: string[];
  imageSrc?: string | null;
  onSubmit: (draft: Draft) => Promise<void>;
  onCancel: () => void;
  cancelLabel?: string;
}

export function ReceiptForm({
  title,
  initial,
  submitLabel,
  warnings = [],
  imageSrc,
  onSubmit,
  onCancel,
  cancelLabel = "Cancel",
}: Props) {
  const [draft, setDraft] = useState(initial);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const errors = useMemo(() => validateDraft(draft), [draft]);
  const mismatch = useMemo(() => reconcile(draft), [draft]);

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const setItem = (index: number, patch: Partial<DraftItem>) =>
    set(
      "items",
      draft.items.map((item, i) => (i === index ? { ...item, ...patch } : item)),
    );

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (Object.keys(errors).length > 0) {
      setShowErrors(true);
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await onSubmit(draft);
    } catch {
      setSaveError("Couldn't save. Your edits are still here, so try again.");
      setSaving(false);
    }
  }

  const fieldError = (key: keyof typeof errors) =>
    showErrors && errors[key] ? <span className="field-error">{errors[key]}</span> : null;

  return (
    <form className={imageSrc ? "review has-image" : "review"} onSubmit={submit} noValidate>
      {imageSrc && (
        <figure className="review-image">
          <img src={imageSrc} alt="The receipt you scanned" />
        </figure>
      )}

      <div className="review-fields">
        <h1>{title}</h1>

        {(warnings.length > 0 || mismatch) && (
          <ul className="warnings" aria-label="Things to check">
            {mismatch && <li>{mismatch}</li>}
            {warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        )}

        <label>
          Merchant
          <input value={draft.merchant} onChange={(e) => set("merchant", e.target.value)} />
          {fieldError("merchant")}
        </label>

        <div className="row">
          <label>
            Date
            <input type="date" value={draft.purchased_on} onChange={(e) => set("purchased_on", e.target.value)} />
          </label>
          <label>
            Category
            <select value={draft.category} onChange={(e) => set("category", e.target.value as Category)}>
              {CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {category[0].toUpperCase() + category.slice(1)}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend>Items</legend>
          {draft.items.length === 0 && <p className="muted">No line items.</p>}
          {draft.items.map((item, index) => (
            <div className="item-row" key={index}>
              <input
                aria-label={`Item ${index + 1} description`}
                placeholder="Description"
                value={item.description}
                onChange={(e) => setItem(index, { description: e.target.value })}
              />
              <input
                aria-label={`Item ${index + 1} quantity`}
                className="qty"
                inputMode="decimal"
                placeholder="Qty"
                value={item.quantity}
                onChange={(e) => setItem(index, { quantity: e.target.value })}
              />
              <input
                aria-label={`Item ${index + 1} amount`}
                className="amount"
                inputMode="decimal"
                placeholder="0.00"
                value={item.line_total}
                onChange={(e) => setItem(index, { line_total: e.target.value })}
              />
              <button
                type="button"
                className="remove"
                aria-label={`Remove item ${index + 1}`}
                onClick={() =>
                  set(
                    "items",
                    draft.items.filter((_, i) => i !== index),
                  )
                }
              >
                ×
              </button>
            </div>
          ))}
          <button
            type="button"
            className="link"
            onClick={() => set("items", [...draft.items, { description: "", quantity: "", line_total: "" }])}
          >
            Add item
          </button>
        </fieldset>

        <div className="row four">
          <label>
            Subtotal
            <input
              className="amount"
              inputMode="decimal"
              value={draft.subtotal}
              onChange={(e) => set("subtotal", e.target.value)}
            />
          </label>
          <label>
            Tax
            <input
              className="amount"
              inputMode="decimal"
              value={draft.tax}
              onChange={(e) => set("tax", e.target.value)}
            />
          </label>
          <label>
            Tip
            <input
              className="amount"
              inputMode="decimal"
              value={draft.tip}
              onChange={(e) => set("tip", e.target.value)}
            />
          </label>
        </div>

        <div className="row">
          <label>
            Total
            <input
              className="amount total"
              inputMode="decimal"
              value={draft.total}
              onChange={(e) => set("total", e.target.value)}
            />
            {fieldError("total")}
          </label>
          <label>
            Currency
            <input
              className="currency"
              maxLength={3}
              placeholder="USD"
              autoCapitalize="characters"
              value={draft.currency}
              onChange={(e) => set("currency", e.target.value.toUpperCase())}
            />
            {fieldError("currency")}
          </label>
        </div>

        <label>
          Payment method
          <input value={draft.payment_method} onChange={(e) => set("payment_method", e.target.value)} />
        </label>
        <label>
          Notes
          <textarea rows={2} value={draft.notes} onChange={(e) => set("notes", e.target.value)} />
        </label>

        {saveError && (
          <p className="error" role="alert">
            {saveError}
          </p>
        )}

        <div className="actions">
          <button className="primary" disabled={saving}>
            {saving ? "Saving…" : submitLabel}
          </button>
          <button type="button" className="secondary" onClick={onCancel} disabled={saving}>
            {cancelLabel}
          </button>
        </div>
      </div>
    </form>
  );
}
