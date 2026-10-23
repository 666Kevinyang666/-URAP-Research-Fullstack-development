import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { getFeatures } from "@/lib/features";
import { logEvent } from "@/lib/logEvent";
import { CHECKPOINT_TRIGGER } from "@/lib/config";
import { BUDGET_CHECKPOINT_ACTIONS, getBudgetCheckpointState } from "@/lib/budgetCheckpoint";

const MAX_NOTE = 2000;

// Time-budget checkpoint (see @/lib/budgetCheckpoint).
// POST { taskId, shown: true, budgetMinutes, activeMs } -> logs checkpoint_shown (once per task)
// POST { taskId, action: "finish" | "continue" | "pause" | "flag", note? } -> logs checkpoint_resolved
// "finish" and "pause" are applied by the caller via /api/task/complete and /api/pause.
export const POST = withSession(async (s, body) => {
  if (!getFeatures(s.version).checkpoints || CHECKPOINT_TRIGGER !== "time_budget") {
    return error(403, "The time-budget checkpoint is not part of this version.");
  }
  if (typeof body.taskId !== "string") return error(400, "taskId is required");

  if (body.shown === true) {
    const { shown } = await getBudgetCheckpointState(s.sessionId, body.taskId);
    if (shown) return NextResponse.json({ ok: true, alreadyShown: true });
    await logEvent(s.sessionId, s.version, body.taskId, "checkpoint_shown", {
      trigger: "time_budget",
      budgetMinutes: Number(body.budgetMinutes) || null,
      activeMs: Number(body.activeMs) || null,
    });
    return NextResponse.json({ ok: true, alreadyShown: false });
  }

  if (typeof body.action !== "string" || !(BUDGET_CHECKPOINT_ACTIONS as readonly string[]).includes(body.action)) {
    return error(400, "action must be finish, continue, pause, or flag");
  }
  const note = typeof body.note === "string" && body.note.trim() ? body.note.trim().slice(0, MAX_NOTE) : undefined;
  await logEvent(s.sessionId, s.version, body.taskId, "checkpoint_resolved", {
    trigger: "time_budget",
    action: body.action,
    note,
  });
  return NextResponse.json({ ok: true });
});
