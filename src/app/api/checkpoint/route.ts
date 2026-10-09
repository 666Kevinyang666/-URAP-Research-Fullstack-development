import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { getFeatures } from "@/lib/features";
import { logEvent } from "@/lib/logEvent";
import { CHECKPOINT_ACTIONS, CHECKPOINT_THRESHOLDS } from "@/lib/checkpoints";

const MAX_NOTE = 2000;

// Record a completion-checkpoint decision (sustainable version only).
// Body: { taskId, index, action: "finish" | "continue" | "pause" | "flag", note? }
// "finish"/"pause" are also applied by the caller via the usual /api/task/complete or
// /api/pause calls; this route only logs the checkpoint decision itself.
export const POST = withSession(async (s, body) => {
  if (!getFeatures(s.version).checkpoints) return error(403, "Checkpoints are not part of this version.");
  if (typeof body.taskId !== "string") return error(400, "taskId is required");

  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= CHECKPOINT_THRESHOLDS.length) {
    return error(400, "Unknown checkpoint index");
  }
  if (typeof body.action !== "string" || !(CHECKPOINT_ACTIONS as readonly string[]).includes(body.action)) {
    return error(400, "action must be finish, continue, pause, or flag");
  }
  const note = typeof body.note === "string" ? body.note.trim().slice(0, MAX_NOTE) : undefined;
  if (body.action === "continue" && !note) return error(400, "A reason is required to continue.");

  await logEvent(s.sessionId, s.version, body.taskId, "checkpoint_resolved", { index, action: body.action, note });
  return NextResponse.json({ ok: true });
});
