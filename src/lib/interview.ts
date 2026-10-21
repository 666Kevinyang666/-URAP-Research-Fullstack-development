import { prisma } from "./db";
import type { Version } from "./constants";
import interviewConfig from "@config/interview.json";

// [Nitin, week 4] The guide is now a list of { id, text, versions?, draft? } (config/interview.json),
// and the flow is driven here instead of by the model: question -> one AI follow-up -> next
// question -> ... -> closing. Only the follow-ups are model-generated; the guide's questions are
// asked word for word.
type GuideQuestion = { id: string; text: string; versions?: string[]; draft?: boolean };
const QUESTIONS: GuideQuestion[] = interviewConfig.questions;
const MOCK_FOLLOW_UP: string = interviewConfig.mockFollowUp;

export type InterviewMessage = { id: number; role: "user" | "assistant"; content: string; timestamp: string };

/** [Nitin, week 4] Guide questions asked in this version (AI and peer questions are skipped where they don't apply). */
export function getInterviewQuestions(version: Version): GuideQuestion[] {
  return QUESTIONS.filter((q) => !q.versions || q.versions.includes(version));
}

/**
 * [Nitin, week 4] Where the interview is, logged as `step` on each interview_assistant_message:
 * "question" = guide question `index` (into getInterviewQuestions) was just asked;
 * "follow_up" = the follow-up to it was just asked; "closing" = all questions are done.
 */
export type InterviewStep = { kind: "question" | "follow_up" | "closing"; index: number };

/**
 * Deterministic opening line (not model-generated), so the interview always starts
 * immediately without a round trip. Must be relevant to every version — keep question 1
 * version-agnostic.
 */
export function getOpeningMessage(): string {
  return `Thanks for finishing the tasks and the survey. I have a few quick questions about your experience — about five minutes.\n\nTo start: ${QUESTIONS[0].text}`;
}

/** [Nitin, week 4] The step after the participant answers the current one. */
export function nextInterviewStep(current: InterviewStep, version: Version): InterviewStep {
  const count = getInterviewQuestions(version).length;
  if (current.kind === "question") return { kind: "follow_up", index: current.index };
  if (current.kind === "follow_up" && current.index + 1 < count) return { kind: "question", index: current.index + 1 };
  return { kind: "closing", index: count };
}

/** [Nitin, week 4] Fixed text for question and closing steps (no model call). */
export function scriptedInterviewMessage(step: InterviewStep, version: Version): string {
  if (step.kind === "question") return `Thank you. Next question: ${getInterviewQuestions(version)[step.index].text}`;
  return "Thank you, that's all my questions. You can click \"Finish interview\" when you're ready.";
}

/** [Nitin, week 4] Follow-up used in mock AI mode (OPENAI_MODEL=mock or no API key). */
export function mockFollowUp(): string {
  return MOCK_FOLLOW_UP;
}

/**
 * System prompt for a follow-up in the end-of-session AI interview (all versions, including
 * "none", per the brief). [Nitin, week 4] The model now writes only the one follow-up to the
 * question just answered; the server asks the guide's questions (see nextInterviewStep).
 */
export function buildInterviewSystemPrompt(version: Version, questionIndex: number): string {
  const question = getInterviewQuestions(version)[questionIndex];
  return [
    "You are conducting a short, five-minute text interview with a study participant who just finished",
    "a set of writing tasks for a fictional company, Frame, and an end-of-session survey.",
    "",
    `The participant has just answered this question: "${question.text}"`,
    "",
    "Write exactly one short, neutral, open-ended follow-up question (one sentence, under 25 words) based on",
    "what they said, to learn a bit more about it. If their answer was very short or unclear, ask them to say",
    "a bit more. Do not ask about anything else, do not move on to another topic, and do not give opinions,",
    "advice, praise or a summary. Keep it conversational, not clinical.",
  ].join("\n");
}

/** [Nitin, week 4] The step of the last interviewer message (the opening question if none is logged). */
export async function getCurrentInterviewStep(sessionId: string): Promise<InterviewStep> {
  const events = await prisma.event.findMany({
    where: { sessionId, taskId: null, eventType: "interview_assistant_message" },
    orderBy: { id: "desc" },
    select: { payload: true },
  });
  for (const e of events) {
    const step = (e.payload as { step?: InterviewStep } | null)?.step;
    if (step && typeof step.index === "number") return step;
  }
  return { kind: "question", index: 0 };
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
