import { prisma } from "./db";
import { logEvent } from "./logEvent";
import type { CurrentSession } from "./session";

// Peer check-in v2, treatment prompt 3 (versions with features.peerChat): invited at the
// session-clock's peerCheckinMinutes (default 90:00, see @/lib/timing), including while
// paused. Pairing and availability reuse @/lib/peer (getPeerSessionId, isPeerAvailable) —
// one manual pairing serves both the legacy AI-request peer stage and this one. Messages
// are session-scoped (taskId: null), not task-scoped like the v1 room, since the invitation
// isn't tied to any particular task.

export const PEER_V2_END_OUTCOMES = ["returned", "declined", "left", "peer_unavailable"] as const;
export type PeerV2EndOutcome = (typeof PEER_V2_END_OUTCOMES)[number];

export type PeerVoiceMessage = {
  id: number;
  from: "me" | "peer";
  kind: "voice" | "text";
  /** data: URI (mimeType + base64) for a voice message. */
  audio?: string;
  durationMs?: number;
  text?: string;
  timestamp: string;
};

const MAX_AUDIO_BYTES = 6_000_000; // ~6MB decoded; short check-in clips only
const MAX_DURATION_MS = 90_000; // hard server-side cap even if the client's auto-stop is bypassed
const MAX_TEXT = 2000;

/** Whether the 90:00 invitation has ever been shown for this session. */
export async function getPeerCheckinV2Shown(sessionId: string): Promise<boolean> {
  return (
    (await prisma.event.count({ where: { sessionId, taskId: null, eventType: "peer_checkin_v2_shown" } })) > 0
  );
}

/** Whether the participant has already resolved (ended) the v2 invitation. */
export async function getPeerCheckinV2Ended(sessionId: string): Promise<boolean> {
  return (
    (await prisma.event.count({ where: { sessionId, taskId: null, eventType: "peer_checkin_v2_ended" } })) > 0
  );
}

/** Messages in the v2 room, oldest first — same event-log pattern as the v1 text room. */
export async function getPeerVoiceMessages(sessionId: string, peerSessionId: string): Promise<PeerVoiceMessage[]> {
  const events = await prisma.event.findMany({
    where: {
      sessionId: { in: [sessionId, peerSessionId] },
      taskId: null,
      eventType: "peer_voice_message",
    },
    orderBy: { timestamp: "asc" },
  });
  return events
    .map((e) => {
      const p = e.payload as {
        kind?: unknown;
        audioBase64?: unknown;
        mimeType?: unknown;
        durationMs?: unknown;
        text?: unknown;
        peerSessionId?: unknown;
      } | null;
      const kind = p?.kind === "text" ? ("text" as const) : ("voice" as const);
      return {
        id: e.id,
        from: (e.sessionId === sessionId ? "me" : "peer") as "me" | "peer",
        kind,
        audio:
          kind === "voice" && typeof p?.audioBase64 === "string" && typeof p?.mimeType === "string"
            ? `data:${p.mimeType};base64,${p.audioBase64}`
            : undefined,
        durationMs: typeof p?.durationMs === "number" ? p.durationMs : undefined,
        text: kind === "text" && typeof p?.text === "string" ? p.text : undefined,
        toPeerSessionId: typeof p?.peerSessionId === "string" ? p.peerSessionId : "",
        timestamp: e.timestamp.toISOString(),
      };
    })
    .filter(
      (m) =>
        (m.kind === "voice" ? !!m.audio : !!m.text) &&
        ((m.from === "me" && m.toPeerSessionId === peerSessionId) ||
          (m.from === "peer" && m.toPeerSessionId === sessionId)),
    )
    .map(({ id, from, kind, audio, durationMs, text, timestamp }) => ({
      id,
      from,
      kind,
      audio,
      durationMs,
      text,
      timestamp,
    }));
}

export class VoiceMessageError extends Error {}

export async function sendPeerVoiceMessage(
  s: CurrentSession,
  peerSessionId: string,
  audioBase64: string,
  mimeType: string,
  durationMs: number,
) {
  const decodedBytes = Math.floor((audioBase64.length * 3) / 4);
  if (decodedBytes > MAX_AUDIO_BYTES) throw new VoiceMessageError("Voice message is too long.");
  const clampedDuration = Math.min(Math.max(0, Math.round(durationMs) || 0), MAX_DURATION_MS);
  await logEvent(s.sessionId, s.version, null, "peer_voice_message", {
    kind: "voice",
    audioBase64,
    mimeType,
    durationMs: clampedDuration,
    peerSessionId,
  });
}

export async function sendPeerTextMessage(s: CurrentSession, peerSessionId: string, text: string) {
  const trimmed = text.trim().slice(0, MAX_TEXT);
  await logEvent(s.sessionId, s.version, null, "peer_voice_message", {
    kind: "text",
    text: trimmed,
    peerSessionId,
  });
}
