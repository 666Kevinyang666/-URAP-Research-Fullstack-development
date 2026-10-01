import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { ConflictError, createSnapshot, saveDraft } from "@/lib/drafts";

// Periodic snapshot while a task is open. Body: { taskId, content }
export const POST = withSession(async (s, body) => {
  if (typeof body.taskId !== "string") return error(400, "taskId is required");
  if (typeof body.content === "string") {
    try {
      await saveDraft(s, body.taskId, body.content, "interval_snapshot");
    } catch (e) {
      // A complete task is read-only; still snapshot its stored content.
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  const snap = await createSnapshot(s, body.taskId, "interval");
  return NextResponse.json({ id: snap.id, createdAt: snap.createdAt });
});
