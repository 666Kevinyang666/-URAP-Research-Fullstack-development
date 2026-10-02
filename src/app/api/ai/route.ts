import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/logEvent";
import { getTask } from "@/lib/config";
import { AI_MODEL, buildSystemPrompt, callChatModel, type ChatMessage } from "@/lib/ai";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 20;

// AI proxy. Body: { taskId, message }
// Logs ai_user_message before calling the model and ai_assistant_message (or ai_error)
// after, so the conversation can be replayed from the event log alone.
export const POST = withSession(async (s, body) => {
  if (typeof body.taskId !== "string") return error(400, "taskId is required");
  const task = getTask(body.taskId);
  if (!task) return error(400, "Unknown taskId");
  if (typeof body.message !== "string" || !body.message.trim()) {
    return error(400, "message is required");
  }
  const message = body.message.trim().slice(0, MAX_MESSAGE_LENGTH);

  const [draft, priorEvents] = await Promise.all([
    prisma.draft.findUnique({ where: { sessionId_taskId: { sessionId: s.sessionId, taskId: task.id } } }),
    prisma.event.findMany({
      where: {
        sessionId: s.sessionId,
        taskId: task.id,
        eventType: { in: ["ai_user_message", "ai_assistant_message"] },
      },
      orderBy: { timestamp: "desc" },
      take: MAX_HISTORY_MESSAGES,
    }),
  ]);

  const history: ChatMessage[] = priorEvents
    .reverse()
    .map((e) => ({
      role: e.eventType === "ai_user_message" ? ("user" as const) : ("assistant" as const),
      content: String((e.payload as { text?: string } | null)?.text ?? ""),
    }))
    .filter((m) => m.content);

  await logEvent(s.sessionId, s.version, task.id, "ai_user_message", { text: message, model: AI_MODEL });

  const systemPrompt = buildSystemPrompt(task, draft?.content ?? "", s.version);

  try {
    const reply = await callChatModel([
      { role: "system", content: systemPrompt },
      ...history,
      { role: "user", content: message },
    ]);

    await logEvent(s.sessionId, s.version, task.id, "ai_assistant_message", { text: reply, model: AI_MODEL });
    return NextResponse.json({ reply, model: AI_MODEL });
  } catch (e) {
    await logEvent(s.sessionId, s.version, task.id, "ai_error", {
      message: (e as Error).message,
      model: AI_MODEL,
    });
    return error(502, "AI assistant is unavailable right now. Please try again.");
  }
});
