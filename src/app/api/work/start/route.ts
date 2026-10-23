import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/logEvent";
import { getJourneyStage, stagePath } from "@/lib/journey";

// "Start work" on the welcome page. Sets Session.workStartedAt once; a repeat call
// (double click, resumed session) never resets it. -> { next }
export const POST = withSession(async (s) => {
  const stage = await getJourneyStage(s);
  if (stage !== "welcome" && stage !== "work") return error(409, "Please complete the earlier steps first.");

  const workStartedAt = new Date();
  const { count } = await prisma.session.updateMany({
    where: { sessionId: s.sessionId, workStartedAt: null },
    data: { workStartedAt },
  });
  if (count > 0) await logEvent(s.sessionId, s.version, null, "work_start", { workStartedAt: workStartedAt.toISOString() });
  return NextResponse.json({ next: stagePath("work") });
});
