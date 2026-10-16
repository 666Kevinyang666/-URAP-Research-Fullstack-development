"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { post } from "@/lib/clientApi";
import type { PeerV2EndOutcome, PeerVoiceMessage } from "@/lib/peerVoice";
import { PEER_CHECKIN_MS } from "@/lib/timing";
import { useWorkspace } from "./Workspace";

const MAX_RECORDING_MS = 60_000;
const POLL_MS = 2500;

function pickMimeType(): string | null {
  if (typeof MediaRecorder === "undefined") return null;
  for (const type of ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return null;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = reader.result as string;
      resolve(result.slice(result.indexOf(",") + 1)); // strip the "data:...;base64," prefix
    };
    reader.onerror = () => reject(reader.error ?? new Error("Could not read the recording"));
    reader.readAsDataURL(blob);
  });
}

/**
 * Recorder: captures a voice message via MediaRecorder. Falls back to a text box when the
 * microphone is unavailable or permission is denied — the room still works either way.
 */
function Recorder({ onSend, busy }: { onSend: (args: { audioBase64: string; mimeType: string; durationMs: number } | { text: string }) => void; busy: boolean }) {
  const [recording, setRecording] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [text, setText] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const stopTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const stop = useCallback(() => {
    recorderRef.current?.stop();
  }, []);

  useEffect(() => () => {
    if (stopTimerRef.current) clearTimeout(stopTimerRef.current);
    recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    setMicError(null);
    const mimeType = pickMimeType();
    if (!mimeType || !navigator.mediaDevices?.getUserMedia) {
      setMicError("Voice recording isn't available in this browser. Use the text box below instead.");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setRecording(false);
        const durationMs = Date.now() - startedAtRef.current;
        const blob = new Blob(chunksRef.current, { type: mimeType });
        try {
          const audioBase64 = await blobToBase64(blob);
          onSend({ audioBase64, mimeType, durationMs });
        } catch (e) {
          setMicError((e as Error).message);
        }
      };
      recorderRef.current = recorder;
      startedAtRef.current = Date.now();
      recorder.start();
      setRecording(true);
      stopTimerRef.current = setTimeout(stop, MAX_RECORDING_MS);
    } catch {
      setMicError("Microphone access was denied. Use the text box below instead.");
    }
  }

  function sendText(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed) return;
    onSend({ text: trimmed });
    setText("");
  }

  return (
    <div>
      <div className="toolbar">
        {recording ? (
          <button type="button" onClick={stop} disabled={busy}>
            Stop recording
          </button>
        ) : (
          <button type="button" onClick={start} disabled={busy}>
            Record a voice message
          </button>
        )}
        {recording && <span aria-live="polite">Recording… (up to 60s)</span>}
      </div>
      {micError && <p className="save-status not-saved">{micError}</p>}
      <form onSubmit={sendText} className="chat-input-row">
        <textarea
          className="chat-input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Or write a message"
          aria-label="Text message to your peer"
          disabled={busy || recording}
        />
        <button type="submit" disabled={busy || recording || !text.trim()}>
          Send
        </button>
      </form>
    </div>
  );
}

function MessageBubble({ m }: { m: PeerVoiceMessage }) {
  return (
    <div className={`chat-message chat-message-${m.from === "me" ? "user" : "assistant"}`}>
      <span className="chat-role">{m.from === "me" ? "You" : "Peer"}</span>
      {m.kind === "voice" && m.audio ? (
        // eslint-disable-next-line jsx-a11y/media-has-caption
        <audio controls src={m.audio} />
      ) : (
        <p>{m.text}</p>
      )}
    </div>
  );
}

/**
 * Peer check-in v2, treatment prompt 3 (versions with features.peerChat). Invited once,
 * at the session clock's peerCheckinMinutes (default 90:00, including paused time — unlike
 * break prompts, this one is shown to everyone still working, paused or not). A private
 * voice room with each paired participant, with a text fallback when the mic isn't usable.
 */
