import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { getFeatures } from "@/lib/features";
import { logEvent } from "@/lib/logEvent";
import { BREAK_CHOICES, getHandledBreakIndices } from "@/lib/breaks";
import { BREAK_PROMPT_TIMES_MS } from "@/lib/timing";
import { getSessionClock } from "@/lib/sessionClock";

// Break prompts (see @/lib/breaks). Body: { taskId, breakIndex, ... }
//   { status: "shown" }                         -> break_prompt_shown (once per break)
//   { status: "skipped", reason: "paused" | "missed" } -> break_prompt_skipped (once per break)
//   { choice: "break" | "keep_working" }        -> break_prompt_choice
// -> { ok, alreadyHandled? }. The break itself is a pause with reason "break" (POST /api/pause),
// which logs break_ended with its duration on resume.
export const POST = withSession(async (s, body) => {
  if (!getFeatures(s.version).breakPrompts) return error(403, "Break prompts are not part of this version.");
  const taskId = typeof body.taskId === "string" ? body.taskId : null;
  const breakIndex = Number(body.breakIndex);
  if (!Number.isInteger(breakIndex) || breakIndex < 0 || breakIndex >= BREAK_PROMPT_TIMES_MS.length) {
    return error(400, "Unknown breakIndex");
  }
  const clock = await getSessionClock(s.sessionId);
  const sessionElapsedMs = clock?.elapsedMs ?? null;

  if (body.choice !== undefined) {
    if (!(BREAK_CHOICES as readonly unknown[]).includes(body.choice)) return error(400, "Unknown choice");
    await logEvent(s.sessionId, s.version, taskId, "break_prompt_choice", {
      breakIndex,
      choice: body.choice,
      sessionElapsedMs,
    });
    return NextResponse.json({ ok: true });
  }

  if (body.status !== "shown" && body.status !== "skipped") return error(400, "status must be shown or skipped");
  if ((await getHandledBreakIndices(s.sessionId)).includes(breakIndex)) {
    return NextResponse.json({ ok: true, alreadyHandled: true });
  }
  if (body.status === "shown") {
    await logEvent(s.sessionId, s.version, taskId, "break_prompt_shown", { breakIndex, sessionElapsedMs });
  } else {
    const reason = body.reason === "missed" ? "missed" : "paused";
    await logEvent(s.sessionId, s.version, taskId, "break_prompt_skipped", { breakIndex, reason, sessionElapsedMs });
  }
  return NextResponse.json({ ok: true, alreadyHandled: false });
});
