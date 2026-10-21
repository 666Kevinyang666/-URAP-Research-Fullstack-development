import { prisma } from "./db";
import { STUDY } from "./config";

// Qualtrics surveys: "baseline" right after consent (before the instructions) and "end" after
// End work (before the interview). Both leave with ?sid= and come back through
// /survey/return?survey=<kind>&sid=<sid>, which logs survey_returned. See README "Qualtrics setup".
export const SURVEY_KINDS = ["baseline", "end"] as const;
export type SurveyKind = (typeof SURVEY_KINDS)[number];

export function isSurveyKind(v: unknown): v is SurveyKind {
  return typeof v === "string" && (SURVEY_KINDS as readonly string[]).includes(v);
}

/** config/study.json URL for a survey: a full Qualtrics link, or an app path (the local placeholder). */
export function surveyConfigUrl(kind: SurveyKind): string {
  return kind === "baseline" ? STUDY.baselineSurveyUrl : STUDY.endSurveyUrl;
}

/** Whether the participant has come back from this survey (survey_returned logged). */
export async function hasReturnedFromSurvey(sessionId: string, kind: SurveyKind): Promise<boolean> {
  const rows = await prisma.event.findMany({
    where: { sessionId, eventType: "survey_returned" },
    select: { payload: true },
  });
  return rows.some((r) => (r.payload as { survey?: unknown } | null)?.survey === kind);
}
