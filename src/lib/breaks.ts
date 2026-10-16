import { prisma } from "./db";

// Break prompts, treatment prompt 2 (versions with features.breakPrompts). Shown at the
// session-clock times in config/study.json (breakPromptMinutes, default 60:00 and 120:00,
// scaled by demoTimeScale). Each break is handled once: break_prompt_shown, or
// break_prompt_skipped if the participant was already paused (never rescheduled).

export const BREAK_CHOICES = ["break", "keep_working"] as const;
export type BreakChoice = (typeof BREAK_CHOICES)[number];

/** Break indices (into BREAK_PROMPT_TIMES_MS) already shown or skipped for this session. */
export async function getHandledBreakIndices(sessionId: string): Promise<number[]> {
  const rows = await prisma.event.findMany({
    where: { sessionId, eventType: { in: ["break_prompt_shown", "break_prompt_skipped"] } },
    select: { payload: true },
  });
  return rows
    .map((r) => (r.payload as { breakIndex?: unknown }).breakIndex)
    .filter((i): i is number => typeof i === "number");
}
