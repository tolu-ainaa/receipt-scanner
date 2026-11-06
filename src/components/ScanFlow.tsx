import { type DragEvent, useEffect, useRef, useState } from "react";
import { prepareImage } from "../lib/image.ts";
import {
  createReceipt,
  deleteImage,
  emptyDraft,
  type Receipt,
  type ReceiptExtraction,
  ScanFailure,
  scanReceipt,
  toDraft,
  uploadImage,
} from "../lib/receipts.ts";
import { ReceiptForm } from "./ReceiptForm.tsx";

type Stage =
  | { name: "pick"; error?: string }
  | { name: "working"; label: string }
  | { name: "failed"; message: string; canRetry: boolean }
  | { name: "review"; extraction: ReceiptExtraction | null };

const NOT_RETRYABLE = new Set(["limit_reached", "not_a_receipt", "refused", "too_long", "unreadable_image"]);

interface Props {
  userId: string;
  defaultCurrency: string;
  onSaved: (receipt: Receipt) => void;
  onCancel: () => void;
}

export function ScanFlow({ userId, defaultCurrency, onSaved, onCancel }: Props) {
  const [stage, setStage] = useState<Stage>({ name: "pick" });
  const [imagePath, setImagePath] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const cameraInput = useRef<HTMLInputElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function read(path: string) {
    setStage({ name: "working", label: "Reading your receipt…" });
    try {
      const { extraction } = await scanReceipt(path);
      setStage({ name: "review", extraction });
    } catch (error) {
      const failure = error instanceof ScanFailure ? error : new ScanFailure("unexpected", "Something went wrong.");
      setStage({ name: "failed", message: failure.message, canRetry: !NOT_RETRYABLE.has(failure.code) });
    }
  }

  async function start(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setStage({ name: "pick", error: "That file isn't an image." });
      return;
    }
    setStage({ name: "working", label: "Preparing your photo…" });
    try {
      const image = await prepareImage(file);
      setPreview(URL.createObjectURL(image));
      setStage({ name: "working", label: "Uploading…" });
      const path = await uploadImage(userId, image);
      setImagePath(path);
      await read(path);
    } catch (error) {
      setStage({ name: "pick", error: error instanceof Error ? error.message : "Couldn't upload that photo." });
    }
  }

  function discard() {
    if (imagePath) void deleteImage(imagePath);
    onCancel();
  }

  function startOver() {
    if (imagePath) void deleteImage(imagePath);
    setImagePath(null);
    setPreview(null);
    setStage({ name: "pick" });
  }

  function drop(event: DragEvent) {
    event.preventDefault();
    setDragging(false);
    void start(event.dataTransfer.files[0]);
  }

  if (stage.name === "review") {
    const { extraction } = stage;
    return (
      <ReceiptForm
        title={extraction ? "Check the details" : "Enter the details"}
        initial={extraction ? toDraft({ ...extraction, currency: extraction.currency ?? defaultCurrency }) : emptyDraft(defaultCurrency)}
        warnings={extraction?.warnings}
        imageSrc={preview}
        submitLabel="Save receipt"
        cancelLabel="Discard"
        onSubmit={(draft) => createReceipt(draft, imagePath).then(onSaved)}
        onCancel={discard}
      />
    );
  }

  if (stage.name === "working") {
    return (
      <div className="scan-status" role="status">
        {preview && (
          <div className="scanning">
            <img src={preview} alt="" />
            <span className="scanline" aria-hidden="true" />
          </div>
        )}
        <p>{stage.label}</p>
      </div>
    );
  }

  if (stage.name === "failed") {
    return (
      <div className="scan-status">
        {preview && <img className="thumb" src={preview} alt="The photo you uploaded" />}
        <p className="error" role="alert">
          {stage.message}
        </p>
        <div className="actions stacked">
          {stage.canRetry && imagePath && (
            <button className="primary" onClick={() => read(imagePath)}>
              Try again
            </button>
          )}
          <button className="secondary" onClick={() => setStage({ name: "review", extraction: null })}>
            Enter it by hand
          </button>
          <button className="secondary" onClick={startOver}>
            Use a different photo
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={dragging ? "dropzone dragging" : "dropzone"}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={drop}
    >
      <h1>Scan a receipt</h1>
      <p className="muted">Lay it flat in good light, with all four edges in frame.</p>
      {stage.error && (
        <p className="error" role="alert">
          {stage.error}
        </p>
      )}
      <div className="actions stacked">
        <button className="primary" onClick={() => cameraInput.current?.click()}>
          Take a photo
        </button>
        <button className="secondary" onClick={() => fileInput.current?.click()}>
          Choose a file
        </button>
        <button className="link" onClick={onCancel}>
          Cancel
        </button>
      </div>
      <input
        ref={cameraInput}
        hidden
        type="file"
        accept="image/*"
        capture="environment"
        aria-label="Take a photo of a receipt"
        onChange={(e) => start(e.target.files?.[0])}
      />
      <input
        ref={fileInput}
        hidden
        type="file"
        accept="image/*"
        aria-label="Choose a receipt image"
        onChange={(e) => start(e.target.files?.[0])}
      />
    </div>
  );
}
