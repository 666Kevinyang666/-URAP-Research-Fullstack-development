"use client";

import { useState } from "react";
import { post } from "@/lib/clientApi";

export default function ConsentForm() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function choose(choice: "consent" | "decline") {
    setBusy(true);
    setError(null);
    try {
      const { next } = await post<{ next: string }>("/api/consent", { choice });
      window.location.assign(next);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <div className="toolbar">
        <button type="button" onClick={() => choose("consent")} disabled={busy}>
          Consent
        </button>
        <button type="button" onClick={() => choose("decline")} disabled={busy}>
          Decline
        </button>
      </div>
      {error && <p className="save-status not-saved">{error}</p>}
    </>
  );
}
