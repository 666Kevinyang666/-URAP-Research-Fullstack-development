import { prisma } from "./db";
import { logEvent } from "./logEvent";
import type { CurrentSession } from "./session";
import type { SnapshotReason } from "./constants";
import { ConflictError } from "./errors";

// Drafting notes (versions with features.notesPad): one TaskNote per task, saved like the main
// draft but never submitted. Same rules as Draft: revisionCount and a notes_save event only when
// the content changes, read-only while the task is complete (or after End work / Withdraw), and
// snapshots (Snapshot.kind = "notes") every snapshotIntervalMs and on complete, reopen, End work
// and Withdraw. Notes don't count toward minAnswerCharsToComplete.

/** Load the notes for a task, creating an empty row on first visit. */
export function ensureNote(sessionId: string, taskId: string) {
  return prisma.taskNote.upsert({
    where: { sessionId_taskId: { sessionId, taskId } },
    create: { sessionId, taskId },
    update: {},
  });
}

export async function saveNote(s: CurrentSession, taskId: string, content: string, trigger: string) {
  const { note, changed } = await prisma.$transaction(async (tx) => {
    const existing = await tx.taskNote.findUnique({ where: { sessionId_taskId: { sessionId: s.sessionId, taskId } } });
    if (existing && existing.content === content) return { note: existing, changed: false };
    const draft = await tx.draft.findUnique({ where: { sessionId_taskId: { sessionId: s.sessionId, taskId } } });
    if (draft?.status === "complete") throw new ConflictError("Task is complete; reopen it before editing your notes.");
    const note = await tx.taskNote.upsert({
      where: { sessionId_taskId: { sessionId: s.sessionId, taskId } },
      create: { sessionId: s.sessionId, taskId, content, revisionCount: content ? 1 : 0 },
      update: { content, revisionCount: { increment: 1 } },
    });
    return { note, changed: content !== (existing?.content ?? "") };
  });
  if (changed) {
    await logEvent(s.sessionId, s.version, taskId, "notes_save", {
      trigger,
      revisionCount: note.revisionCount,
      length: content.length,
    });
  }
  return { note, changed };
}

/** Store the current saved notes for a task as a Snapshot with kind "notes". */
export async function createNoteSnapshot(s: CurrentSession, taskId: string, reason: SnapshotReason) {
  const note = await ensureNote(s.sessionId, taskId);
  return prisma.snapshot.create({
    data: { sessionId: s.sessionId, taskId, content: note.content, reason, kind: "notes" },
  });
}

/** Snapshot every notes row of the session (End work, Withdraw). */
export async function snapshotAllNotes(s: CurrentSession, reason: SnapshotReason) {
  const notes = await prisma.taskNote.findMany({ where: { sessionId: s.sessionId } });
  for (const n of notes) {
    await prisma.snapshot.create({
      data: { sessionId: s.sessionId, taskId: n.taskId, content: n.content, reason, kind: "notes" },
    });
  }
}
