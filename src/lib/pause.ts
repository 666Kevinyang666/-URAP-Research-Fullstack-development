import { prisma } from "./db";

export type PauseState =
  | { paused: false }
  | { paused: true; since: Date; taskId: string | null; reason: "manual" | "break"; breakIndex: number | null };

/**
 * Whether the session is paused: true if its most recent task_pause / task_resume
 * event is a pause. Pause is session-wide, so it carries across task switches and refreshes.
 * reason is "break" for a break taken from a break prompt (breakIndex says which one).
 */
export async function getPauseState(sessionId: string): Promise<PauseState> {
  const last = await prisma.event.findFirst({
    where: { sessionId, eventType: { in: ["task_pause", "task_resume"] } },
    orderBy: { id: "desc" },
  });
  if (last?.eventType !== "task_pause") return { paused: false };
  const payload = (last.payload ?? {}) as { reason?: unknown; breakIndex?: unknown };
  return {
    paused: true,
    since: last.timestamp,
    taskId: last.taskId,
    reason: payload.reason === "break" ? "break" : "manual",
    breakIndex: typeof payload.breakIndex === "number" ? payload.breakIndex : null,
  };
}
