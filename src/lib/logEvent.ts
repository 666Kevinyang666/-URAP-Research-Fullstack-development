import { prisma } from "./db";
import { isVersion, type Version } from "./constants";

export type EventPayload = Record<string, unknown>;

/**
 * Append one row to the Event log. Rows are never updated or deleted.
 *
 * Usable from any server-side code (API routes, the AI proxy):
 *
 *   import { logEvent } from "@/lib/logEvent";
 *   await logEvent(sid, version, "task1", "ai_user_message", { text, model });
 *
 * - taskId: null for session-level events.
 * - payload: any JSON-serializable object.
 * - The timestamp is set by the server.
 *
 * Throws if the write fails, so the caller can decide whether to retry.
 */
export async function logEvent(
  sessionId: string,
  version: Version,
  taskId: string | null,
  eventType: string,
  payload: EventPayload = {},
) {
  if (!sessionId) throw new Error("logEvent: sessionId is required");
  if (!isVersion(version)) throw new Error(`logEvent: invalid version "${version}"`);
  if (!eventType) throw new Error("logEvent: eventType is required");

  return prisma.event.create({
    data: { sessionId, version, taskId, eventType, payload: payload as object },
  });
}
