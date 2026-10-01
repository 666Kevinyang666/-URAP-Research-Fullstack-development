import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { setTaskStatus } from "@/lib/drafts";

// Body: { taskId }
export const POST = withSession(async (s, body) => {
  if (typeof body.taskId !== "string") return error(400, "taskId is required");
  const draft = await setTaskStatus(s, body.taskId, "reopen", undefined);
  return NextResponse.json({ status: draft.status, revisionCount: draft.revisionCount });
});
