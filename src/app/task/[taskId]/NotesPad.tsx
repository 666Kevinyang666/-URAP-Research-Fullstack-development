"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { beacon, post } from "@/lib/clientApi";
import { readBackup, writeBackup } from "@/lib/localBackup";
import { logPaste } from "@/lib/paste";
import { useWorkspace } from "./Workspace";

type SaveState = "saved" | "saving" | "not_saved";

type Props = {
  sessionId: string;
  taskId: string;
  initialContent: string;
  autosaveIntervalMs: number;
  snapshotIntervalMs: number;
};

/**
 * "Drafting notes" (features.notesPad): one notes box per task, in the side column in the same
 * place and size as the AI pane in other versions. Saved like the main editor (every few
 * seconds when changed, on blur, by beacon when the tab is hidden or closed, with a local
 * backup), snapshotted every snapshotIntervalMs, and read-only while the task is complete.
 * Never submitted, and doesn't count toward the minimum answer length.
 */
export default function NotesPad(props: Props) {
  const { sessionId, taskId, autosaveIntervalMs, snapshotIntervalMs } = props;
  const { status, paused, focusAway, registerFlush } = useWorkspace();
  const storageKey = `notes-backup:${sessionId}:${taskId}`;
  const [content, setContent] = useState(props.initialContent);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const contentRef = useRef(props.initialContent);
  const lastSavedRef = useRef(props.initialContent);
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
    (trigger: string, snapshot = false) =>
      enqueue(async () => {
        const toSave = contentRef.current;
        if (toSave === lastSavedRef.current && !snapshot) return;
        if (toSave !== lastSavedRef.current) setSaveState("saving");
        try {
          await post("/api/notes", { taskId, content: toSave, trigger, snapshot });
          markSaved(toSave);
        } catch (e) {
          setSaveState("not_saved");
          setErrorMsg((e as Error).message);
        }
      }),
    [enqueue, markSaved, taskId],
  );

  useEffect(() => registerFlush(() => save("navigate")), [registerFlush, save]);

  // Recover unsaved notes from the local backup (same rule as the main editor).
  useEffect(() => {
    const backup = readBackup(storageKey);
    if (!backup) return;
    if (backup.content !== props.initialContent && backup.baseContent === props.initialContent && status !== "complete") {
      contentRef.current = backup.content;
      setContent(backup.content);
      setSaveState("not_saved");
      save("restore_local_backup");
    } else {
      writeBackup(storageKey, null);
    }
    // Run once on mount.
  }, []);

  useEffect(() => {
    const id = setInterval(() => save("interval"), autosaveIntervalMs);
    return () => clearInterval(id);
  }, [save, autosaveIntervalMs]);

  useEffect(() => {
    const id = setInterval(() => save("interval_snapshot", true), snapshotIntervalMs);
    return () => clearInterval(id);
  }, [save, snapshotIntervalMs]);

  useEffect(() => {
    const flush = (trigger: string) => {
      if (contentRef.current === lastSavedRef.current) return;
      beacon("/api/notes", { taskId, content: contentRef.current, trigger });
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flush("hidden");
    };
    const onPageHide = () => flush("pagehide");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
    };
  }, [taskId]);

  function onChange(value: string) {
    contentRef.current = value;
    setContent(value);
    const clean = value === lastSavedRef.current;
    writeBackup(storageKey, clean ? null : { content: value, baseContent: lastSavedRef.current });
    setSaveState(clean ? "saved" : "not_saved");
  }

  const statusLabel = { saved: "Saved", saving: "Saving…", not_saved: "Not saved" }[saveState];

  return (
    <div className="chat-pane notes-pane" id="notes-pane" data-task-id={taskId}>
      <div className="notes-header">
        <strong>Drafting notes</strong>
        <span className={`save-status ${saveState === "not_saved" ? "not-saved" : ""}`} aria-live="polite">
          {statusLabel}
        </span>
      </div>
      <p className="chat-subtitle">
        Use this space for rough ideas, outlines, and notes. Only your answer in the main editor is submitted.
      </p>
      <textarea
        className="notes-input"
        value={content}
        readOnly={status === "complete" || paused || focusAway !== null}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => save("blur")}
        onPaste={(e) => logPaste(taskId, "notes", e)}
        aria-label="Drafting notes"
      />
      {errorMsg && <p className="save-status not-saved">{errorMsg}</p>}
    </div>
  );
}
