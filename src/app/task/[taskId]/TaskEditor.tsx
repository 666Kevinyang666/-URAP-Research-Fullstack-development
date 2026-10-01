"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { DraftStatus } from "@/lib/constants";

type SaveState = "saved" | "saving" | "not_saved";

type Props = {
  sessionId: string;
  taskId: string;
  initialContent: string;
  initialStatus: DraftStatus;
  autosaveIntervalMs: number;
  snapshotIntervalMs: number;
};

async function post(url: string, body: unknown) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

// Local backup of unsaved text, so a refresh or closed tab can't lose it even if the
// final save request arrives after the next page has loaded (or never arrives).
type Backup = { content: string; baseContent: string };

function backupKey(sessionId: string, taskId: string) {
  return `draft-backup:${sessionId}:${taskId}`;
}

function readBackup(key: string): Backup | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

function writeBackup(key: string, backup: Backup | null) {
  try {
    if (backup) localStorage.setItem(key, JSON.stringify(backup));
    else localStorage.removeItem(key);
  } catch {
    // Storage unavailable (e.g. blocked); server autosave still applies.
  }
}

function logClientEvent(taskId: string, eventType: string, payload: Record<string, unknown> = {}) {
  const body = JSON.stringify({ taskId, eventType, payload: { ...payload, clientTs: new Date().toISOString() } });
  // keepalive lets the request finish even if the page is unloading.
  fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(
    () => {},
  );
}

