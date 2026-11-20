import { useRef, useState, type DragEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../components/AuthProvider";
import { ACCEPTED_TYPES, uploadAndExtract } from "../lib/receipts";

type Item = { key: string; name: string; state: "working" | "done" | "error"; message?: string; receiptId?: string };

export function Upload() {
  const { session } = useAuth();
  const navigate = useNavigate();
  const [items, setItems] = useState<Item[]>([]);
  const [dragging, setDragging] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const cameraInput = useRef<HTMLInputElement>(null);

  function update(key: string, patch: Partial<Item>) {
    setItems((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }

  async function handleFiles(files: FileList | null) {
    if (!files || !session) return;
    const batch = Array.from(files).map((file) => ({ file, key: crypto.randomUUID() }));
    setItems((list) => [...batch.map(({ file, key }) => ({ key, name: file.name || "Photo", state: "working" as const })), ...list]);
    // Two at a time keeps phones responsive on large batches.
    const queue = [...batch];
    const saved: { key: string; id: string }[] = [];
    let failed = 0;
    const worker = async () => {
      for (let next = queue.shift(); next; next = queue.shift()) {
        const { file, key } = next;
        try {
          const { id, aiError } = await uploadAndExtract(file, session.user.id, (stage) => update(key, { message: stage }));
          saved.push({ key, id });
          update(key, aiError ? { state: "error", receiptId: id, message: aiError } : { state: "done", receiptId: id, message: undefined });
        } catch (err) {
          failed++;
          update(key, { state: "error", message: err instanceof Error ? err.message : "Something went wrong" });
        }
      }
    };
    await Promise.all([worker(), worker()]);

    // Go straight to checking the first receipt; the rest follow one by one after each Save.
    // (If an upload failed outright, stay here so the error is visible.)
    if (saved.length && !failed) {
      const order = batch.map((b) => saved.find((s) => s.key === b.key)?.id).filter((id): id is string => Boolean(id));
      navigate(`/app/receipts/${order[0]}`, { state: { fresh: true, queue: order.slice(1), total: order.length } });
    }
  }

  function onDrop(e: DragEvent) {
    e.preventDefault();
    setDragging(false);
    handleFiles(e.dataTransfer.files);
  }

  const working = items.filter((i) => i.state === "working").length;

  return (
    <main className="container">
      <h1>Add receipts</h1>
      <p className="muted">Take a photo or upload images and PDFs. We pull out the details; you check them.</p>
      <p className="muted small-text">Tip: lay the receipt flat, in good light, filling the frame.</p>

      <div className="upload-actions">
        <button className="btn" disabled={working > 0} onClick={() => cameraInput.current?.click()}>📸 Take a photo</button>
        <button className="btn outline" disabled={working > 0} onClick={() => fileInput.current?.click()}>📁 Choose photos or PDFs</button>
      </div>

      {working > 0 && (
        <div className="card scanning" role="status">
          <span className="spinner" aria-hidden />
          <div>
            <strong>Scanning {working === 1 ? "your receipt" : `${working} receipts`}…</strong>
            <div className="muted small-text">This takes a few seconds. You'll go straight to checking the details.</div>
          </div>
        </div>
      )}
      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />
      <input ref={fileInput} type="file" accept={ACCEPTED_TYPES} multiple hidden
        onChange={(e) => { handleFiles(e.target.files); e.target.value = ""; }} />

      <div className={`dropzone ${dragging ? "active" : ""}`} hidden={working > 0}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)} onDrop={onDrop}
        onClick={() => fileInput.current?.click()}>
        Drop receipts here<br /><span className="muted small-text">JPG, PNG, WebP or PDF · up to 10 MB each</span>
      </div>

      {items.length > 0 && (
        <ul className="upload-list">
          {items.map((it) => (
            <li key={it.key} className="card row">
              <span className="truncate">{it.name}</span>
              {it.state === "working" && <span className="muted">{it.message ?? "Working…"}</span>}
              {it.state === "done" && <Link to={`/app/receipts/${it.receiptId}`}>Review →</Link>}
              {it.state === "error" && (
                <span className="error-text">
                  {it.message}
                  {it.receiptId && <> <Link to={`/app/receipts/${it.receiptId}`}>Fill in →</Link></>}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}

      {items.length > 0 && working === 0 && (
        <p><Link to="/app/receipts?status=needs_review" className="btn">Review new receipts</Link></p>
      )}
    </main>
  );
}
