import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/logEvent";
import { SID_COOKIE, isVersion } from "@/lib/constants";
import { getJourneyStage, stagePath } from "@/lib/journey";
import { publicUrl } from "@/lib/origin";
import { isSurveyKind } from "@/lib/surveys";

// Where a survey sends the participant back: /survey/return?survey=baseline|end&sid=<sid>.
// Set this as the Qualtrics end-of-survey redirect (see README "Qualtrics setup"). Logs
// survey_returned once per survey, restores the sid cookie (in case the survey ran in another
// tab or browser profile), and continues to the participant's next step: the instructions
// after the baseline survey, the interview after the end survey.
export async function GET(req: NextRequest) {
  const survey = req.nextUrl.searchParams.get("survey");
  const sid = req.nextUrl.searchParams.get("sid")?.trim() || req.cookies.get(SID_COOKIE)?.value;
  if (!isSurveyKind(survey)) return new NextResponse("Unknown survey.", { status: 400 });
  if (!sid) return new NextResponse("Missing sid. Please use the link from the study.", { status: 400 });

  const row = await prisma.session.findUnique({ where: { sessionId: sid } });
  if (!row || !isVersion(row.version)) {
    return new NextResponse("Session not found. Please use the link from the study.", { status: 404 });
  }
  const session = {
    sessionId: row.sessionId,
    version: row.version,
    endedAt: row.endedAt,
    workStartedAt: row.workStartedAt,
  };

  // Log the return only at the step it belongs to, so a stale or repeated link can't skip ahead.
  const stage = await getJourneyStage(session);
  if ((survey === "baseline" && stage === "baseline_survey") || (survey === "end" && stage === "end_survey")) {
    await logEvent(sid, session.version, null, "survey_returned", { survey });
  }

  const next = await getJourneyStage(session);
  const res = NextResponse.redirect(publicUrl(req.headers, stagePath(next)));
  res.cookies.set(SID_COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
