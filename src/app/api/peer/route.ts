import { NextRequest, NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { getCurrentSession } from "@/lib/session";
import { getTask } from "@/lib/config";
import { getFeatures } from "@/lib/features";
import { logEvent } from "@/lib/logEvent";
import { getPeerSessionId, isPeerAvailable, getPeerConversation, sendPeerMessage } from "@/lib/peer";

const MAX_TEXT = 2000;
const END_OUTCOMES = ["returned", "declined", "left", "peer_unavailable"] as const;

// Peer check-in room (sustainable version only; pairing is manual, via /start?...&peer=<sid>).
// GET ?taskId=... -> { peerSessionId, available, messages } (poll while the room is open)
export async function GET(req: NextRequest) {
  const s = await getCurrentSession();
  if (!s) return error(401, "No active session. Open your study link again.");
  if (!getFeatures(s.version).peerChat) return error(403, "Peer check-in is not part of this version.");
  const taskId = req.nextUrl.searchParams.get("taskId");
  if (!taskId || !getTask(taskId)) return error(400, "Unknown taskId");

  const peerSessionId = await getPeerSessionId(s.sessionId);
  if (!peerSessionId) return NextResponse.json({ peerSessionId: null, available: false, messages: [] });
  const available = await isPeerAvailable(peerSessionId);
  const messages = available ? await getPeerConversation(s.sessionId, peerSessionId) : [];
  return NextResponse.json({ peerSessionId, available, messages });
}

// POST { taskId, text } -> send a message
// POST { taskId, index, end: "returned" | "declined" | "left" } -> close the check-in stage
// (logs peer_checkin_ended; the checkpoint then shows its stopping choices)
export const POST = withSession(async (s, body) => {
  if (!getFeatures(s.version).peerChat) return error(403, "Peer check-in is not part of this version.");
  if (typeof body.taskId !== "string") return error(400, "taskId is required");

  if (typeof body.end === "string") {
    if (!(END_OUTCOMES as readonly string[]).includes(body.end)) return error(400, "Unknown end outcome");
    const index = Number(body.index);
    await logEvent(s.sessionId, s.version, body.taskId, "peer_checkin_ended", { index, outcome: body.end });
    return NextResponse.json({ ok: true });
  }

  if (typeof body.text !== "string" || !body.text.trim()) return error(400, "text is required");
  const peerSessionId = await getPeerSessionId(s.sessionId);
  if (!peerSessionId) return error(409, "No peer is paired with this session.");
  if (!(await isPeerAvailable(peerSessionId))) {
    const index = Number(body.index);
    await logEvent(s.sessionId, s.version, body.taskId, "peer_checkin_ended", { index, outcome: "peer_unavailable" });
    return error(409, "Your peer is not available right now.");
  }
  await sendPeerMessage(s, peerSessionId, body.taskId, body.text.trim().slice(0, MAX_TEXT));
  return NextResponse.json({ ok: true });
});
