"use client";

import { useEffect, useRef, useState } from "react";
import { post } from "@/lib/clientApi";
import type { BudgetCheckpointAction } from "@/lib/budgetCheckpoint";
import type { CompletionAnswers } from "@/lib/completion";
import { useWorkspace } from "./Workspace";
import CompletionQuestions from "./CompletionQuestions";

type Stage = "choices" | "complete" | "flag";

/**
 * Time-budget checkpoint, treatment prompt 1 (versions with features.checkpoints, when
 * checkpointTrigger is "time_budget"). Opens once per task, as a centered pop-up, when the
 * displayed active time reaches the current plan's time budget. Skipped without a valid budget.
 * Already shown is persisted on the server (checkpoint_shown), so neither a refresh nor a later
 * budget edit shows it again. Screen copy is from the PI's Treatment_Prompts document.
 */
export default function BudgetCheckpoint({ initialShown }: { initialShown: boolean }) {
  const ws = useWorkspace();
  const { taskId, plan, activeMs, paused, status, promptsStopped, claimPrompt, releasePrompt, saveNow } = ws;
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [shown, setShown] = useState(initialShown);
  const [open, setOpen] = useState(false);
  const [stage, setStage] = useState<Stage>("choices");
  const [budgetAtOpen, setBudgetAtOpen] = useState<number | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const budget = plan?.timeBudgetMinutes;
  const validBudget = typeof budget === "number" && Number.isInteger(budget) && budget > 0;
  const due = validBudget && activeMs >= budget * 60_000;

  useEffect(() => {
    if (shown || open || !due || paused || promptsStopped || status === "complete") return;
    if (!claimPrompt("budget-checkpoint")) return; // another prompt is open; retry next tick
    setShown(true);
    setBudgetAtOpen(budget!);
    (async () => {
      await saveNow(); // save the draft before showing the prompt
      let alreadyShown = false;
      try {
        ({ alreadyShown } = await post<{ alreadyShown: boolean }>("/api/budget-checkpoint", {
          taskId,
          shown: true,
          budgetMinutes: budget,
          activeMs: Math.round(activeMs),
        }));
      } catch {
        // Still show it; the decision below is logged separately.
      }
      if (alreadyShown) {
        releasePrompt("budget-checkpoint"); // e.g. shown in another tab
        return;
      }
      setStage("choices");
      setOpen(true);
    })();
  }, [shown, open, due, paused, promptsStopped, status, claimPrompt, releasePrompt, saveNow, taskId, budget, activeMs]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  // End work closes any open prompt.
  useEffect(() => {
    if (promptsStopped && open) setOpen(false);
  }, [promptsStopped, open]);

  function close() {
    setOpen(false);
    releasePrompt("budget-checkpoint");
  }

  async function resolve(action: BudgetCheckpointAction, extra: { note?: string } = {}) {
    await post("/api/budget-checkpoint", { taskId, action, ...extra });
  }

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const continueWorking = () =>
    run(async () => {
      await resolve("continue");
      close();
    });

  const pauseWork = () =>
    run(async () => {
      await resolve("pause");
      close();
      await ws.pause(); // the existing pause screen
    });

  const finish = (answers: CompletionAnswers) =>
    run(async () => {
      await post("/api/task/complete", { taskId, answers });
      ws.setStatus("complete");
      await resolve("finish");
      close();
    });

  const flag = (e: React.FormEvent) => {
    e.preventDefault();
    run(async () => {
      const trimmed = note.trim();
      await resolve("flag", { note: trimmed || undefined });
      ws.setFlag({ note: trimmed || null });
      close();
    });
  };

  return (
    <dialog
      ref={dialogRef}
      className="prompt-dialog"
      aria-labelledby="budget-checkpoint-title"
      onCancel={(e) => e.preventDefault() /* must choose one of the four options */}
    >
      {open && stage === "choices" && (
        <>
          <h2 id="budget-checkpoint-title">Check your progress</h2>
          <p>
            You planned to spend {budgetAtOpen} minutes on this task. You’ve reached that time. What would you like
            to do?
          </p>
          <div className="prompt-choices">
            <button type="button" onClick={() => setStage("complete")} disabled={busy}>
              Mark task complete
            </button>
            <button type="button" onClick={continueWorking} disabled={busy}>
              Continue working
            </button>
            <button type="button" onClick={pauseWork} disabled={busy}>
              Pause
            </button>
            <button type="button" onClick={() => setStage("flag")} disabled={busy}>
              Flag for later
            </button>
          </div>
        </>
      )}
      {open && stage === "complete" && (
        <CompletionQuestions
          source="checkpoint"
          busy={busy}
          error={error}
          onSubmit={finish}
          onCancel={() => setStage("choices")}
        />
      )}
      {open && stage === "flag" && (
        <form onSubmit={flag} className="completion-form">
          <h2 id="budget-checkpoint-title">Flag for later</h2>
          <label>
            Note (optional)
            <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} disabled={busy} />
          </label>
          <div className="toolbar">
            <button type="submit" disabled={busy}>
              Flag and return to work
            </button>
            <button type="button" onClick={() => setStage("choices")} disabled={busy}>
              Back
            </button>
          </div>
        </form>
      )}
      {open && stage !== "complete" && error && <p className="save-status not-saved">{error}</p>}
    </dialog>
  );
}
