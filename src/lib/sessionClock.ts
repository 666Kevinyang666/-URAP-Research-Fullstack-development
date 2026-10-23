import { prisma } from "./db";
import { elapsedSince } from "./timing";

export type SessionClock = { workStartedAt: Date; elapsedMs: number };

/**
 * Server-side session clock: ms since Start work (Session.workStartedAt), including paused
 * time. Null until the participant clicks Start work. Compare against the scaled timings in
 * @/lib/timing (BREAK_PROMPT_TIMES_MS, PEER_CHECKIN_MS), e.g.
 *
 *   const clock = await getSessionClock(sessionId);
 *   if (clock && clock.elapsedMs >= PEER_CHECKIN_MS) { ... }
 */
export async function getSessionClock(sessionId: string, now: Date = new Date()): Promise<SessionClock | null> {
  const s = await prisma.session.findUnique({ where: { sessionId }, select: { workStartedAt: true } });
  if (!s?.workStartedAt) return null;
  return { workStartedAt: s.workStartedAt, elapsedMs: elapsedSince(s.workStartedAt, now) };
}
