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
