"use client";

import { useRef, useState } from "react";
import type { DraftStatus } from "@/lib/constants";
import { logClientEvent } from "@/lib/clientApi";
import BriefPanel from "@/components/BriefPanel";
import { useWorkspace } from "./Workspace";

export type NavTask = { id: string; title: string; required: boolean; status: DraftStatus };

const STATUS_LABEL: Record<DraftStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

/** "Task 2" from "Task 2: Analyze why customers do not book" (same as shortTaskLabel in @/lib/drafts). */
const shortLabel = (title: string) => title.split(":")[0].trim();

/**
 * Task list with live status for the open task, the End work button and the Withdraw link.
 * End work is disabled until every required task is complete (also enforced by
 * POST /api/session/end); optional tasks never block it.
 */
export default function TaskNav({ tasks }: { tasks: NavTask[] }) {
  const ws = useWorkspace();
  const endDialogRef = useRef<HTMLDialogElement>(null);
  const withdrawDialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The open task's status changes on this page; others come from the server.
  const withLive = tasks.map((t) => (t.id === ws.taskId ? { ...t, status: ws.status } : t));
  const incompleteRequired = withLive.filter((t) => t.required && t.status !== "complete");
  const blocked = incompleteRequired.length > 0;

  const goTo = (id: string) => {
    if (id !== ws.taskId) ws.leaveTo(`/task/${encodeURIComponent(id)}`);
  };

  function openEndDialog() {
    if (blocked) return;
    logClientEvent(ws.taskId, "end_work_prompt", { incompleteRequired: [] });
    setError(null);
    endDialogRef.current?.showModal();
  }

  function cancelEnd() {
    logClientEvent(ws.taskId, "end_work_cancel", { incompleteRequired: [] });
    endDialogRef.current?.close();
  }

  function openWithdrawDialog() {
    logClientEvent(ws.taskId, "withdraw_prompt");
    setError(null);
    withdrawDialogRef.current?.showModal();
  }

  function cancelWithdraw() {
    logClientEvent(ws.taskId, "withdraw_cancel");
    withdrawDialogRef.current?.close();
  }

  async function confirm(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <nav className="task-nav" aria-label="Tasks">
      <p className="brief-link">
        {ws.focusMode ? (
          <BriefPanel taskId={ws.taskId} from="task" />
        ) : (
          <a href={`/brief?from=task&taskId=${encodeURIComponent(ws.taskId)}`} target="_blank" rel="noopener">
            Frame Marketing Brief
          </a>
        )}
      </p>
      <h2>Tasks</h2>
      <ol className="task-list">
        {withLive.map((t) => (
          <li key={t.id} className={t.id === ws.taskId ? "current" : undefined}>
            <a
              href={`/task/${encodeURIComponent(t.id)}`}
              aria-current={t.id === ws.taskId ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                goTo(t.id);
              }}
            >
              {t.title}
            </a>
            <div className="task-meta">
              {t.required ? "Required" : "Optional"} · {STATUS_LABEL[t.status]}
            </div>
          </li>
        ))}
      </ol>

      <button type="button" onClick={openEndDialog} disabled={blocked}>
        End work
      </button>
      {blocked && (
        <p className="end-work-blocked" id="end-work-blocked">
          Complete all required tasks before ending:{" "}
          {incompleteRequired.map((t, i) => (
            <span key={t.id}>
              {i > 0 && ", "}
              <a
                href={`/task/${encodeURIComponent(t.id)}`}
                onClick={(e) => {
                  e.preventDefault();
                  goTo(t.id);
                }}
              >
                {shortLabel(t.title)}
              </a>
            </span>
          ))}
          .
        </p>
      )}

      <dialog ref={endDialogRef} className="end-dialog" onCancel={cancelEnd}>
        <p>End work? You won&apos;t be able to edit afterwards.</p>
        {error && <p className="save-status not-saved">{error}</p>}
        <div className="toolbar">
          <button type="button" onClick={() => confirm(ws.endWork)} disabled={busy}>
            End work
          </button>
          <button type="button" onClick={cancelEnd} disabled={busy}>
            Keep working
          </button>
        </div>
      </dialog>

      {/* Participation is voluntary: low-emphasis, visibly different from End work. */}
      <p className="withdraw-footer">
        <button type="button" className="link-button withdraw-link" onClick={openWithdrawDialog}>
          Withdraw from study
        </button>
      </p>
      <dialog ref={withdrawDialogRef} className="end-dialog" onCancel={cancelWithdraw}>
        <p>Withdraw from the study? Your session will end now.</p>
        {error && <p className="save-status not-saved">{error}</p>}
        <div className="toolbar">
          <button type="button" onClick={() => confirm(ws.withdraw)} disabled={busy}>
            Withdraw
          </button>
          <button type="button" onClick={cancelWithdraw} disabled={busy}>
            Cancel
          </button>
        </div>
      </dialog>
    </nav>
  );
}
