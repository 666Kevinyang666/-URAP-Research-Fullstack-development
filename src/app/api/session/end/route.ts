import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { endWork, endWorkBlockedMessage, getIncompleteRequired } from "@/lib/drafts";
import { logEvent } from "@/lib/logEvent";

// "End work". Body: { taskId?, content? }
// Only once every required task (config/tasks.json) is complete: otherwise 409
// { error, incompleteRequired } and an end_work_blocked event. Enforced here, so the disabled
// button in the browser can't be bypassed by calling this route directly.
export const POST = withSession(
  async (s, body) => {
    const taskId = typeof body.taskId === "string" ? body.taskId : null;
    const content = typeof body.content === "string" ? body.content : undefined;
    if (!s.endedAt) {
      const incompleteRequired = await getIncompleteRequired(s.sessionId);
      if (incompleteRequired.length > 0) {
        await logEvent(s.sessionId, s.version, taskId, "end_work_blocked", { incompleteRequired });
        return NextResponse.json({ error: endWorkBlockedMessage(incompleteRequired), incompleteRequired }, { status: 409 });
      }
    }
    await endWork(s, taskId, content);
    return NextResponse.json({ ok: true });
  },
  { allowEnded: true },
);
