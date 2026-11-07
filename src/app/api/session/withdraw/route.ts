import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { withdraw } from "@/lib/drafts";
import { getJourneyStage, stagePath } from "@/lib/journey";

// "Withdraw from study" (sidebar footer, every version, any time during the work period).
// Body: { taskId?, content? } -> { next } (the exit page). Saves and snapshots everything,
// sets endedAt and logs `withdrawn`; the end survey and interview are skipped.
export const POST = withSession(async (s, body) => {
  if ((await getJourneyStage(s)) !== "work") return error(409, "Withdrawal is available during the work period.");
  const taskId = typeof body.taskId === "string" ? body.taskId : null;
  const content = typeof body.content === "string" ? body.content : undefined;
  await withdraw(s, taskId, content);
  return NextResponse.json({ next: stagePath("withdrawn") });
});
