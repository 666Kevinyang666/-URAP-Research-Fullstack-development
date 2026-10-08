import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { logEvent } from "@/lib/logEvent";
import { getPauseState } from "@/lib/pause";

// Pause or resume work (all versions). Body: { taskId, action: "pause" | "resume", clientTs? }
// Logs task_pause / task_resume only on an actual state change.
export const POST = withSession(async (s, body) => {
  if (typeof body.taskId !== "string") return error(400, "taskId is required");
  if (body.action !== "pause" && body.action !== "resume") return error(400, "action must be pause or resume");
  const clientTs = typeof body.clientTs === "string" ? body.clientTs : null;

  const state = await getPauseState(s.sessionId);
  if (body.action === "pause") {
    if (state.paused) return NextResponse.json({ paused: true, changed: false });
    await logEvent(s.sessionId, s.version, body.taskId, "task_pause", { clientTs });
    return NextResponse.json({ paused: true, changed: true });
  }

  if (!state.paused) return NextResponse.json({ paused: false, changed: false });
  await logEvent(s.sessionId, s.version, body.taskId, "task_resume", {
    clientTs,
    pausedMs: Date.now() - state.since.getTime(),
    pausedOnTaskId: state.taskId,
  });
  return NextResponse.json({ paused: false, changed: true });
});
