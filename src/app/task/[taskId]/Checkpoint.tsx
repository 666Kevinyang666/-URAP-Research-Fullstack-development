"use client";

import { useEffect, useRef, useState } from "react";
import { onAiRequestCount } from "@/lib/aiRequestCount";
import { post } from "@/lib/clientApi";
import type { CheckpointAction } from "@/lib/checkpoints";
import { useWorkspace } from "./Workspace";

type PeerMessage = { id: number; from: "me" | "peer"; text: string; timestamp: string };
type PeerEndOutcome = "returned" | "declined" | "left" | "peer_unavailable";
type NoteMode = "continue" | "flag" | null;

/** Peer check-in room: polls for new messages while open (no websocket for this prototype). */
function PeerStage({ taskId, onDone }: { taskId: string; onDone: (outcome: PeerEndOutcome) => void }) {
  const [peerSessionId, setPeerSessionId] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [messages, setMessages] = useState<PeerMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch(`/api/peer?taskId=${encodeURIComponent(taskId)}`);
        const data = await res.json();
        if (cancelled) return;
        setPeerSessionId(data.peerSessionId);
        setAvailable(data.available);
        setMessages(data.messages ?? []);
      } catch {
        // Keep showing the last known state; the next tick retries.
      } finally {
        if (!cancelled) setLoaded(true);
      }
    }
    poll();
    const id = setInterval(poll, 2500);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [taskId]);

  async function send() {
    const text = input.trim();
    if (!text || busy) return;
    setBusy(true);
    setError(null);
    try {
      await post("/api/peer", { taskId, text });
      setInput("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p>Connecting…</p>;

  if (!peerSessionId) {
    return (
      <>
        <p>No peer has been paired with this session.</p>
        <button type="button" onClick={() => onDone("peer_unavailable")}>
          Continue to stopping choices
        </button>
      </>
    );
  }

  const sentAny = messages.some((m) => m.from === "me");

  return (
    <div>
      <p>Discuss what makes this task complete.</p>
      {!available && (
        <p className="save-status not-saved">
          Your peer isn&apos;t in their session right now; messages will wait for them.
        </p>
      )}
      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">No messages yet.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message chat-message-${m.from === "me" ? "user" : "assistant"}`}>
            <span className="chat-role">{m.from === "me" ? "You" : "Peer"}</span>
            <p>{m.text}</p>
          </div>
        ))}
      </div>
      {error && <p className="save-status not-saved">{error}</p>}
      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Write a message"
          aria-label="Message to your peer"
          disabled={busy}
        />
        <button type="button" onClick={send} disabled={busy || !input.trim()}>
          Send
        </button>
      </div>
      <div className="toolbar">
        <button type="button" onClick={() => onDone("returned")}>
          Return to task
        </button>
        <button type="button" onClick={() => onDone(sentAny ? "left" : "declined")}>
          {sentAny ? "Leave" : "Decline"}
        </button>
      </div>
    </div>
  );
}

type Props = {
  thresholds: number[];
  peerIndex: number;
  peerEnabled: boolean;
  initialAiRequestCount: number;
  initialResolvedIndices: number[];
  initialPeerDoneIndices: number[];
};

/**
 * Completion checkpoint (sustainable version only). Opens automatically once the AI request
 * count reaches a configured threshold (config/study.json's checkpointAiRequestThresholds),
 * with a peer check-in first at the last threshold. See the brief's "Task planning and
 * completion" section for the required Finish/Continue/Pause/Flag choices.
 */
