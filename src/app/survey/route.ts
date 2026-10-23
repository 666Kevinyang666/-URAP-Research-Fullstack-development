import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { logEvent } from "@/lib/logEvent";
import { getJourneyStage, stagePath } from "@/lib/journey";
import { publicOrigin, publicUrl } from "@/lib/origin";
import { isSurveyKind, surveyConfigUrl } from "@/lib/surveys";

// "Continue to survey": /survey?survey=baseline|end (default end). Redirects to that survey's
// URL from config/study.json (baselineSurveyUrl / endSurveyUrl) with ?sid= appended, plus
// return_url: where the survey should send the participant back (/survey/return), on whatever
// host they're using, for Qualtrics setups that redirect to ${e://Field/return_url}.
export async function GET(req: NextRequest) {
  const s = await getCurrentSession();
  if (!s) return new NextResponse("No active session. Please use the link from the study.", { status: 401 });

  const requested = req.nextUrl.searchParams.get("survey") ?? "end";
  const survey = isSurveyKind(requested) ? requested : "end";

  // Only send someone to the baseline survey at that step (not again after returning).
  if (survey === "baseline") {
    const stage = await getJourneyStage(s);
    if (stage !== "baseline_survey") return NextResponse.redirect(publicUrl(req.headers, stagePath(stage)));
  }

  const url = publicUrl(req.headers, surveyConfigUrl(survey));
  url.searchParams.set("sid", s.sessionId);
  const returnUrl = new URL("/survey/return", publicOrigin(req.headers));
  returnUrl.searchParams.set("survey", survey);
  returnUrl.searchParams.set("sid", s.sessionId);
  url.searchParams.set("return_url", returnUrl.toString());

  await logEvent(s.sessionId, s.version, null, "survey_redirect", {
    survey,
    from: req.nextUrl.searchParams.get("from"),
  });
  return NextResponse.redirect(url);
}
