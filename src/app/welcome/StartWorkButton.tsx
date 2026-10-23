"use client";

import { useState } from "react";
import { post } from "@/lib/clientApi";

export default function StartWorkButton() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setBusy(true);
    setError(null);
    try {
      const { next } = await post<{ next: string }>("/api/work/start", {});
      window.location.assign(next);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <button type="button" onClick={start} disabled={busy}>
          Start work
        </button>
      </div>
      {error && <p className="save-status not-saved">{error}</p>}
    </>
  );
}
