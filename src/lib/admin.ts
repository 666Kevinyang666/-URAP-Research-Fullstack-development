import { prisma } from "./db";
import { TASKS } from "./config";
import { isVersion, type Version } from "./constants";
import { getJourneyStage, type JourneyStage } from "./journey";
import { logEvent } from "./logEvent";
import { checkBasicAuth } from "./basicAuth";

// Researcher admin (/admin): session links, the sessions table and data export.
// Not part of the participant flow; protected by ADMIN_PASSWORD (src/proxy.ts, and again here).

/** Defense in depth for /admin route handlers, in case the proxy matcher ever changes. */
export function adminAuthorized(req: Request): boolean {
  return checkBasicAuth("admin", req.headers.get("authorization")) === "ok";
}

export type LinkSpec = { sid: string; version: Version; peer?: string };

/** Participant link path for a session (prefix with the public origin to share it). */
export function startPath({ sid, version, peer }: LinkSpec): string {
  const params = new URLSearchParams({ sid, version });
  if (peer) params.set("peer", peer);
  return `/start?${params.toString()}`;
}

export function newSid(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

export class LinkError extends Error {}

const SID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

/** Whether a sid is already used by a session or an earlier created link. */
async function sidTaken(sid: string): Promise<boolean> {
  const [session, link] = await Promise.all([
    prisma.session.findUnique({ where: { sessionId: sid } }),
    prisma.event.findFirst({ where: { sessionId: sid, eventType: "admin_link_created" } }),
  ]);
  return session !== null || link !== null;
}

/**
 * Records links (an admin_link_created event per sid), so they appear in the sessions table
 * before the participant opens them. Creating a link doesn't create the session; /start does.
 */
export async function createLinks(specs: LinkSpec[]): Promise<LinkSpec[]> {
  for (const spec of specs) {
    if (!SID_PATTERN.test(spec.sid)) throw new LinkError("A sid can use letters, numbers, - and _ (up to 64).");
    if (await sidTaken(spec.sid)) throw new LinkError(`The sid "${spec.sid}" is already in use.`);
  }
  for (const spec of specs) {
    await logEvent(spec.sid, spec.version, null, "admin_link_created", { path: startPath(spec), peer: spec.peer ?? null });
  }
  return specs;
}

/** One none link, one standard link, and a sustainable pair paired with each other. */
export function demoSetSpecs(): LinkSpec[] {
  const a = newSid("demo-sustainable-a");
  const b = newSid("demo-sustainable-b");
  return [
    { sid: newSid("demo-none"), version: "none" },
    { sid: newSid("demo-standard"), version: "standard" },
    { sid: a, version: "sustainable", peer: b },
    { sid: b, version: "sustainable", peer: a },
  ];
}

export type SessionRow = {
  sid: string;
  version: string;
  link: string;
  peer: string | null;
  linkCreatedAt: string | null;
  createdAt: string | null;
  workStartedAt: string | null;
  endedAt: string | null;
  stage: JourneyStage | "not_opened";
  tasks: { id: string; title: string; status: string }[];
};

/** Every session plus every created link that hasn't been opened yet, newest first. */
export async function listSessions(): Promise<SessionRow[]> {
  const [sessions, linkEvents, peerEvents, drafts] = await Promise.all([
    prisma.session.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.event.findMany({ where: { eventType: "admin_link_created" }, orderBy: { id: "asc" } }),
    prisma.event.findMany({ where: { eventType: "peer_paired" }, orderBy: { id: "asc" } }),
    prisma.draft.findMany({ select: { sessionId: true, taskId: true, status: true } }),
  ]);
  const linkBySid = new Map(linkEvents.map((e) => [e.sessionId, e]));
  const peerBySid = new Map<string, string>();
  for (const e of peerEvents) {
    const peer = (e.payload as { peerSessionId?: unknown } | null)?.peerSessionId;
    if (typeof peer === "string") peerBySid.set(e.sessionId, peer);
  }
  const linkPeer = (sid: string) => {
    const p = (linkBySid.get(sid)?.payload as { peer?: unknown } | null)?.peer;
    return typeof p === "string" ? p : null;
  };
  const tasksFor = (sid: string) =>
    TASKS.map((t) => ({
      id: t.id,
      title: t.title,
      status: drafts.find((d) => d.sessionId === sid && d.taskId === t.id)?.status ?? "not_started",
    }));

  const rows: SessionRow[] = [];
  for (const s of sessions) {
    const version = isVersion(s.version) ? s.version : null;
    const peer = peerBySid.get(s.sessionId) ?? linkPeer(s.sessionId);
    rows.push({
      sid: s.sessionId,
      version: s.version,
      link: startPath({ sid: s.sessionId, version: version ?? "none", peer: peer ?? undefined }),
      peer,
      linkCreatedAt: linkBySid.get(s.sessionId)?.timestamp.toISOString() ?? null,
      createdAt: s.createdAt.toISOString(),
      workStartedAt: s.workStartedAt?.toISOString() ?? null,
      endedAt: s.endedAt?.toISOString() ?? null,
      stage: version
        ? await getJourneyStage({ sessionId: s.sessionId, version, endedAt: s.endedAt, workStartedAt: s.workStartedAt })
        : "not_opened",
      tasks: tasksFor(s.sessionId),
    });
  }
  const opened = new Set(sessions.map((s) => s.sessionId));
  for (const e of [...linkEvents].reverse()) {
    if (opened.has(e.sessionId) || !isVersion(e.version)) continue;
    rows.push({
      sid: e.sessionId,
      version: e.version,
      link: startPath({ sid: e.sessionId, version: e.version, peer: linkPeer(e.sessionId) ?? undefined }),
      peer: linkPeer(e.sessionId),
      linkCreatedAt: e.timestamp.toISOString(),
      createdAt: null,
      workStartedAt: null,
      endedAt: null,
      stage: "not_opened",
      tasks: tasksFor(e.sessionId),
    });
  }
  return rows;
}

// ---- Export ----

export const EXPORT_TABLES = ["sessions", "drafts", "snapshots", "events", "task_plans", "active_time"] as const;
export type ExportTable = (typeof EXPORT_TABLES)[number];

export function isExportTable(v: unknown): v is ExportTable {
  return typeof v === "string" && (EXPORT_TABLES as readonly string[]).includes(v);
}

type Row = Record<string, string | number | null>;
const iso = (d: Date | null) => d?.toISOString() ?? null;

/** Rows for one table, every row keyed by `sid` (the Qualtrics embedded data field). */
export async function exportRows(table: ExportTable, sid?: string): Promise<Row[]> {
  const where = sid ? { sessionId: sid } : {};
  switch (table) {
    case "sessions": {
      const rows = await listSessions();
      return rows
        .filter((r) => !sid || r.sid === sid)
        .map((r) => ({
          sid: r.sid,
          version: r.version,
          peer_sid: r.peer,
          link_created_at: r.linkCreatedAt,
          created_at: r.createdAt,
          work_started_at: r.workStartedAt,
          ended_at: r.endedAt,
          stage: r.stage,
          ...Object.fromEntries(r.tasks.map((t) => [`task_${t.id}`, t.status])),
        }));
    }
    case "drafts":
      return (await prisma.draft.findMany({ where, orderBy: [{ sessionId: "asc" }, { taskId: "asc" }] })).map((d) => ({
        sid: d.sessionId,
        task_id: d.taskId,
        status: d.status,
        revision_count: d.revisionCount,
        updated_at: iso(d.updatedAt),
        content: d.content,
      }));
    case "snapshots":
      return (await prisma.snapshot.findMany({ where, orderBy: { id: "asc" } })).map((s) => ({
        sid: s.sessionId,
        task_id: s.taskId,
        reason: s.reason,
        created_at: iso(s.createdAt),
        content: s.content,
      }));
    case "events":
      return (await prisma.event.findMany({ where, orderBy: { id: "asc" } })).map((e) => ({
        sid: e.sessionId,
        event_id: e.id,
        timestamp: iso(e.timestamp),
        version: e.version,
        task_id: e.taskId,
        event_type: e.eventType,
        payload: JSON.stringify(e.payload),
      }));
    case "task_plans":
      return (await prisma.taskPlan.findMany({ where, orderBy: { id: "asc" } })).map((p) => ({
        sid: p.sessionId,
        task_id: p.taskId,
        purpose: p.purpose,
        good_enough: p.goodEnough,
        time_budget_minutes: p.timeBudgetMinutes,
        created_at: iso(p.createdAt),
        updated_at: iso(p.updatedAt),
      }));
    case "active_time":
      return (await prisma.taskActiveTime.findMany({ where, orderBy: { id: "asc" } })).map((a) => ({
        sid: a.sessionId,
        task_id: a.taskId,
        active_ms: a.activeMs,
        updated_at: iso(a.updatedAt),
      }));
  }
}

/** All tables grouped by sid: { exportedAt, sessions: { [sid]: { session, drafts, ... } } }. */
export async function exportJson(sid?: string) {
  const tables = Object.fromEntries(
    await Promise.all(EXPORT_TABLES.map(async (t) => [t, await exportRows(t, sid)] as const)),
  ) as Record<ExportTable, Row[]>;
  const sids = tables.sessions.map((s) => String(s.sid));
  // Events can exist for a sid without a session row (e.g. a link that was never opened).
  for (const e of tables.events) if (!sids.includes(String(e.sid))) sids.push(String(e.sid));

  const bySid: Record<string, Record<string, unknown>> = {};
  for (const s of sids) {
    const pick = (t: ExportTable) =>
      tables[t].filter((r) => r.sid === s).map(({ sid: _sid, ...rest }) => rest); // eslint-disable-line @typescript-eslint/no-unused-vars
    bySid[s] = {
      session: tables.sessions.find((r) => r.sid === s) ?? null,
      drafts: pick("drafts"),
      snapshots: pick("snapshots"),
      events: tables.events
        .filter((r) => r.sid === s)
        .map(({ sid: _sid, payload, ...rest }) => ({ ...rest, payload: JSON.parse(String(payload)) })), // eslint-disable-line @typescript-eslint/no-unused-vars
      task_plans: pick("task_plans"),
      active_time: pick("active_time"),
    };
  }
  return { exportedAt: new Date().toISOString(), sessionCount: sids.length, sessions: bySid };
}

function csvCell(v: string | number | null): string {
  if (v === null || v === undefined) return "";
  const s = String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(rows: Row[]): string {
  if (rows.length === 0) return "sid\r\n";
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const lines = [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c] ?? null)).join(","))];
  return lines.join("\r\n") + "\r\n";
}
