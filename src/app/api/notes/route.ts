import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { getFeatures } from "@/lib/features";
import { createNoteSnapshot, saveNote } from "@/lib/notes";
import { ConflictError } from "@/lib/errors";

// Drafting notes autosave (versions with features.notesPad). Body: { taskId, content, trigger, snapshot? }
// snapshot: true also stores an interval snapshot (Snapshot.kind = "notes").
export const POST = withSession(async (s, body) => {
  if (!getFeatures(s.version).notesPad) return error(403, "This feature is not available.");
  if (typeof body.taskId !== "string" || typeof body.content !== "string") {
    return error(400, "taskId and content are required");
  }
  const trigger = typeof body.trigger === "string" ? body.trigger : "unknown";
  let result: Awaited<ReturnType<typeof saveNote>> | null = null;
  try {
    result = await saveNote(s, body.taskId, body.content, trigger);
  } catch (e) {
    // A complete task's notes are read-only; an interval snapshot still copies the stored notes.
    if (!(e instanceof ConflictError) || body.snapshot !== true) throw e;
  }
  if (body.snapshot === true) await createNoteSnapshot(s, body.taskId, "interval");
  return NextResponse.json({ changed: result?.changed ?? false, revisionCount: result?.note.revisionCount ?? null });
});