export default function PeerCheckinV2({ initialShown, initialEnded }: { initialShown: boolean; initialEnded: boolean }) {
  const { taskId, promptsStopped, claimPrompt, releasePrompt, saveNow, sessionElapsedMs } = useWorkspace();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const shownRef = useRef(initialShown);
  const endedRef = useRef(initialEnded);
  const [open, setOpen] = useState(false);
  const [peerSessionId, setPeerSessionId] = useState<string | null>(null);
  const [available, setAvailable] = useState(true);
  const [messages, setMessages] = useState<PeerVoiceMessage[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tryOpen = useCallback(() => {
    if (open || endedRef.current || promptsStopped) return;
    if (!claimPrompt("peer-checkin-v2")) return; // another prompt is open; retry next tick
    (async () => {
      await saveNow(); // save the draft before showing the prompt
      try {
        const { alreadyShown } = await post<{ alreadyShown: boolean }>("/api/peer-checkin-v2", { shown: true });
        shownRef.current = true;
        if (alreadyShown && endedRef.current) {
          releasePrompt("peer-checkin-v2"); // ended in another tab since this page loaded
          return;
        }
      } catch {
        // Still show it; "shown" is best-effort logging.
      }
      setOpen(true);
    })();
  }, [open, promptsStopped, claimPrompt, releasePrompt, saveNow]);

  // Already shown but not ended (e.g. a refresh mid-conversation): reopen on mount.
  useEffect(() => {
    if (initialShown && !initialEnded) tryOpen();
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Not yet shown: check every second against the session clock. Fires even while paused,
  // per the treatment prompt doc — "the invite goes to everyone still working".
  useEffect(() => {
    if (shownRef.current || endedRef.current || promptsStopped) return;
    const id = setInterval(() => {
      const elapsed = sessionElapsedMs();
      if (elapsed !== null && elapsed >= PEER_CHECKIN_MS) tryOpen();
    }, 1000);
    return () => clearInterval(id);
  }, [promptsStopped, sessionElapsedMs, tryOpen]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (promptsStopped && open) setOpen(false);
  }, [promptsStopped, open]);

  // Poll the room while open.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    async function poll() {
      try {
        const res = await fetch("/api/peer-checkin-v2");
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
    const id = setInterval(poll, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [open]);

  async function end(outcome: PeerV2EndOutcome) {
    setBusy(true);
    try {
      await post("/api/peer-checkin-v2", { end: outcome });
    } catch {
      // Best-effort log; still let the participant return to work.
    }
    endedRef.current = true;
    setOpen(false);
    releasePrompt("peer-checkin-v2"); // budget checkpoint (if due) picks this up on its own tick
    setBusy(false);
  }

  async function send(args: { audioBase64: string; mimeType: string; durationMs: number } | { text: string }) {
    setError(null);
    try {
      await post("/api/peer-checkin-v2", args);
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const sentAny = messages.some((m) => m.from === "me");

  return (
    <dialog
      ref={dialogRef}
      className="prompt-dialog"
      aria-labelledby="peer-checkin-v2-title"
      onCancel={(e) => e.preventDefault() /* must choose a way to end the room */}
    >
      {open && (
        <>
          <h2 id="peer-checkin-v2-title">Check in with your peer</h2>
          {!loaded ? (
            <p>Connecting…</p>
          ) : !peerSessionId ? (
            <>
              <p>No peer has been paired with this session.</p>
              <button type="button" onClick={() => end("peer_unavailable")} disabled={busy}>
                Continue working
              </button>
            </>
          ) : (
            <div>
              <p>Discuss what makes your work complete, by voice or text.</p>
              {!available && (
                <p className="save-status not-saved">
                  Your peer isn&apos;t in their session right now; messages will wait for them.
                </p>
              )}
              <div className="chat-messages" aria-live="polite">
                {messages.length === 0 && <p className="chat-empty">No messages yet.</p>}
                {messages.map((m) => (
                  <MessageBubble key={m.id} m={m} />
                ))}
              </div>
              {error && <p className="save-status not-saved">{error}</p>}
              <Recorder onSend={send} busy={busy} />
              <div className="toolbar">
                <button type="button" onClick={() => end("returned")} disabled={busy}>
                  Return to task
                </button>
                <button type="button" onClick={() => end(sentAny ? "left" : "declined")} disabled={busy}>
                  {sentAny ? "Leave" : "Decline"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </dialog>
  );
}
