import { prisma } from "./db";
import { TASKS } from "./config";
import type { CurrentSession } from "./session";

/**
 * Where a participant is in the study flow:
 *   consent -> instructions (with understanding check) -> welcome (Start work) -> work -> ended
 * Declining consent ends the session at "declined". Derived from the event log
 * (consent_given / consent_declined / understanding_check_passed) and Session.workStartedAt,
 * so it survives refreshes and resumed /start links.
 */
export type JourneyStage = "consent" | "declined" | "instructions" | "welcome" | "work" | "ended";

export async function getJourneyStage(s: CurrentSession): Promise<JourneyStage> {
  const events = await prisma.event.findMany({
    where: {
      sessionId: s.sessionId,
      eventType: { in: ["consent_given", "consent_declined", "understanding_check_passed"] },
    },
    select: { eventType: true },
  });
  const has = (t: string) => events.some((e) => e.eventType === t);
  if (has("consent_declined")) return "declined";
  if (s.endedAt) return "ended";
  if (!has("consent_given")) return "consent";
  if (!has("understanding_check_passed")) return "instructions";
  if (!s.workStartedAt) return "welcome";
  return "work";
}

/** The page for a stage. "work" and "ended" go to the first task (which shows the ended page). */
export function stagePath(stage: JourneyStage): string {
  switch (stage) {
    case "consent":
      return "/consent";
    case "declined":
      return "/exit";
    case "instructions":
      return "/instructions";
    case "welcome":
      return "/welcome";
    default:
      return `/task/${encodeURIComponent(TASKS[0].id)}`;
  }
}
