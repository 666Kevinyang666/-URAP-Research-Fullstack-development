import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { getCurrentSession } from "@/lib/session";
import { getFeatures } from "@/lib/features";
import { logEvent } from "@/lib/logEvent";
import { getPeerSessionId, isPeerAvailable } from "@/lib/peer";
import {
  PEER_V2_END_OUTCOMES,
  VoiceMessageError,
  getPeerCheckinV2Shown,
  getPeerVoiceMessages,
  sendPeerTextMessage,
  sendPeerVoiceMessage,
} from "@/lib/peerVoice";

// Peer check-in v2 (treatment prompt 3, sustainable version). Session-scoped — not tied to
// any particular task — unlike the v1 room in @/lib/peer.
// GET -> { peerSessionId, available, messages }
export async function GET() {
  const s = await getCurrentSession();
  if (!s) return error(401, "No active session. Open your study link again.");
  if (!getFeatures(s.version).peerChat) return error(403, "Peer check-in is not part of this version.");

  const peerSessionId = await getPeerSessionId(s.sessionId);
  if (!peerSessionId) return NextResponse.json({ peerSessionId: null, available: false, messages: [] });
  const available = await isPeerAvailable(peerSessionId);
  const messages = available ? await getPeerVoiceMessages(s.sessionId, peerSessionId) : [];
  return NextResponse.json({ peerSessionId, available, messages });
}

// POST { shown: true } -> logs peer_checkin_v2_shown (once) -> { ok, alreadyShown }
// POST { audioBase64, mimeType, durationMs } -> send a voice message
// POST { text } -> send a text message (fallback when the mic is unavailable/denied)
// POST { end: "returned" | "declined" | "left" | "peer_unavailable" } -> logs peer_checkin_v2_ended
export const POST = withSession(async (s, body) => {
  if (!getFeatures(s.version).peerChat) return error(403, "Peer check-in is not part of this version.");

  if (body.shown === true) {
    if (await getPeerCheckinV2Shown(s.sessionId)) return NextResponse.json({ ok: true, alreadyShown: true });
    await logEvent(s.sessionId, s.version, null, "peer_checkin_v2_shown", {});
    return NextResponse.json({ ok: true, alreadyShown: false });
  }

  if (typeof body.end === "string") {
    if (!(PEER_V2_END_OUTCOMES as readonly string[]).includes(body.end)) return error(400, "Unknown end outcome");
    await logEvent(s.sessionId, s.version, null, "peer_checkin_v2_ended", { outcome: body.end });
    return NextResponse.json({ ok: true });
  }

  const peerSessionId = await getPeerSessionId(s.sessionId);
  if (!peerSessionId) return error(409, "No peer is paired with this session.");
  if (!(await isPeerAvailable(peerSessionId))) {
    await logEvent(s.sessionId, s.version, null, "peer_checkin_v2_ended", { outcome: "peer_unavailable" });
    return error(409, "Your peer is not available right now.");
  }

  if (typeof body.audioBase64 === "string" && typeof body.mimeType === "string") {
    try {
      await sendPeerVoiceMessage(s, peerSessionId, body.audioBase64, body.mimeType, Number(body.durationMs) || 0);
    } catch (e) {
      if (e instanceof VoiceMessageError) return error(400, e.message);
      throw e;
    }
    return NextResponse.json({ ok: true });
  }

  if (typeof body.text === "string" && body.text.trim()) {
    await sendPeerTextMessage(s, peerSessionId, body.text);
    return NextResponse.json({ ok: true });
  }

  return error(400, "audioBase64+mimeType or text is required");
});
