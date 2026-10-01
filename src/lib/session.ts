import { cookies } from "next/headers";
import { prisma } from "./db";
import { SID_COOKIE, isVersion, type Version } from "./constants";

export type CurrentSession = { sessionId: string; version: Version; endedAt: Date | null };

/** The session for the sid cookie set by /start, or null. */
export async function getCurrentSession(): Promise<CurrentSession | null> {
  const sid = (await cookies()).get(SID_COOKIE)?.value;
  if (!sid) return null;
  const s = await prisma.session.findUnique({ where: { sessionId: sid } });
  if (!s || !isVersion(s.version)) return null;
  return { sessionId: s.sessionId, version: s.version, endedAt: s.endedAt };
}
