import { NextResponse } from "next/server";
import { withSession } from "@/lib/api";
import { endWork } from "@/lib/drafts";

// "End work". Body: { taskId?, content? }
export const POST = withSession(
  async (s, body) => {
    const taskId = typeof body.taskId === "string" ? body.taskId : null;
    const content = typeof body.content === "string" ? body.content : undefined;
    await endWork(s, taskId, content);
    return NextResponse.json({ ok: true });
  },
  { allowEnded: true },
);
