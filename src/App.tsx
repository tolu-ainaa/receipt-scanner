import type { Session } from "@supabase/supabase-js";
import { useCallback, useEffect, useState } from "react";
import { AuthScreen } from "./components/AuthScreen.tsx";
import { ReceiptDetail } from "./components/ReceiptDetail.tsx";
import { ReceiptForm } from "./components/ReceiptForm.tsx";
import { ReceiptList } from "./components/ReceiptList.tsx";
import { ScanFlow } from "./components/ScanFlow.tsx";
import { createReceipt, emptyDraft, listReceipts, type Receipt, toDraft, updateReceipt } from "./lib/receipts.ts";
import { isConfigured, supabase } from "./lib/supabase.ts";

type View =
  | { name: "list" }
  | { name: "scan" }
  | { name: "manual" }
  | { name: "detail"; id: string }
  | { name: "edit"; id: string };

export function App() {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    if (!isConfigured) return;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  if (!isConfigured) {
    return (
      <main className="centered">
        <h1>Almost there</h1>
        <p>
          Set <code>VITE_SUPABASE_URL</code> and <code>VITE_SUPABASE_ANON_KEY</code>, then rebuild. See the README.
        </p>
      </main>
    );
  }
  if (session === undefined) return <main className="centered" aria-busy="true" />;
  if (session === null) return <AuthScreen />;
  return <Signedin key={session.user.id} session={session} />;
}

function Signedin({ session }: { session: Session }) {
  const [view, setView] = useState<View>({ name: "list" });
  const [receipts, setReceipts] = useState<Receipt[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      setReceipts(await listReceipts());
    } catch {
      setLoadError("Couldn't load your receipts.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const showList = () => setView({ name: "list" });
  const added = (receipt: Receipt) => {
    setReceipts((current) => [receipt, ...(current ?? [])]);
    setView({ name: "detail", id: receipt.id });
  };
  const replaced = (receipt: Receipt) => {
    setReceipts((current) => (current ?? []).map((r) => (r.id === receipt.id ? receipt : r)));
    setView({ name: "detail", id: receipt.id });
  };
  const removed = (id: string) => {
    setReceipts((current) => (current ?? []).filter((r) => r.id !== id));
    showList();
  };

  const lastCurrency = receipts?.[0]?.currency ?? "";
  const selected = "id" in view ? receipts?.find((r) => r.id === view.id) : undefined;

  return (
    <>
      <header className="topbar">
        <button className="wordmark" onClick={showList}>
          Receipt Scanner
        </button>
        <button className="link" onClick={() => supabase.auth.signOut()}>
          Sign out
        </button>
      </header>

      <main className="page">
        {view.name === "list" && (
          <ReceiptList
            receipts={receipts}
            error={loadError}
            onRetry={load}
            onOpen={(id) => setView({ name: "detail", id })}
            onScan={() => setView({ name: "scan" })}
            onManual={() => setView({ name: "manual" })}
          />
        )}
        {view.name === "scan" && (
          <ScanFlow userId={session.user.id} defaultCurrency={lastCurrency} onSaved={added} onCancel={showList} />
        )}
        {view.name === "manual" && (
          <ReceiptForm
            title="New receipt"
            initial={emptyDraft(lastCurrency)}
            submitLabel="Save receipt"
            onSubmit={(draft) => createReceipt(draft, null).then(added)}
            onCancel={showList}
          />
        )}
        {view.name === "detail" && selected && (
          <ReceiptDetail
            receipt={selected}
            onBack={showList}
            onEdit={() => setView({ name: "edit", id: selected.id })}
            onDeleted={() => removed(selected.id)}
          />
        )}
        {view.name === "edit" && selected && (
          <ReceiptForm
            title="Edit receipt"
            initial={toDraft(selected)}
            submitLabel="Save changes"
            onSubmit={(draft) => updateReceipt(selected.id, draft).then(replaced)}
            onCancel={() => setView({ name: "detail", id: selected.id })}
          />
        )}
      </main>
    </>
  );
}
