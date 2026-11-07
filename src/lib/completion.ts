import { STUDY } from "./config";

// Task completion questions, asked when a participant marks a task complete (all versions),
// from the editor's "Mark task complete" button or the time-budget checkpoint.
// Logged as a task_completion_answers event; the event log keeps earlier answers when a
// task is reopened and completed again.

export const GOOD_ENOUGH_CHOICES = ["yes", "mostly", "no"] as const;
export type GoodEnoughChoice = (typeof GOOD_ENOUGH_CHOICES)[number];

export type CompletionAnswers = {
  skipped: boolean;
  why: string;
  goodEnough: GoodEnoughChoice | null;
  goodEnoughNote: string;
  /** Where the questions were shown: the editor button or the time-budget checkpoint. */
  source: "editor" | "checkpoint";
};

const MAX_TEXT = 4000;

/** Validate answers from a request body. Returns null if absent or malformed. */
export function parseCompletionAnswers(raw: unknown): CompletionAnswers | null {
  if (!raw || typeof raw !== "object") return null;
  const a = raw as Record<string, unknown>;
  const text = (v: unknown) => (typeof v === "string" ? v.trim().slice(0, MAX_TEXT) : "");
  const goodEnough = (GOOD_ENOUGH_CHOICES as readonly unknown[]).includes(a.goodEnough)
    ? (a.goodEnough as GoodEnoughChoice)
    : null;
  return {
    skipped: a.skipped === true,
    why: a.skipped === true ? "" : text(a.why),
    goodEnough: a.skipped === true ? null : goodEnough,
    goodEnoughNote: a.skipped === true ? "" : text(a.goodEnoughNote),
    source: a.source === "checkpoint" ? "checkpoint" : "editor",
  };
}

// ---- Minimum answer length (all versions) ----
// A task can be marked complete only when its saved answer in the main editor has at least
// minAnswerCharsToComplete non-whitespace characters (config/study.json, default 50), so an
// empty task can't be completed just to unlock End work. Checked in the browser for a quick
// message, and enforced on the server in setTaskStatus (@/lib/drafts) for every path: the
// editor button, the time-budget checkpoint, the AI-request checkpoint and direct API calls.
// Drafting notes (features.notesPad) don't count.

export const MIN_ANSWER_CHARS: number =
  typeof STUDY.minAnswerCharsToComplete === "number" && STUDY.minAnswerCharsToComplete >= 0
    ? STUDY.minAnswerCharsToComplete
    : 50;

export const ANSWER_TOO_SHORT_MESSAGE = "Write your answer in the editor before marking this task complete.";

/** Non-whitespace characters in an answer. */
export function answerChars(content: string): number {
  return content.replace(/\s/g, "").length;
}

export function isAnswerLongEnough(content: string): boolean {
  return answerChars(content) >= MIN_ANSWER_CHARS;
}
