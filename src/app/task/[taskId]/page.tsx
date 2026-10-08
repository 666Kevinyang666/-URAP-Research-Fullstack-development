import { notFound } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { getTask, STUDY, TASKS } from "@/lib/config";
import { prisma } from "@/lib/db";
import { ensureDraft } from "@/lib/drafts";
import { logEvent } from "@/lib/logEvent";
import { getConversation } from "@/lib/ai";
import { DRAFT_STATUSES, type DraftStatus } from "@/lib/constants";
import { getFeatures } from "@/lib/features";
import ChatPane from "@/components/ChatPane";
import TaskEditor from "./TaskEditor";
import TaskNav, { type NavTask } from "./TaskNav";
import { PauseBanner, WorkspaceProvider } from "./Workspace";
import { getPauseState } from "@/lib/pause";
import { getEffort } from "@/lib/effort";
import { getPlan } from "@/lib/plans";
import { PlanPanel } from "./Plan";

export const dynamic = "force-dynamic";

function toStatus(s: string | undefined): DraftStatus {
  if (s === undefined) return "not_started";
  return (DRAFT_STATUSES as readonly string[]).includes(s) ? (s as DraftStatus) : "in_progress";
}

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
  const status = toStatus(draft.status);
  const drafts = await prisma.draft.findMany({ where: { sessionId: session.sessionId } });
  const navTasks: NavTask[] = TASKS.map((t) => ({
    id: t.id,
    title: t.title,
    required: t.required,
    status: toStatus(drafts.find((d) => d.taskId === t.id)?.status),
  }));
  const features = getFeatures(session.version);
  const [pauseState, effort, plan] = await Promise.all([
    getPauseState(session.sessionId),
    getEffort(session.sessionId, taskId),
    features.taskPlan ? getPlan(session.sessionId, taskId) : null,
  ]);
  const aiMessages = features.ai ? await getConversation(session.sessionId, taskId) : [];

  return (
    <WorkspaceProvider
      taskId={taskId}
      initialStatus={status}
      initialRevisionCount={draft.revisionCount}
      initialActiveMs={effort.activeMs}
      initialPaused={pauseState.paused}
      activeTimeFlushIntervalMs={STUDY.activeTimeFlushIntervalMs}
      planRequired={features.taskPlan}
      initialPlan={plan}
    >
      <main className="workspace">
        <TaskNav tasks={navTasks} />
        <section className="task-column">
          <PauseBanner />
          <h1>{task.title}</h1>
          <p className="task-meta">{task.required ? "Required task" : "Optional task"}</p>
          {task.instructions.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
          <TaskEditor
            sessionId={session.sessionId}
            taskId={taskId}
            initialContent={draft.content}
            autosaveIntervalMs={STUDY.autosaveIntervalMs}
            snapshotIntervalMs={STUDY.snapshotIntervalMs}
          />
        </section>
        {/* Always rendered (empty when no side features) so the layout is identical across versions. */}
        <aside className="side-column">
          {features.taskPlan && <PlanPanel />}
          {features.ai && <ChatPane taskId={taskId} version={session.version} initialMessages={aiMessages} />}
        </aside>
      </main>
    </WorkspaceProvider>
  );
}