export default function Checkpoint({
  thresholds,
  peerIndex,
  peerEnabled,
  initialAiRequestCount,
  initialResolvedIndices,
  initialPeerDoneIndices,
}: Props) {
  const { taskId, plan, pause, setStatus } = useWorkspace();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const [aiRequests, setAiRequests] = useState(initialAiRequestCount);
  const [resolvedIndices, setResolvedIndices] = useState(new Set(initialResolvedIndices));
  const [peerDoneIndices, setPeerDoneIndices] = useState(new Set(initialPeerDoneIndices));
  const [dismissedIndices, setDismissedIndices] = useState<Set<number>>(new Set());
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const [stage, setStage] = useState<"peer" | "checkpoint">("checkpoint");
  const [noteMode, setNoteMode] = useState<NoteMode>(null);
  const [noteText, setNoteText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => onAiRequestCount(taskId, setAiRequests), [taskId]);

  // Open the lowest not-yet-resolved, not-yet-dismissed checkpoint whose threshold is reached.
  useEffect(() => {
    if (openIndex !== null) return;
    const i = thresholds.findIndex(
      (t, idx) => aiRequests >= t && !resolvedIndices.has(idx) && !dismissedIndices.has(idx),
    );
    if (i === -1) return;
    setOpenIndex(i);
    setStage(peerEnabled && i === peerIndex && !peerDoneIndices.has(i) ? "peer" : "checkpoint");
    setNoteMode(null);
    setNoteText("");
    setError(null);
  }, [aiRequests, resolvedIndices, peerDoneIndices, dismissedIndices, thresholds, peerEnabled, peerIndex, openIndex]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (openIndex !== null && !dialog.open) dialog.showModal();
    if (openIndex === null && dialog.open) dialog.close();
  }, [openIndex]);

  function handleCancel() {
    if (openIndex === null) return;
    setDismissedIndices((s) => new Set(s).add(openIndex));
    setOpenIndex(null);
  }

  async function endPeerStage(outcome: PeerEndOutcome) {
    if (openIndex === null) return;
    try {
      await post("/api/peer", { taskId, index: openIndex, end: outcome });
    } catch {
      // Best-effort log; still move on to the checkpoint choices locally.
    }
    setPeerDoneIndices((s) => new Set(s).add(openIndex));
    setStage("checkpoint");
  }

  async function resolve(action: CheckpointAction, note?: string) {
    if (openIndex === null) return;
    setBusy(true);
    setError(null);
    try {
      if (action === "pause") await pause();
      if (action === "finish") {
        await post("/api/task/complete", { taskId });
        setStatus("complete");
      }
      await post("/api/checkpoint", { taskId, index: openIndex, action, note });
      setResolvedIndices((s) => new Set(s).add(openIndex));
      setOpenIndex(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function choose(action: CheckpointAction) {
    if (action === "continue" || action === "flag") {
      setNoteMode(action);
      return;
    }
    resolve(action);
  }

  function submitNote(e: React.FormEvent) {
    e.preventDefault();
    const note = noteText.trim();
    if (noteMode === "continue" && !note) return;
    resolve(noteMode as CheckpointAction, note || undefined);
  }

  return (
    <dialog ref={dialogRef} className="checkpoint-dialog" onCancel={handleCancel}>
      {openIndex !== null && stage === "peer" ? (
        <PeerStage taskId={taskId} onDone={endPeerStage} />
      ) : (
        <div>
          <p>
            <strong>Completion checkpoint</strong>
          </p>
          {plan && (
            <p>
              Your threshold: <em>{plan.goodEnough}</em>
            </p>
          )}
          <p>Does the draft meet your threshold?</p>
          {noteMode === null ? (
            <div className="toolbar">
              <button type="button" onClick={() => choose("finish")} disabled={busy}>
                Finish task
              </button>
              <button type="button" onClick={() => choose("continue")} disabled={busy}>
                Continue
              </button>
              <button type="button" onClick={() => choose("pause")} disabled={busy}>
                Pause
              </button>
              <button type="button" onClick={() => choose("flag")} disabled={busy}>
                Flag for later
              </button>
            </div>
          ) : (
            <form onSubmit={submitNote}>
              <label>
                {noteMode === "continue" ? "Reason to continue" : "Note (optional)"}
                <textarea
                  rows={2}
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  required={noteMode === "continue"}
                />
              </label>
              <div className="toolbar">
                <button type="submit" disabled={busy || (noteMode === "continue" && !noteText.trim())}>
                  {noteMode === "continue" ? "Save reason and return" : "Save note and return"}
                </button>
                <button type="button" onClick={() => setNoteMode(null)} disabled={busy}>
                  Back
                </button>
              </div>
            </form>
          )}
          {error && <p className="save-status not-saved">{error}</p>}
        </div>
      )}
    </dialog>
  );
}
