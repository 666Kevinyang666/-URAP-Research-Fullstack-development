"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { post } from "@/lib/clientApi";
import { enterFullscreen } from "@/app/task/[taskId]/useFocusMode";

/**
 * Start work. With focus mode (features.focusMode), requests full screen from this click (it
 * needs a user gesture) and opens the first task with client-side navigation, since a full
 * page load would leave full screen.
 */
export default function StartWorkButton({ focusMode }: { focusMode: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function start() {
    // Before any await, so the request still counts as part of the click.
    const fullscreen = focusMode ? enterFullscreen(null) : Promise.resolve(false);
    setBusy(true);
    setError(null);
    try {
      const [, { next }] = await Promise.all([fullscreen, post<{ next: string }>("/api/work/start", {})]);
      if (focusMode) router.push(next);
      else window.location.assign(next);
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
