"use client";

import { useEffect, useRef, useState } from "react";
import { post } from "@/lib/clientApi";
import type { BreakChoice } from "@/lib/breaks";
import { BREAK_PROMPT_TIMES_MS } from "@/lib/timing";
import { useWorkspace } from "./Workspace";

/**
 * Break prompts, treatment prompt 2 (versions with features.breakPrompts). A centered pop-up
 * at each break time on the session clock (from Start work, paused time included). If the
 * participant is already paused at that time, the break is skipped and not rescheduled.
 * "Take a 5-minute break" opens the pause screen with a break timer (see BreakBanner in
 * Workspace.tsx). Screen copy is from the PI's Treatment_Prompts document.
 */
export default function BreakPrompt({ initialHandled }: { initialHandled: number[] }) {
  const { taskId, paused, promptsStopped, claimPrompt, releasePrompt, saveNow, sessionElapsedMs, pause } =
    useWorkspace();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const handledRef = useRef(new Set(initialHandled));
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Refs so the 1 s ticker always sees current state without restarting.
  const pausedRef = useRef(paused);
  pausedRef.current = paused;
  const openRef = useRef(openIndex);
  openRef.current = openIndex;

  useEffect(() => {
    if (promptsStopped) return;
    const tick = () => {
      if (openRef.current !== null) return;
      const elapsed = sessionElapsedMs();
      if (elapsed === null) return;
      const due = BREAK_PROMPT_TIMES_MS.map((t, i) => i).filter(
        (i) => BREAK_PROMPT_TIMES_MS[i] <= elapsed && !handledRef.current.has(i),
      );
      if (due.length === 0) return;
      const latest = due[due.length - 1];

      // Earlier breaks that came due while no task page was open: log as missed, don't show.
      for (const i of due.slice(0, -1)) {
        handledRef.current.add(i);
        post("/api/break-prompt", { taskId, breakIndex: i, status: "skipped", reason: "missed" }).catch(() => {});
      }

      if (pausedRef.current) {
        handledRef.current.add(latest);
        post("/api/break-prompt", { taskId, breakIndex: latest, status: "skipped", reason: "paused" }).catch(() => {});
        return;
      }
      if (!claimPrompt("break-prompt")) return; // another prompt is open; try again next tick
      handledRef.current.add(latest);
      setOpenIndex(latest);
      (async () => {
        await saveNow(); // save the draft before showing the prompt
        try {
          const { alreadyHandled } = await post<{ alreadyHandled: boolean }>("/api/break-prompt", {
            taskId,
            breakIndex: latest,
            status: "shown",
          });
          if (alreadyHandled) {
            setOpenIndex(null); // e.g. shown in another tab
            releasePrompt("break-prompt");
          }
        } catch {
          // Still show it; the choice is logged separately.
        }
      })();
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [promptsStopped, sessionElapsedMs, claimPrompt, releasePrompt, saveNow, taskId]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openIndex !== null && !dialog.open) dialog.showModal();
    if (openIndex === null && dialog.open) dialog.close();
  }, [openIndex]);

  // End work closes any open prompt.
  useEffect(() => {
    if (promptsStopped && openIndex !== null) setOpenIndex(null);
  }, [promptsStopped, openIndex]);

  async function choose(choice: BreakChoice) {
    if (openIndex === null) return;
    const breakIndex = openIndex;
    setBusy(true);
    setError(null);
    try {
      await post("/api/break-prompt", { taskId, breakIndex, choice });
      setOpenIndex(null);
      releasePrompt("break-prompt");
      if (choice === "break") await pause({ reason: "break", breakIndex });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialogRef}
      className="prompt-dialog"
      aria-labelledby="break-prompt-title"
      onCancel={(e) => e.preventDefault() /* choose one of the two options */}
    >
      {openIndex !== null && (
        <>
          <h2 id="break-prompt-title">Time for a 5-minute break</h2>
          <p>If you can, stand up, stretch, and step away from the screen. Your work is saved.</p>
          <div className="prompt-choices">
            <button type="button" onClick={() => choose("break")} disabled={busy}>
              Take a 5-minute break
            </button>
            <button type="button" onClick={() => choose("keep_working")} disabled={busy}>
              Keep working
            </button>
          </div>
          {error && <p className="save-status not-saved">{error}</p>}
        </>
      )}
    </dialog>
  );
}
