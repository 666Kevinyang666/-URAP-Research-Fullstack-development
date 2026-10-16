import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logEvent } from "@/lib/logEvent";
import { SID_COOKIE, isVersion, type Version } from "@/lib/constants";
import { getJourneyStage, stagePath } from "@/lib/journey";

// Study entry point: /start?sid=...&version=none|standard|sustainable[&peer=<otherSid>]
// Creates or resumes the session, stores sid in a cookie, and sends the participant to their
// current step: consent, instructions, welcome, or the first task (see @/lib/journey).
export async function GET(req: NextRequest) {
  const sid = req.nextUrl.searchParams.get("sid")?.trim();
  const requestedVersion = req.nextUrl.searchParams.get("version");
  const userAgent = req.headers.get("user-agent");
  // Manual peer pairing for the peer check-in (sustainable version): the researcher hands
  // out two /start links with &peer= pointing at each other. See src/lib/peer.ts.
  const peer = req.nextUrl.searchParams.get("peer")?.trim();

  if (!sid || sid.length > 200) {
    return new NextResponse("Missing or invalid sid. Please use the link from the study.", { status: 400 });
  }

  const existing = await prisma.session.findUnique({ where: { sessionId: sid } });
  let version: Version;
  let session = existing;
  if (existing) {
    // Never change an existing session's assigned version.
    if (!isVersion(existing.version)) return new NextResponse("Invalid stored session.", { status: 500 });
    version = existing.version;
    await logEvent(sid, version, null, "session_resume", {
      requestedVersion,
      versionMismatch: requestedVersion !== null && requestedVersion !== version,
      userAgent,
    });
  } else {
    if (!isVersion(requestedVersion)) {
      return new NextResponse("Missing or invalid version. Please use the link from the study.", { status: 400 });
    }
    version = requestedVersion;
    session = await prisma.session.create({ data: { sessionId: sid, version } });
    await logEvent(sid, version, null, "session_start", { userAgent });
  }

  if (peer && peer !== sid) {
    await logEvent(sid, version, null, "peer_paired", { peerSessionId: peer });
  }

  const stage = await getJourneyStage({
    sessionId: sid,
    version,
    endedAt: session?.endedAt ?? null,
    workStartedAt: session?.workStartedAt ?? null,
  });
  const res = NextResponse.redirect(new URL(stagePath(stage), req.url));
  res.cookies.set(SID_COOKIE, sid, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 7,
  });
  return res;
}
