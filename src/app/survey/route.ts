import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { logEvent } from "@/lib/logEvent";
import { STUDY } from "@/lib/config";

// "Continue to survey": redirect to the Qualtrics URL from config/study.json with ?sid= appended.
export async function GET(req: NextRequest) {
  const s = await getCurrentSession();
  if (!s) return new NextResponse("No active session. Please use the link from the study.", { status: 401 });

  const url = new URL(STUDY.qualtricsUrl);
  url.searchParams.set("sid", s.sessionId);
  await logEvent(s.sessionId, s.version, null, "survey_redirect", {
    from: req.nextUrl.searchParams.get("from"),
  });
  return NextResponse.redirect(url);
}
