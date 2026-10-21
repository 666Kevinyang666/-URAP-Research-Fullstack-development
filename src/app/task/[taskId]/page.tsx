import { notFound, redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/session";
import { CHECKPOINT_TRIGGER, getTask, STUDY, TASKS } from "@/lib/config";
import { prisma } from "@/lib/db";
import { ensureDraft } from "@/lib/drafts";
import { logEvent } from "@/lib/logEvent";
import { getConversation } from "@/lib/ai";
import { DRAFT_STATUSES, type DraftStatus } from "@/lib/constants";
import { getFeatures } from "@/lib/features";
import ChatPane from "@/components/ChatPane";
import TaskEditor from "./TaskEditor";
import TaskNav, { type NavTask } from "./TaskNav";
import { FlagBanner, PauseBanner, WorkspaceProvider } from "./Workspace";
import { getPauseState } from "@/lib/pause";
import { getEffort } from "@/lib/effort";
import { getPlan } from "@/lib/plans";
import { PlanPanel } from "./Plan";
import EffortPanel from "./EffortPanel";
import { CHECKPOINT_THRESHOLDS, PEER_CHECKPOINT_INDEX, getResolvedCheckpointIndices } from "@/lib/checkpoints";
import { getPeerCheckinDoneIndices } from "@/lib/peer";
import Checkpoint from "./Checkpoint";
import TaskContent from "./TaskContent";
import { getJourneyStage, stagePath } from "@/lib/journey";
import NoSession from "@/components/NoSession";
import { getBudgetCheckpointState } from "@/lib/budgetCheckpoint";
import BudgetCheckpoint from "./BudgetCheckpoint";
import { getHandledBreakIndices } from "@/lib/breaks";
import BreakPrompt from "./BreakPrompt";
import { getPeerCheckinV2Ended, getPeerCheckinV2Shown } from "@/lib/peerVoice";
import PeerCheckinV2 from "./PeerCheckinV2";

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
  if (!session) return <NoSession />;

  // Consent, instructions and Start work come first; a declined session goes to /exit.
  const stage = await getJourneyStage(session);
  if (stage !== "work" && stage !== "ended") redirect(stagePath(stage));

  if (stage === "ended") {
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
  const handledBreaks = features.breakPrompts ? await getHandledBreakIndices(session.sessionId) : [];
  const useBudgetCheckpoint = features.checkpoints && CHECKPOINT_TRIGGER === "time_budget";
  const budgetCheckpoint = useBudgetCheckpoint
    ? await getBudgetCheckpointState(session.sessionId, taskId)
    : { shown: false, flag: null };
  const [resolvedCheckpointIndices, peerDoneIndices] =
    features.checkpoints && !useBudgetCheckpoint
    ? await Promise.all([
        getResolvedCheckpointIndices(session.sessionId, taskId),
        getPeerCheckinDoneIndices(session.sessionId, taskId),
      ])
    : [[], []];
  const [peerV2Shown, peerV2Ended] = features.peerChat
    ? await Promise.all([getPeerCheckinV2Shown(session.sessionId), getPeerCheckinV2Ended(session.sessionId)])
    : [false, false];

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
      workStartedAt={session.workStartedAt?.toISOString() ?? null}
      serverNowAtRender={Date.now()}
      initialPauseInfo={
        pauseState.paused
          ? { since: pauseState.since.getTime(), reason: pauseState.reason, breakIndex: pauseState.breakIndex }
          : null
      }
      initialFlag={budgetCheckpoint.flag}
    >
      <main className="workspace">
        <TaskNav tasks={navTasks} />
        <section className="task-column">
          <PauseBanner />
          <h1>{task.title}</h1>
          <p className="task-meta">{task.required ? "Required task" : "Optional task"}</p>
          <TaskContent task={task} />
          <FlagBanner />
          <TaskEditor
            sessionId={session.sessionId}
            taskId={taskId}
            initialContent={draft.content}
            autosaveIntervalMs={STUDY.autosaveIntervalMs}
            snapshotIntervalMs={STUDY.snapshotIntervalMs}
          />
        </section>
        {/* Always rendered (a one-line note when there's no AI) so the layout is identical across versions. */}
        <aside className="side-column">
          {features.taskPlan && <PlanPanel />}
          {features.effortDisplay && <EffortPanel initialAiRequestCount={effort.aiRequestCount} />}
          {features.ai ? (
            <ChatPane taskId={taskId} version={session.version} initialMessages={aiMessages} />
          ) : (
            <p className="no-ai-note">AI assistance is not available in this session.</p>
          )}
        </aside>
        {/* checkpointTrigger (config/study.json) picks the time-budget checkpoint (default) or the
            AI-request-count checkpoint with its peer check-in stage. */}
        {useBudgetCheckpoint && <BudgetCheckpoint initialShown={budgetCheckpoint.shown} />}
        {features.breakPrompts && <BreakPrompt initialHandled={handledBreaks} />}
        {features.peerChat && <PeerCheckinV2 initialShown={peerV2Shown} initialEnded={peerV2Ended} />}
        {features.checkpoints && !useBudgetCheckpoint && (
          <Checkpoint
            thresholds={CHECKPOINT_THRESHOLDS}
            peerIndex={PEER_CHECKPOINT_INDEX}
            peerEnabled={features.peerChat}
            initialAiRequestCount={effort.aiRequestCount}
            initialResolvedIndices={resolvedCheckpointIndices}
            initialPeerDoneIndices={peerDoneIndices}
          />
        )}
      </main>
    </WorkspaceProvider>
  );
}
