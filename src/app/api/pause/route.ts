import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { logEvent } from "@/lib/logEvent";
import { getPauseState } from "@/lib/pause";
import { BREAK_LENGTH_MS, BREAK_PROMPT_TIMES_MS } from "@/lib/timing";

// Pause or resume work (all versions).
// Body: { taskId, action: "pause" | "resume", clientTs?, reason?: "manual" | "break", breakIndex? }
// Logs task_pause / task_resume only on an actual state change. Resuming from a break
// (a pause with reason "break", from a break prompt) also logs break_ended with its duration.
export const POST = withSession(async (s, body) => {
  if (typeof body.taskId !== "string") return error(400, "taskId is required");
  if (body.action !== "pause" && body.action !== "resume") return error(400, "action must be pause or resume");
  const clientTs = typeof body.clientTs === "string" ? body.clientTs : null;

  const state = await getPauseState(s.sessionId);
  if (body.action === "pause") {
    if (state.paused) return NextResponse.json({ paused: true, changed: false });
    const breakIndex = Number(body.breakIndex);
    const isBreak =
      body.reason === "break" &&
      Number.isInteger(breakIndex) &&
      breakIndex >= 0 &&
      breakIndex < BREAK_PROMPT_TIMES_MS.length;
    await logEvent(
      s.sessionId,
      s.version,
      body.taskId,
      "task_pause",
      isBreak ? { clientTs, reason: "break", breakIndex } : { clientTs, reason: "manual" },
    );
    return NextResponse.json({ paused: true, changed: true });
  }

  if (!state.paused) return NextResponse.json({ paused: false, changed: false });
  const pausedMs = Date.now() - state.since.getTime();
  await logEvent(s.sessionId, s.version, body.taskId, "task_resume", {
    clientTs,
    pausedMs,
    pausedOnTaskId: state.taskId,
  });
  if (state.reason === "break") {
    await logEvent(s.sessionId, s.version, body.taskId, "break_ended", {
      breakIndex: state.breakIndex,
      durationMs: pausedMs,
      fullBreakTaken: pausedMs >= BREAK_LENGTH_MS,
    });
  }
  return NextResponse.json({ paused: false, changed: true });
});
