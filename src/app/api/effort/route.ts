import { NextRequest, NextResponse } from "next/server";
import { getCurrentSession } from "@/lib/session";
import { getTask } from "@/lib/config";
import { getEffort } from "@/lib/effort";
import { error } from "@/lib/api";

// Effort metrics for one task: GET /api/effort?taskId=...
// Returns { activeMs, aiRequestCount, revisionCount }. Read-only; available in every version.
export async function GET(req: NextRequest) {
  const s = await getCurrentSession();
  if (!s) return error(401, "No active session. Open your study link again.");
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId || !getTask(taskId)) return error(400, "Unknown taskId");
  return NextResponse.json(await getEffort(s.sessionId, taskId));
}
