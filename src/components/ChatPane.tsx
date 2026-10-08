"use client";

import { useRef, useState } from "react";
import type { Version } from "@/lib/constants";
import type { AiMessage } from "@/lib/ai";
import { notifyAiRequestSettled } from "@/lib/aiRequestCount"; // [Nitin, week 2] effort/checkpoint hook

type Props = {
  taskId: string;
  version: Version;
  initialMessages: AiMessage[];
};

type Status = "idle" | "sending" | "error";

/**
 * Live AI assistant pane (standard and sustainable versions only).
 * Conversation history is reloaded from the event log on each page visit, so it
 * survives a refresh or switching tasks and back (see getConversation in @/lib/ai).
 */
export default function ChatPane({ taskId, version, initialMessages }: Props) {
  const [messages, setMessages] = useState<AiMessage[]>(initialMessages);
  const [input, setInput] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<number | null>(null);
  const nextTempId = useRef(-1);

  async function send() {
    const text = input.trim();
    if (!text || status === "sending") return;

    const userMsg: AiMessage = {
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
      const res = await fetch("/api/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskId, message: text }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
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
    // [Nitin, week 2] Effort/checkpoint hook: refresh this task's AI request count
    // (onAiRequestCount subscribers in @/lib/aiRequestCount). No effect on the chat itself.
    notifyAiRequestSettled(taskId);
  }

  async function copyReply(id: number, content: string) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedId(id);
      setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1500);
    } catch {
      // Clipboard unavailable; nothing to fall back to in a plain-text prototype.
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  }

  return (
    <div className="chat-pane" id="ai-chat-pane" data-task-id={taskId} data-version={version}>
      <strong>AI assistant</strong>
      <p className="chat-subtitle">Uses task materials and your saved draft</p>

      <div className="chat-messages" aria-live="polite">
        {messages.length === 0 && <p className="chat-empty">No messages yet. Ask for help below.</p>}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message chat-message-${m.role}`}>
            <span className="chat-role">{m.role === "user" ? "You" : "AI"}</span>
            <p>{m.content}</p>
            {m.role === "assistant" && (
              <button type="button" className="copy-reply" onClick={() => copyReply(m.id, m.content)}>
                {copiedId === m.id ? "Copied" : "Copy reply"}
              </button>
            )}
          </div>
        ))}
        {status === "sending" && <p className="chat-pending">AI is replying…</p>}
      </div>

      {errorMsg && <p className="save-status not-saved">{errorMsg}</p>}

      <div className="chat-input-row">
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Write a message"
          aria-label="Message to AI assistant"
          disabled={status === "sending"}
        />
        <button type="button" onClick={send} disabled={status === "sending" || !input.trim()}>
          Send
        </button>
      </div>
    </div>
  );
}
