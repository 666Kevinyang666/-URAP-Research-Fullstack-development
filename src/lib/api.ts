import { NextResponse } from "next/server";
import { getCurrentSession, type CurrentSession } from "./session";
import { getTask } from "./config";
import { ConflictError } from "./drafts";

type Body = Record<string, unknown>;
type Handler = (s: CurrentSession, body: Body) => Promise<Response>;

/**
 * Wrap a POST handler: require a session (sid cookie), parse the JSON body
 * (also accepts text/plain from navigator.sendBeacon), and validate taskId/content.
 */
export function withSession(handler: Handler, opts: { allowEnded?: boolean } = {}) {
  return async (req: Request) => {
    const s = await getCurrentSession();
    if (!s) return error(401, "No active session. Open your study link again.");
    if (s.endedAt && !opts.allowEnded) return error(409, "This session has ended.");

    let body: Body;
    try {
      body = JSON.parse((await req.text()) || "{}");
    } catch {
      return error(400, "Invalid JSON body");
    }
    if (body.taskId != null && (typeof body.taskId !== "string" || !getTask(body.taskId))) {
      return error(400, "Unknown taskId");
    }
    if (body.content !== undefined && typeof body.content !== "string") {
      return error(400, "content must be a string");
    }

    try {
      return await handler(s, body);
    } catch (e) {
      if (e instanceof ConflictError) return error(409, e.message);
      console.error(e);
      return error(500, "Server error");
    }
  };
}

export function error(status: number, message: string) {
  return NextResponse.json({ error: message }, { status });
}
