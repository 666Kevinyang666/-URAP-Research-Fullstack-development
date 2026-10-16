import { prisma } from "./db";
import { BRIEF, type BriefPage, type Task } from "./config";
import type { Version } from "./constants";

/** Chat model used for both AI versions, configurable without a code change. */
export const AI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-5.6-terra";

const OPENAI_URL = "https://api.openai.com/v1/chat/completions";
const TEMPERATURE = 0.4;

export type ChatMessage = { role: "system" | "user" | "assistant"; content: string };
export type ChatUsage = Record<string, unknown>;
export type ChatResult = { text: string; usage: ChatUsage | null };

async function postChatCompletion(apiKey: string, messages: ChatMessage[], withTemperature: boolean) {
  const body: Record<string, unknown> = { model: AI_MODEL, messages };
  if (withTemperature) body.temperature = TEMPERATURE;
  return fetch(OPENAI_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
}

/** True if the response is OpenAI's "this model doesn't support a custom temperature" error. */
function isUnsupportedTemperatureError(status: number, data: unknown): boolean {
  if (status !== 400) return false;
  const err = (data as { error?: { param?: unknown; message?: unknown } } | null)?.error;
  if (err?.param === "temperature") return true;
  return typeof err?.message === "string" && err.message.toLowerCase().includes("temperature");
}

/**
 * Calls the configured OpenAI chat model and returns the reply text plus token usage (for
 * cost tracking — see ai_assistant_message/interview_assistant_message events). Some
 * reasoning-tier models reject a custom temperature; on that specific error, retries once
 * without it rather than failing the whole request.
 */
export async function callChatModel(messages: ChatMessage[]): Promise<ChatResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY is not configured");

  let res = await postChatCompletion(apiKey, messages, true);

  if (!res.ok) {
    const detail = await res.clone().text();
    const parsed = await res.json().catch(() => null);
    if (isUnsupportedTemperatureError(res.status, parsed)) {
      res = await postChatCompletion(apiKey, messages, false);
    } else {
      throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
    }
  }

  // Only reached if the first call was ok, or the temperature retry just ran.
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`OpenAI request failed (${res.status}): ${detail.slice(0, 300)}`);
  }

  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text) throw new Error("OpenAI returned an empty reply");
  const usage = data.usage && typeof data.usage === "object" ? (data.usage as ChatUsage) : null;
  return { text, usage };
}

/** Flattens the Frame Marketing Brief (config/brief.json, via @/lib/config's BRIEF) to plain lines. */
function formatBrief(pages: BriefPage[]): string[] {
  const lines: string[] = [];
  for (const page of pages) {
    if (page.heading) lines.push(`## ${page.heading}`);
    lines.push(...page.intro);
    for (const section of page.sections) {
      lines.push(`### ${section.heading}`);
      if (section.paragraphs) lines.push(...section.paragraphs);
      for (const item of section.items ?? []) {
        lines.push(item.label ? `- ${item.label}: ${item.text}` : `- ${item.text}`);
      }
    }
  }
  return lines;
}

/**
 * System prompt: grounds the assistant in the Frame Marketing Brief, the task instructions,
 * and the participant's current draft. For the sustainable version it also withholds the
 * model's default habit of inviting further revisions — the study's cognitive-closure
 * manipulation (see the project brief's "sustainable-AI-practice treatment" section) — since
 * the AI must not routinely nudge participants toward more iteration.
 */
export function buildSystemPrompt(task: Task, draftContent: string, version: Version): string {
  const lines = [
    "You are a writing assistant helping a study participant with a marketing task for Frame.",
    "Answer using the brief, the task instructions, and the participant's own draft below; don't",
    "invent facts outside them. Be concise and practical.",
    "",
    `Frame Marketing Brief: ${BRIEF.title}`,
    ...formatBrief(BRIEF.pages),
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
