"use client";

import { useRef, useState } from "react";
import type { InterviewMessage } from "@/lib/interview";
import { post } from "@/lib/clientApi";

type Status = "idle" | "sending" | "error";

/** End-of-session AI interview (every version, including "none"). */
export default function InterviewChat({ initialMessages }: { initialMessages: InterviewMessage[] }) {
  const [messages, setMessages] = useState<InterviewMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [finishing, setFinishing] = useState(false);
  const nextTempId = useRef(-1);

  async function send() {
    const text = input.trim();
    if (!text || status === "sending") return;

    const userMsg: InterviewMessage = {
      id: nextTempId.current--,
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setStatus("sending");
    setErrorMsg(null);

    try {
      const data = await post<{ reply: string }>("/api/interview", { message: text });
      setMessages((m) => [
        ...m,
        { id: nextTempId.current--, role: "assistant", content: data.reply, timestamp: new Date().toISOString() },
      ]);
      setStatus("idle");
    } catch (e) {
      setStatus("error");
      setErrorMsg((e as Error).message);
      // Keep the participant's text so they can retry without retyping it.
      setInput(text);
      setMessages((m) => m.filter((msg) => msg.id !== userMsg.id));
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  async function finish() {
    setFinishing(true);
    try {
      await post("/api/interview", { finish: true });
    } catch {
      // Best-effort log; still let the participant move on to the completion page.
    }
    window.location.assign("/complete");
  }

  return (
    <div className="chat-pane" id="interview-chat">
      <div className="chat-messages" aria-live="polite">
        {messages.map((m) => (
          <div key={m.id} className={`chat-message chat-message-${m.role}`}>
            <span className="chat-role">{m.role === "user" ? "You" : "Interviewer"}</span>
            <p>{m.content}</p>
          </div>
        ))}
        {status === "sending" && <p className="chat-pending">…</p>}
      </div>

      {errorMsg && <p className="save-status not-saved">{errorMsg}</p>}

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a message"
          aria-label="Message to the interviewer"
          disabled={status === "sending"}
        />
        <button type="button" onClick={send} disabled={status === "sending" || !input.trim()}>
          Send
        </button>
      </div>

      <div className="toolbar">
        <button type="button" onClick={finish} disabled={finishing}>
          Finish interview
        </button>
      </div>
    </div>
  );
}