export default function TaskEditor(props: Props) {
  const { sessionId, taskId, autosaveIntervalMs, snapshotIntervalMs } = props;
  const storageKey = backupKey(sessionId, taskId);
  const [content, setContent] = useState(props.initialContent);
  const [status, setStatus] = useState<DraftStatus>(props.initialStatus);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);

  const contentRef = useRef(props.initialContent);
  const lastSavedRef = useRef(props.initialContent); // content the server has confirmed
  // All server writes run one at a time, in order, through this chain.
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());

  const enqueue = useCallback(<T,>(fn: () => Promise<T>): Promise<T> => {
    const next = queueRef.current.then(fn, fn);
    queueRef.current = next.catch(() => {});
    return next;
  }, []);

  const markSaved = useCallback(
    (saved: string) => {
      lastSavedRef.current = saved;
      setErrorMsg(null);
      const clean = contentRef.current === saved;
      writeBackup(storageKey, clean ? null : { content: contentRef.current, baseContent: saved });
      setSaveState(clean ? "saved" : "not_saved");
    },
    [storageKey],
  );

  const save = useCallback(
    (trigger: string) =>
      enqueue(async () => {
        const toSave = contentRef.current;
        if (toSave === lastSavedRef.current) return;
        setSaveState("saving");
        try {
          await post("/api/draft", { taskId, content: toSave, trigger });
          markSaved(toSave);
        } catch (e) {
          setSaveState("not_saved");
          setErrorMsg((e as Error).message);
        }
      }),
    [enqueue, markSaved, taskId],
  );

  // On load, recover unsaved text from the local backup. Only restore it if it was
  // based on the same content the server just returned; otherwise the server has
  // moved on (e.g. the backup was already saved) and the server copy wins.
  useEffect(() => {
    const backup = readBackup(storageKey);
    if (!backup) return;
    const server = props.initialContent;
    if (backup.content !== server && backup.baseContent === server && props.initialStatus !== "complete") {
      contentRef.current = backup.content;
      setContent(backup.content);
      setSaveState("not_saved");
      save("restore_local_backup");
    } else {
      writeBackup(storageKey, null);
    }
    // Run once on mount.
  }, []);

  // Autosave every few seconds (no-op when nothing changed).
  useEffect(() => {
    const id = setInterval(() => save("interval"), autosaveIntervalMs);
    return () => clearInterval(id);
  }, [save, autosaveIntervalMs]);

  // Snapshot every few minutes while the task is open.
  useEffect(() => {
    const id = setInterval(() => {
      enqueue(async () => {
        const toSave = contentRef.current;
        try {
          await post("/api/snapshot", { taskId, content: toSave });
          markSaved(toSave);
        } catch {
          // The next autosave will retry the content; the next interval retries the snapshot.
        }
      });
    }, snapshotIntervalMs);
    return () => clearInterval(id);
  }, [enqueue, markSaved, taskId, snapshotIntervalMs]);

  // Flush unsaved text when the page is hidden or closed, and warn before leaving with unsaved text.
  useEffect(() => {
    const flush = (trigger: string) => {
      if (contentRef.current === lastSavedRef.current) return;
      const body = JSON.stringify({ taskId, content: contentRef.current, trigger });
      navigator.sendBeacon("/api/draft", new Blob([body], { type: "application/json" }));
    };
    const onVisibility = () => {
      const hidden = document.visibilityState === "hidden";
      logClientEvent(taskId, hidden ? "visibility_hidden" : "visibility_visible");
      if (hidden) flush("hidden");
    };
    const onPageHide = () => {
      flush("pagehide");
      logClientEvent(taskId, "task_close");
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (contentRef.current !== lastSavedRef.current) e.preventDefault();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [taskId]);

  function onChange(value: string) {
    contentRef.current = value;
    setContent(value);
    const clean = value === lastSavedRef.current;
    writeBackup(storageKey, clean ? null : { content: value, baseContent: lastSavedRef.current });
    setSaveState(clean ? "saved" : "not_saved");
  }

  async function runAction(url: string, body: Record<string, unknown>, after: (data: { status?: DraftStatus }) => void) {
    setBusy(true);
    try {
      const data = await enqueue(() => post(url, body));
      after(data);
      setErrorMsg(null);
    } catch (e) {
      setErrorMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const complete = () => {
    const toSave = contentRef.current;
    runAction("/api/task/complete", { taskId, content: toSave }, (data) => {
      markSaved(toSave);
      if (data.status) setStatus(data.status);
    });
  };

  const reopen = () =>
    runAction("/api/task/reopen", { taskId }, (data) => {
      if (data.status) setStatus(data.status);
    });

  const endWork = () => {
    const toSave = contentRef.current;
    runAction("/api/session/end", { taskId, content: toSave }, () => {
      markSaved(toSave);
      window.location.reload(); // server renders the "continue to survey" page
    });
  };

  const isComplete = status === "complete";
  const statusLabel = { saved: "Saved", saving: "Saving…", not_saved: "Not saved" }[saveState];

  return (
    <div>
      <div className="toolbar">
        <span>
          Status: <strong>{status.replace("_", " ")}</strong>
        </span>
        <span className={`save-status ${saveState === "not_saved" ? "not-saved" : ""}`} aria-live="polite">
          {statusLabel}
        </span>
      </div>

      <textarea
        className="editor"
        value={content}
        readOnly={isComplete}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => logClientEvent(taskId, "editor_focus")}
        onBlur={() => {
          logClientEvent(taskId, "editor_blur", { length: contentRef.current.length });
          save("blur");
        }}
        aria-label="Your response"
        placeholder={isComplete ? "" : "Start writing here…"}
      />

      {errorMsg && <p className="save-status not-saved">{errorMsg}</p>}

      <div className="toolbar">
        {isComplete ? (
          <button onClick={reopen} disabled={busy}>
            Reopen task
          </button>
        ) : (
          <button onClick={complete} disabled={busy}>
            Mark complete
          </button>
        )}
        {confirmEnd ? (
          <>
            <span>End work and continue to the survey? You won&apos;t be able to edit afterwards.</span>
            <button onClick={endWork} disabled={busy}>
              Yes, end work
            </button>
            <button onClick={() => setConfirmEnd(false)} disabled={busy}>
              Cancel
            </button>
          </>
        ) : (
          <button onClick={() => setConfirmEnd(true)} disabled={busy}>
            End work
          </button>
        )}
      </div>
    </div>
  );
}
