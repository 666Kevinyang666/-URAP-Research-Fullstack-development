import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { logEvent } from "@/lib/logEvent";
import { CLIENT_EVENT_TYPES } from "@/lib/constants";

// Browser interaction events. Body: { taskId?, eventType, payload? }
export const POST = withSession(
  async (s, body) => {
    const eventType = body.eventType;
    if (typeof eventType !== "string" || !(CLIENT_EVENT_TYPES as readonly string[]).includes(eventType)) {
      return error(400, "Unknown eventType");
    }
    const taskId = typeof body.taskId === "string" ? body.taskId : null;
    const payload =
      body.payload && typeof body.payload === "object" ? (body.payload as Record<string, unknown>) : {};
    await logEvent(s.sessionId, s.version, taskId, eventType, payload);
    return NextResponse.json({ ok: true });
  },
  { allowEnded: true },
);
