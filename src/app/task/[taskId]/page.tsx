import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { getTask, STUDY } from "@/lib/config";
import { ensureDraft } from "@/lib/drafts";
import { logEvent } from "@/lib/logEvent";
import { getConversation } from "@/lib/ai";
import { DRAFT_STATUSES, type DraftStatus } from "@/lib/constants";
import ChatPane from "@/components/ChatPane";
import TaskEditor from "./TaskEditor";

export const dynamic = "force-dynamic";

export default async function TaskPage({ params }: { params: Promise<{ taskId: string }> }) {
  const { taskId } = await params;
  const task = getTask(taskId);
  if (!task) notFound();

  const session = await getCurrentSession();
  if (!session) {
    return (
      <main>
        <h1>Session not found</h1>
        <p>Please open this study using the link you were given.</p>
      </main>
    );
  }

  if (session.endedAt) {
    return (
      <main>
        <h1>Thank you</h1>
        <p>Your work has been saved. Please continue to the survey.</p>
        <p>
          <a href="/survey?from=ended_page">Continue to survey</a>
        </p>
      </main>
    );
  }

  const draft = await ensureDraft(session.sessionId, taskId);
  await logEvent(session.sessionId, session.version, taskId, "task_open", {
    status: draft.status,
    revisionCount: draft.revisionCount,
    length: draft.content.length,
  });
  const status: DraftStatus = (DRAFT_STATUSES as readonly string[]).includes(draft.status)
    ? (draft.status as DraftStatus)
    : "in_progress";
  const aiMessages = session.version !== "none" ? await getConversation(session.sessionId, taskId) : [];

  return (
    <main className="workspace">
      <section className="task-column">
        <h1>{task.title}</h1>
        {task.instructions.map((line, i) => (
          <p key={i}>{line}</p>
        ))}
        <TaskEditor
          sessionId={session.sessionId}
          taskId={taskId}
          initialContent={draft.content}
          initialStatus={status}
          autosaveIntervalMs={STUDY.autosaveIntervalMs}
          snapshotIntervalMs={STUDY.snapshotIntervalMs}
        />
      </section>
      {session.version !== "none" && (
        <aside className="chat-column">
          <ChatPane taskId={taskId} version={session.version} initialMessages={aiMessages} />
        </aside>
      )}
    </main>
  );
}
