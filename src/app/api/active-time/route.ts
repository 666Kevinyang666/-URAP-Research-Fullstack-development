import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { logEvent } from "@/lib/logEvent";
import { MAX_ACTIVE_DELTA_MS, addActiveTime } from "@/lib/effort";

// Active-time heartbeat from the browser. Body: { taskId, deltaMs, reason }
// deltaMs is time since the last heartbeat with the task open, tab visible and not paused.
export const POST = withSession(async (s, body) => {
  if (typeof body.taskId !== "string") return error(400, "taskId is required");
  const deltaMs = body.deltaMs;
  if (typeof deltaMs !== "number" || !Number.isFinite(deltaMs) || deltaMs <= 0) {
    return error(400, "deltaMs must be a positive number");
  }

  let accepted = Math.round(deltaMs);
  if (accepted > MAX_ACTIVE_DELTA_MS) {
    accepted = MAX_ACTIVE_DELTA_MS;
    await logEvent(s.sessionId, s.version, body.taskId, "active_time_clamped", {
      reportedMs: deltaMs,
      acceptedMs: accepted,
      reason: body.reason ?? null,
    });
  }
  const row = await addActiveTime(s.sessionId, body.taskId, accepted);
  return NextResponse.json({ activeMs: row.activeMs });
});
