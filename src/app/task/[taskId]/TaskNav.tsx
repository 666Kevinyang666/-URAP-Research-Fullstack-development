"use client";

import { useRef, useState } from "react";
import type { DraftStatus } from "@/lib/constants";
import { logClientEvent } from "@/lib/clientApi";
import { useWorkspace } from "./Workspace";

export type NavTask = { id: string; title: string; required: boolean; status: DraftStatus };

const STATUS_LABEL: Record<DraftStatus, string> = {
  not_started: "Not started",
  in_progress: "In progress",
  complete: "Complete",
};

/** Task list with live status for the open task, plus the End work button. */
export default function TaskNav({ tasks }: { tasks: NavTask[] }) {
  const ws = useWorkspace();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The open task's status changes on this page; others come from the server.
  const withLive = tasks.map((t) => (t.id === ws.taskId ? { ...t, status: ws.status } : t));
  const incompleteRequired = withLive.filter((t) => t.required && t.status !== "complete");

  function openEndDialog() {
    logClientEvent(ws.taskId, "end_work_prompt", {
      incompleteRequired: incompleteRequired.map((t) => t.id),
    });
    setError(null);
    dialogRef.current?.showModal();
  }

  function cancelEnd() {
    logClientEvent(ws.taskId, "end_work_cancel", {
      incompleteRequired: incompleteRequired.map((t) => t.id),
    });
    dialogRef.current?.close();
  }

  async function confirmEnd() {
    setBusy(true);
    try {
      await ws.endWork();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <nav className="task-nav" aria-label="Tasks">
      <h2>Tasks</h2>
      <ol className="task-list">
        {withLive.map((t) => (
          <li key={t.id} className={t.id === ws.taskId ? "current" : undefined}>
            <a
              href={`/task/${encodeURIComponent(t.id)}`}
              aria-current={t.id === ws.taskId ? "page" : undefined}
              onClick={(e) => {
                e.preventDefault();
                if (t.id !== ws.taskId) ws.leaveTo(`/task/${encodeURIComponent(t.id)}`);
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

      <button type="button" onClick={openEndDialog}>
        End work
      </button>

      <dialog ref={dialogRef} className="end-dialog" onCancel={cancelEnd}>
        {incompleteRequired.length > 0 ? (
          <>
            <p>
              <strong>These required tasks are not complete:</strong>
            </p>
            <ul>
              {incompleteRequired.map((t) => (
                <li key={t.id}>
                  {t.title} ({STATUS_LABEL[t.status].toLowerCase()})
                </li>
              ))}
            </ul>
            <p>You can still end work now, but you won&apos;t be able to edit any task afterwards.</p>
          </>
        ) : (
          <p>End work and continue to the survey? You won&apos;t be able to edit any task afterwards.</p>
        )}
        {error && <p className="save-status not-saved">{error}</p>}
        <div className="toolbar">
          <button type="button" onClick={confirmEnd} disabled={busy}>
            {incompleteRequired.length > 0 ? "End work anyway" : "Yes, end work"}
          </button>
          <button type="button" onClick={cancelEnd} disabled={busy}>
            Keep working
          </button>
        </div>
      </dialog>
    </nav>
  );
}
