import { prisma } from "./db";
import { logEvent } from "./logEvent";
import type { CurrentSession } from "./session";

export type PeerMessage = { id: number; from: "me" | "peer"; text: string; timestamp: string };

/**
 * The session this participant was manually paired with, or null if none.
 * Set via GET /start?...&peer=<otherSid> (see src/app/start/route.ts); read back here as
 * the most recent peer_paired event, so re-visiting /start with a different peer re-pairs.
 */
export async function getPeerSessionId(sessionId: string): Promise<string | null> {
  const last = await prisma.event.findFirst({
    where: { sessionId, eventType: "peer_paired" },
    orderBy: { id: "desc" },
  });
  const peerSessionId = (last?.payload as { peerSessionId?: unknown } | null)?.peerSessionId;
  return typeof peerSessionId === "string" && peerSessionId ? peerSessionId : null;
}

/** Whether the paired peer has actually opened their own session link yet. */
export async function isPeerAvailable(peerSessionId: string): Promise<boolean> {
  return (await prisma.session.findUnique({ where: { sessionId: peerSessionId } })) !== null;
}

/** Indices (into CHECKPOINT_THRESHOLDS) whose peer check-in stage has already ended. */
export async function getPeerCheckinDoneIndices(sessionId: string, taskId: string): Promise<number[]> {
  const rows = await prisma.event.findMany({
    where: { sessionId, taskId, eventType: "peer_checkin_ended" },
    select: { payload: true },
  });
  return rows
    .map((r) => (r.payload as { index?: unknown }).index)
    .filter((i): i is number => typeof i === "number");
}

/**
 * Messages between this session and its peer, oldest first. Reuses the Event log (like the
 * AI conversation) instead of a new table: each message is logged on the sender's own
 * sessionId, tagged with the other party's id, so the room is just both parties' rows.
 */
export async function getPeerConversation(sessionId: string, peerSessionId: string): Promise<PeerMessage[]> {
  const events = await prisma.event.findMany({
    where: { sessionId: { in: [sessionId, peerSessionId] }, eventType: "peer_message" },
    orderBy: { timestamp: "asc" },
  });
  return events
    .map((e) => {
      const payload = e.payload as { text?: unknown; peerSessionId?: unknown } | null;
      return {
        id: e.id,
        from: e.sessionId === sessionId ? ("me" as const) : ("peer" as const),
        text: typeof payload?.text === "string" ? payload.text : "",
        toPeerSessionId: typeof payload?.peerSessionId === "string" ? payload.peerSessionId : "",
        timestamp: e.timestamp.toISOString(),
      };
    })
    // Only messages actually addressed to the other party in this pair (defensive, in case
    // either session was ever re-paired with someone else).
    .filter(
      (m) =>
        m.text &&
        ((m.from === "me" && m.toPeerSessionId === peerSessionId) ||
          (m.from === "peer" && m.toPeerSessionId === sessionId)),
    )
    .map(({ id, from, text, timestamp }) => ({ id, from, text, timestamp }));
}

export async function sendPeerMessage(s: CurrentSession, peerSessionId: string, taskId: string, text: string) {
  await logEvent(s.sessionId, s.version, taskId, "peer_message", { text, peerSessionId });
}
