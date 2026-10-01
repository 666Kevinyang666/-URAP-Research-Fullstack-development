import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { setTaskStatus } from "@/lib/drafts";

// Body: { taskId, content }
export const POST = withSession(async (s, body) => {
  if (typeof body.taskId !== "string") return error(400, "taskId is required");
  const content = typeof body.content === "string" ? body.content : undefined;
  const draft = await setTaskStatus(s, body.taskId, "complete", content);
  return NextResponse.json({ status: draft.status, revisionCount: draft.revisionCount });
});
