import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/logEvent";
import { getJourneyStage, stagePath } from "@/lib/journey";

// Consent choice. Body: { choice: "consent" | "decline" } -> { next }
// Decline ends the session (endedAt) and leads to the /exit page.
export const POST = withSession(async (s, body) => {
  if (body.choice !== "consent" && body.choice !== "decline") return error(400, "choice must be consent or decline");
  const stage = await getJourneyStage(s);
  if (stage !== "consent") return NextResponse.json({ next: stagePath(stage) });

  if (body.choice === "consent") {
    await logEvent(s.sessionId, s.version, null, "consent_given", {});
    return NextResponse.json({ next: stagePath("instructions") });
  }
  await logEvent(s.sessionId, s.version, null, "consent_declined", {});
  await prisma.session.update({ where: { sessionId: s.sessionId }, data: { endedAt: new Date() } });
  return NextResponse.json({ next: stagePath("declined") });
});
