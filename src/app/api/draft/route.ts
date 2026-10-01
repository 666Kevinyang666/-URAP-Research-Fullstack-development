import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { saveDraft } from "@/lib/drafts";

// Autosave. Body: { taskId, content, trigger }
export const POST = withSession(async (s, body) => {
  if (typeof body.taskId !== "string" || typeof body.content !== "string") {
    return error(400, "taskId and content are required");
  }
  const trigger = typeof body.trigger === "string" ? body.trigger : "unknown";
  const { draft, changed } = await saveDraft(s, body.taskId, body.content, trigger);
  return NextResponse.json({
    changed,
    status: draft.status,
    revisionCount: draft.revisionCount,
    updatedAt: draft.updatedAt,
  });
});
