import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { logEvent } from "@/lib/logEvent";
import { AI_MODEL, callChatModel, type ChatMessage } from "@/lib/ai";
import {
  buildInterviewSystemPrompt,
  getCurrentInterviewStep,
  getInterviewConversation,
  mockFollowUp,
  nextInterviewStep,
  scriptedInterviewMessage,
} from "@/lib/interview";

const MAX_MESSAGE_LENGTH = 4000;
const MAX_HISTORY_MESSAGES = 30;

// End-of-session AI interview proxy (session-level, every version including "none").
// Runs after End work, so it must work on an ended session: { allowEnded: true }.
// Body: { message } to talk, or { finish: true } to log that the interview ended.
export const POST = withSession(
  async (s, body) => {
    if (body.finish === true) {
      await logEvent(s.sessionId, s.version, null, "interview_finished", {});
      return NextResponse.json({ ok: true });
    }

    if (typeof body.message !== "string" || !body.message.trim()) {
      return error(400, "message is required");
    }
    const message = body.message.trim().slice(0, MAX_MESSAGE_LENGTH);

    const prior = await getInterviewConversation(s.sessionId);
    const history: ChatMessage[] = prior
      .slice(-MAX_HISTORY_MESSAGES)
      .map((m) => ({ role: m.role, content: m.content }));

    await logEvent(s.sessionId, s.version, null, "interview_user_message", { text: message, model: AI_MODEL });

    // [Nitin, week 4] The server walks the guide: after a question, the model asks one
    // follow-up; after a follow-up, the next question (or the closing line) is sent word for
    // word without a model call. A failed call logs no reply, so a retry stays on the same step.
    const step = nextInterviewStep(await getCurrentInterviewStep(s.sessionId), s.version);
    if (step.kind !== "follow_up") {
      const reply = scriptedInterviewMessage(step, s.version);
      await logEvent(s.sessionId, s.version, null, "interview_assistant_message", {
        text: reply,
        model: "guide", // [Nitin, week 4] scripted, not model-generated
        usage: null,
        step,
      });
      return NextResponse.json({ reply, model: "guide" });
    }

    const systemPrompt = buildInterviewSystemPrompt(s.version, step.index);

    try {
      const { text: reply, usage } = await callChatModel(
        [{ role: "system", content: systemPrompt }, ...history, { role: "user", content: message }],
        { mockReply: mockFollowUp() }, // [Nitin, week 4] follow-up text in mock mode
      );
      await logEvent(s.sessionId, s.version, null, "interview_assistant_message", {
        text: reply,
        model: AI_MODEL,
        usage,
        step, // [Nitin, week 4]
      });
      return NextResponse.json({ reply, model: AI_MODEL });
    } catch (e) {
      await logEvent(s.sessionId, s.version, null, "interview_error", {
        message: (e as Error).message,
        model: AI_MODEL,
      });
      return error(502, "Interview assistant is unavailable right now. Please try again.");
    }
  },
  { allowEnded: true },
);
