import { prisma } from "./db";
import { logEvent } from "./logEvent";
import type { CurrentSession } from "./session";
import type { SnapshotReason } from "./constants";
import { REQUIRED_TASK_IDS, TASKS } from "./config";
import { getEffort } from "./effort";
import { getFeatures } from "./features";
import { AnswerTooShortError, ConflictError } from "./errors";
import {
  ANSWER_TOO_SHORT_MESSAGE,
  MIN_ANSWER_CHARS,
  answerChars,
  isAnswerLongEnough,
  type CompletionAnswers,
} from "./completion";
import { createNoteSnapshot, snapshotAllNotes } from "./notes";

export { ConflictError };

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
    data: { sessionId: s.sessionId, taskId, content: draft.content, reason, kind: "draft" },
  });
}

/**
 * Mark a task complete or reopen it: save, update status, snapshot (the answer and, with
 * features.notesPad, the notes), log. Completing needs a saved answer of at least
 * minAnswerCharsToComplete non-whitespace characters; otherwise this logs task_complete_blocked
 * and throws AnswerTooShortError (422). `answers` (the completion questions) are logged just
 * before task_complete, only when the task is actually completed.
 */
export async function setTaskStatus(
  s: CurrentSession,
  taskId: string,
  action: "complete" | "reopen",
  content: string | undefined,
  answers: CompletionAnswers | null = null,
) {
  if (action === "complete" && content !== undefined) {
    await saveDraft(s, taskId, content, "complete");
  }
  const current = await ensureDraft(s.sessionId, taskId);
  const previousStatus = current.status;
  if (action === "complete" && previousStatus !== "complete" && !isAnswerLongEnough(current.content)) {
    await logEvent(s.sessionId, s.version, taskId, "task_complete_blocked", {
      answerChars: answerChars(current.content),
      minAnswerChars: MIN_ANSWER_CHARS,
      source: answers?.source ?? null,
    });
    throw new AnswerTooShortError(ANSWER_TOO_SHORT_MESSAGE);
  }
  if (answers) await logEvent(s.sessionId, s.version, taskId, "task_completion_answers", answers);

  const status = action === "complete" ? "complete" : "in_progress";
  const draft =
    previousStatus === status
      ? current
      : await prisma.draft.update({
          where: { sessionId_taskId: { sessionId: s.sessionId, taskId } },
          data: { status },
        });

  await createSnapshot(s, taskId, action);
  if (getFeatures(s.version).notesPad) await createNoteSnapshot(s, taskId, action);
  await logEvent(s.sessionId, s.version, taskId, action === "complete" ? "task_complete" : "task_reopen", {
    previousStatus,
    revisionCount: draft.revisionCount,
    length: draft.content.length,
  });
  return draft;
}

/**
 * Required tasks (config/tasks.json `required: true`) whose status isn't "complete". A required
 * task that was completed and then reopened counts as incomplete until it's completed again.
 */
export async function getIncompleteRequired(sessionId: string): Promise<string[]> {
  const drafts = await prisma.draft.findMany({ where: { sessionId }, select: { taskId: true, status: true } });
  const complete = new Set(drafts.filter((d) => d.status === "complete").map((d) => d.taskId));
  return REQUIRED_TASK_IDS.filter((id) => !complete.has(id));
}

/** "Task 2" from "Task 2: Analyze why customers do not book". */
export function shortTaskLabel(title: string): string {
  return title.split(":")[0].trim();
}

/** "Complete all required tasks before ending: Task 2, Task 3." */
export function endWorkBlockedMessage(taskIds: string[]): string {
  const labels = taskIds.map((id) => shortTaskLabel(TASKS.find((t) => t.id === id)?.title ?? id));
  return `Complete all required tasks before ending: ${labels.join(", ")}.`;
}

/** Save the open task's text if it was sent; a complete task is read-only, so skip it. */
async function saveOpenTask(s: CurrentSession, taskId: string | null, content: string | undefined, trigger: string) {
  if (!taskId || content === undefined) return;
  try {
    await saveDraft(s, taskId, content, trigger);
  } catch (e) {
    if (!(e instanceof ConflictError)) throw e;
  }
}

function effortByTask(s: CurrentSession, drafts: { taskId: string; status: string }[]) {
  return Promise.all(
    drafts.map(async (d) => {
      const effort = await getEffort(s.sessionId, d.taskId);
      return { taskId: d.taskId, status: d.status, ...effort };
    }),
  );
}

/**
 * End the work session: save the open task, snapshot every draft (and notes), set endedAt.
 * Callers check getIncompleteRequired first (POST /api/session/end does).
 */
export async function endWork(s: CurrentSession, taskId: string | null, content: string | undefined) {
  await saveOpenTask(s, taskId, content, "end_work");
  const drafts = await prisma.draft.findMany({ where: { sessionId: s.sessionId } });
  for (const d of drafts) await createSnapshot(s, d.taskId, "end_work");
  if (getFeatures(s.version).notesPad) await snapshotAllNotes(s, "end_work");

  const alreadyEnded = s.endedAt !== null;
  if (!alreadyEnded) {
    await prisma.session.update({ where: { sessionId: s.sessionId }, data: { endedAt: new Date() } });
  }
  const completeIds = new Set(drafts.filter((d) => d.status === "complete").map((d) => d.taskId));
  await logEvent(s.sessionId, s.version, taskId, "session_end", {
    alreadyEnded,
    incompleteRequired: REQUIRED_TASK_IDS.filter((id) => !completeIds.has(id)),
    drafts: await effortByTask(s, drafts),
  });
}

/**
 * Withdraw from the study (any time during the work period, every version): save the open
 * task, snapshot every draft and notes row (reason "withdraw"), set endedAt and log
 * `withdrawn`. The participant then sees the exit page; the end survey and interview are skipped.
 */
export async function withdraw(s: CurrentSession, taskId: string | null, content: string | undefined) {
  await saveOpenTask(s, taskId, content, "withdraw");
  const drafts = await prisma.draft.findMany({ where: { sessionId: s.sessionId } });
  for (const d of drafts) await createSnapshot(s, d.taskId, "withdraw");
  if (getFeatures(s.version).notesPad) await snapshotAllNotes(s, "withdraw");

  const withdrawnAt = new Date();
  await prisma.session.update({ where: { sessionId: s.sessionId }, data: { endedAt: withdrawnAt } });
  await logEvent(s.sessionId, s.version, taskId, "withdrawn", {
    withdrawnAt: withdrawnAt.toISOString(),
    drafts: await effortByTask(s, drafts),
  });
}
