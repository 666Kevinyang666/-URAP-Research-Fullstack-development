import { prisma } from "./db";
import type { Version } from "./constants";
import interviewConfig from "@config/interview.json";

const QUESTIONS: string[] = interviewConfig.questions;

export type InterviewMessage = { id: number; role: "user" | "assistant"; content: string; timestamp: string };

/**
 * Deterministic opening line (not model-generated), so the interview always starts
 * immediately without a round trip. Must be relevant to every version, since it's shown
 * before the model sees which questions to skip — keep question 1 version-agnostic.
 */
export function getOpeningMessage(): string {
  return `Thanks for finishing the tasks and the survey. I have a few quick questions about your experience — about five minutes.\n\nTo start: ${QUESTIONS[0]}`;
}

/**
 * System prompt for the end-of-session AI interview (all versions, including "none",
 * per the brief). Walks the fixed question guide one at a time; skips questions that
 * don't apply to this participant's version instead of omitting them from the shared
 * guide, so the guide itself stays one source of truth across versions.
 */
export function buildInterviewSystemPrompt(version: Version): string {
  const lines = [
    "You are conducting a short, five-minute text interview with a study participant who just finished",
    "a set of writing tasks and an end-of-session survey. Ask the questions below one at a time, in order,",
    "moving to the next only after the participant has answered the current one. Keep your own messages",
    'brief and conversational, not clinical. After the last applicable question, thank the participant and',
    'let them know they can click "Finish interview" when ready. Do not ask about anything outside this guide.',
    "",
    "Question guide:",
    ...QUESTIONS.map((q, i) => `${i + 1}. ${q}`),
    "",
    `This participant's version was "${version}".`,
  ];
  if (version === "none") {
    lines.push("They had no AI assistance — skip questions 4 and 5.");
  } else if (version === "standard") {
    lines.push("They had AI assistance but no peer check-in — skip question 5.");
  }
  return lines.join("\n");
}

/** The saved interview conversation for a session (session-level: taskId is always null). */
export async function getInterviewConversation(sessionId: string): Promise<InterviewMessage[]> {
  const events = await prisma.event.findMany({
    where: {
      sessionId,
      taskId: null,
      eventType: { in: ["interview_user_message", "interview_assistant_message"] },
    },
    orderBy: { timestamp: "asc" },
  });
  return events
    .map((e) => ({
      id: e.id,
      role: (e.eventType === "interview_user_message" ? "user" : "assistant") as "user" | "assistant",
      content: String((e.payload as { text?: string } | null)?.text ?? ""),
      timestamp: e.timestamp.toISOString(),
    }))
    .filter((m) => m.content);
}
