import { prisma } from "./db";

/** Largest active-time increment accepted in one heartbeat. Larger deltas are clamped and logged. */
export const MAX_ACTIVE_DELTA_MS = 10 * 60 * 1000;

export type Effort = { activeMs: number; aiRequestCount: number; revisionCount: number };

/**
 * Number of AI requests for a task: the count of ai_assistant_message events, i.e. requests
 * that got a reply. A failed call (logged as ai_error) doesn't produce a reply or any change
 * to the participant's work, so — like an unchanged autosave not incrementing revisionCount —
 * it shouldn't count toward effort display or push the participant toward a checkpoint.
 * Server-side code (e.g. completion checkpoints) can call this directly.
 */
export function countAiRequests(sessionId: string, taskId: string): Promise<number> {
  return prisma.event.count({ where: { sessionId, taskId, eventType: "ai_assistant_message" } });
}

/** Effort metrics for one task. Logged in every version; displayed only where features.effortDisplay. */
export async function getEffort(sessionId: string, taskId: string): Promise<Effort> {
  const [time, aiRequestCount, draft] = await Promise.all([
    prisma.taskActiveTime.findUnique({ where: { sessionId_taskId: { sessionId, taskId } } }),
    countAiRequests(sessionId, taskId),
    prisma.draft.findUnique({ where: { sessionId_taskId: { sessionId, taskId } } }),
  ]);
  return { activeMs: time?.activeMs ?? 0, aiRequestCount, revisionCount: draft?.revisionCount ?? 0 };
}

/** Add active time to a task. */
export function addActiveTime(sessionId: string, taskId: string, deltaMs: number) {
  return prisma.taskActiveTime.upsert({
    where: { sessionId_taskId: { sessionId, taskId } },
    create: { sessionId, taskId, activeMs: deltaMs },
    update: { activeMs: { increment: deltaMs } },
  });
}
