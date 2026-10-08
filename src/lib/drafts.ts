import { prisma } from "./db";
import { logEvent } from "./logEvent";
import type { CurrentSession } from "./session";
import type { SnapshotReason } from "./constants";
import { REQUIRED_TASK_IDS } from "./config";

export class ConflictError extends Error {}

/** Load the draft for a task, creating an empty one on first visit. */
export function ensureDraft(sessionId: string, taskId: string) {
  return prisma.draft.upsert({
    where: { sessionId_taskId: { sessionId, taskId } },
    create: { sessionId, taskId },
    update: {},
  });
}

/**
 * Save draft content. revisionCount is incremented, and a draft_save
 * event is written, only when the content differs from the stored content.
 */
export async function saveDraft(
  s: CurrentSession,
  taskId: string,
  content: string,
  trigger: string,
) {
  const { draft, changed } = await prisma.$transaction(async (tx) => {
    const existing = await tx.draft.findUnique({
      where: { sessionId_taskId: { sessionId: s.sessionId, taskId } },
    });
    const before = existing?.content ?? "";
    if (existing && content === before) return { draft: existing, changed: false };
    if (existing?.status === "complete") {
      throw new ConflictError("Task is complete; reopen it before editing.");
    }
    const draft = await tx.draft.upsert({
      where: { sessionId_taskId: { sessionId: s.sessionId, taskId } },
      create: {
        sessionId: s.sessionId,
        taskId,
        content,
        status: content ? "in_progress" : "not_started",
        revisionCount: content ? 1 : 0,
      },
      update: {
        content,
        status: "in_progress",
        revisionCount: { increment: 1 },
      },
    });
    return { draft, changed: content !== before };
  });

  if (changed) {
    await logEvent(s.sessionId, s.version, taskId, "draft_save", {
      trigger,
      revisionCount: draft.revisionCount,
      length: content.length,
    });
  }
  return { draft, changed };
}

/** Store the current saved content of a draft as a snapshot. */
export async function createSnapshot(s: CurrentSession, taskId: string, reason: SnapshotReason) {
  const draft = await ensureDraft(s.sessionId, taskId);
  return prisma.snapshot.create({
    data: { sessionId: s.sessionId, taskId, content: draft.content, reason },
  });
}

/** Mark a task complete or reopen it: save, update status, snapshot, log. */
export async function setTaskStatus(
  s: CurrentSession,
  taskId: string,
  action: "complete" | "reopen",
  content: string | undefined,
) {
  if (action === "complete" && content !== undefined) {
    await saveDraft(s, taskId, content, "complete");
  }
  const current = await ensureDraft(s.sessionId, taskId);
  const status = action === "complete" ? "complete" : "in_progress";
  const previousStatus = current.status;
  const draft =
    previousStatus === status
      ? current
      : await prisma.draft.update({
          where: { sessionId_taskId: { sessionId: s.sessionId, taskId } },
          data: { status },
        });

  await createSnapshot(s, taskId, action);
  await logEvent(s.sessionId, s.version, taskId, action === "complete" ? "task_complete" : "task_reopen", {
    previousStatus,
    revisionCount: draft.revisionCount,
    length: draft.content.length,
  });
  return draft;
}

/** End the work session: save the open task, snapshot every draft, set endedAt. */
export async function endWork(s: CurrentSession, taskId: string | null, content: string | undefined) {
  if (taskId && content !== undefined) {
    try {
      await saveDraft(s, taskId, content, "end_work");
    } catch (e) {
      if (!(e instanceof ConflictError)) throw e;
    }
  }
  const drafts = await prisma.draft.findMany({ where: { sessionId: s.sessionId } });
  for (const d of drafts) await createSnapshot(s, d.taskId, "end_work");

  const alreadyEnded = s.endedAt !== null;
  if (!alreadyEnded) {
    await prisma.session.update({ where: { sessionId: s.sessionId }, data: { endedAt: new Date() } });
  }
  const completeIds = new Set(drafts.filter((d) => d.status === "complete").map((d) => d.taskId));
  await logEvent(s.sessionId, s.version, taskId, "session_end", {
    alreadyEnded,
    incompleteRequired: REQUIRED_TASK_IDS.filter((id) => !completeIds.has(id)),
    drafts: drafts.map((d) => ({ taskId: d.taskId, status: d.status, revisionCount: d.revisionCount })),
  });
}
