import { useEffect, useState } from "react";
import { formatMoney } from "../lib/money.ts";
import { deleteReceipt, imageUrl, type Receipt } from "../lib/receipts.ts";
import { formatDate } from "./ReceiptList.tsx";

interface Props {
  receipt: Receipt;
  onBack: () => void;
  onEdit: () => void;
  onDeleted: () => void;
}

export function ReceiptDetail({ receipt, onBack, onEdit, onDeleted }: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let live = true;
    if (receipt.image_path) {
      void imageUrl(receipt.image_path).then((url) => {
        if (live) setSrc(url);
      });
    }
    return () => {
      live = false;
    };
  }, [receipt.image_path]);

  async function remove() {
    setDeleting(true);
    setError(null);
    try {
      await deleteReceipt(receipt);
      onDeleted();
    } catch {
      setError("Couldn't delete this receipt. Try again.");
      setDeleting(false);
    }
  }

  const money = (amount: number) => formatMoney(amount, receipt.currency);
  const breakdown: [string, number | null][] = [
    ["Subtotal", receipt.subtotal],
    ["Tax", receipt.tax],
    ["Tip", receipt.tip],
  ];

  return (
    <div className={src ? "detail has-image" : "detail"}>
      <button className="link back" onClick={onBack}>
        ← All receipts
      </button>

      <article className="slip">
        <h1>{receipt.merchant}</h1>
        <p className="muted">
          {formatDate(receipt.purchased_on)} · {receipt.category}
          {receipt.payment_method ? ` · ${receipt.payment_method}` : ""}
        </p>

        {receipt.items.length > 0 && (
          <table>
            <caption className="visually-hidden">Line items</caption>
            <tbody>
              {receipt.items.map((item, index) => (
                <tr key={index}>
                  <td>
                    {item.quantity !== null && item.quantity !== 1 ? `${item.quantity} × ` : ""}
                    {item.description}
                  </td>
                  <td className="figure">{item.line_total === null ? "" : money(item.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <dl>
          {breakdown.map(
            ([name, value]) =>
              value !== null && (
                <div key={name}>
                  <dt>{name}</dt>
                  <dd className="figure">{money(value)}</dd>
                </div>
              ),
          )}
          <div className="grand">
            <dt>Total</dt>
            <dd className="figure">{money(receipt.total)}</dd>
          </div>
        </dl>

        {receipt.notes && <p className="notes">{receipt.notes}</p>}
      </article>

      {src && (
        <a className="original" href={src} target="_blank" rel="noreferrer">
          <img src={src} alt={`Original receipt from ${receipt.merchant}`} />
        </a>
      )}

      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}

      <div className="actions">
        {confirming ? (
          <>
            <button className="danger" onClick={remove} disabled={deleting}>
              {deleting ? "Deleting…" : "Delete for good"}
            </button>
            <button className="secondary" onClick={() => setConfirming(false)} disabled={deleting}>
              Keep it
            </button>
          </>
        ) : (
          <>
            <button className="secondary" onClick={onEdit}>
              Edit
            </button>
            <button className="secondary" onClick={() => setConfirming(true)}>
              Delete
            </button>
          </>
        )}
      </div>
    </div>
  );
}
