import { prisma } from "./db";
import { TASKS } from "./config";
import type { CurrentSession } from "./session";

/**
 * Where a participant is in the study flow:
 *   consent -> baseline_survey (Qualtrics) -> instructions (with understanding check)
 *   -> welcome (Start work) -> work -> end_survey (after End work) -> interview -> complete
 * Declining consent ends the session at "declined". Derived from the event log
 * (consent_given / consent_declined / survey_returned / understanding_check_passed /
 * interview_finished) and Session.workStartedAt / endedAt, so it survives refreshes and
 * resumed /start links.
 */
export type JourneyStage =
  | "consent"
  | "declined"
  | "baseline_survey"
  | "instructions"
  | "welcome"
  | "work"
  | "end_survey"
  | "interview"
  | "complete";

export async function getJourneyStage(s: CurrentSession): Promise<JourneyStage> {
  const events = await prisma.event.findMany({
    where: {
      sessionId: s.sessionId,
      eventType: {
        in: [
          "consent_given",
          "consent_declined",
          "survey_returned",
          "understanding_check_passed",
          "interview_finished",
        ],
      },
    },
    select: { eventType: true, payload: true },
  });
  const has = (t: string) => events.some((e) => e.eventType === t);
  const returnedFrom = (survey: string) =>
    events.some(
      (e) => e.eventType === "survey_returned" && (e.payload as { survey?: unknown } | null)?.survey === survey,
    );
  if (has("consent_declined")) return "declined";
  if (s.endedAt) {
    if (has("interview_finished")) return "complete";
    if (returnedFrom("end")) return "interview";
    return "end_survey";
  }
  if (!has("consent_given")) return "consent";
  if (!returnedFrom("baseline")) return "baseline_survey";
  if (!has("understanding_check_passed")) return "instructions";
  if (!s.workStartedAt) return "welcome";
  return "work";
}

/**
 * The page for a stage. "work" goes to the first task; "end_survey" too, since a task page
 * shows the "continue to survey" page once work has ended.
 */
export function stagePath(stage: JourneyStage): string {
  switch (stage) {
    case "consent":
      return "/consent";
    case "declined":
      return "/exit";
    case "baseline_survey":
      return "/survey?survey=baseline";
    case "instructions":
      return "/instructions";
    case "welcome":
      return "/welcome";
    case "interview":
      return "/interview";
    case "complete":
      return "/complete";
    default:
      return `/task/${encodeURIComponent(TASKS[0].id)}`;
  }
}
