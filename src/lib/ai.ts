import { prisma } from "./db";
import type { Task } from "./config";
import type { Version } from "./constants";

/** Chat model used for both AI versions, configurable without a code change. */
export const AI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

/** Calls the configured OpenAI chat model and returns the assistant's reply text. */
export async function callChatModel(messages: ChatMessage[]): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  const res = await fetch(OPENAI_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model: AI_MODEL, messages, temperature: 0.4 }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const reply = data.choices?.[0]?.message?.content;
  if (typeof reply !== "string" || !reply) throw new Error("OpenAI returned an empty reply");
  return reply;
}

/**
 * System prompt: grounds the assistant in the task instructions and the participant's
 * current draft. For the sustainable version it also withholds the model's default habit
 * of inviting further revisions — the study's cognitive-closure manipulation (see the
 * project brief's "sustainable-AI-practice treatment" section) — since the AI must not
 * routinely nudge participants toward more iteration.
 */
export function buildSystemPrompt(task: Task, draftContent: string, version: Version): string {
  const lines = [
    "You are a writing assistant helping a study participant with a marketing task.",
    "Answer using the task instructions and the participant's own draft below; don't invent",
    "facts outside them. Be concise and practical.",
    "",
    `Task: ${task.title}`,
    ...task.instructions.map((line) => `- ${line}`),
    "",
    draftContent
      ? `Participant's current draft:\n${draftContent}`
      : "The participant has not written anything yet.",
  ];

  if (version === "sustainable") {
    lines.push(
      "",
      "Respond only to what the participant asks. Do not end your replies by suggesting further",
      "revisions, offering to keep improving the draft, or asking whether they want more changes,",
      "unless they explicitly ask what else could be improved. Let the participant decide when to",
      "continue; never imply the work is incomplete just because more could theoretically be done.",
    );
  }

  return lines.join("\n");
}

export type AiMessage = { id: number; role: "user" | "assistant"; content: string; timestamp: string };

/** Reconstructs the saved AI conversation for a task from the append-only event log. */
export async function getConversation(sessionId: string, taskId: string): Promise<AiMessage[]> {
  const events = await prisma.event.findMany({
    where: { sessionId, taskId, eventType: { in: ["ai_user_message", "ai_assistant_message"] } },
    orderBy: { timestamp: "asc" },
  });
  return events
    .map((e) => ({
      id: e.id,
      role: (e.eventType === "ai_user_message" ? "user" : "assistant") as "user" | "assistant",
      content: String((e.payload as { text?: string } | null)?.text ?? ""),
      timestamp: e.timestamp.toISOString(),
    }))
    .filter((m) => m.content);
}
