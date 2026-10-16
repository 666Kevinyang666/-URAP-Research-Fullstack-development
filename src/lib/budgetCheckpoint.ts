import { prisma } from "./db";

// Time-budget checkpoint (treatment prompt 1, versions with features.checkpoints, when
// config/study.json's checkpointTrigger is "time_budget"). Shown once per reopen "episode"
// when the task's displayed active time reaches its current plan time budget: resolved via
// PR #3's open question 4 ("should it ever fire on a completed task that was reopened?") —
// yes, because a reopened, already-over-budget task is exactly the post-viability
// persistence this study measures, so it should still get a checkpoint moment rather than
// going completely unmonitored for the rest of the session. "Already shown" is scoped to
// events after the most recent task_reopen, so a refresh or a later budget edit within the
// same episode never re-shows it, but reopening starts a fresh episode. Decisions reuse the
// checkpoint_resolved event with trigger: "time_budget" and no numeric index, so they don't
// mix with the AI-request checkpoint indices in @/lib/checkpoints.

export const BUDGET_CHECKPOINT_ACTIONS = ["finish", "continue", "pause", "flag"] as const;
export type BudgetCheckpointAction = (typeof BUDGET_CHECKPOINT_ACTIONS)[number];

export type BudgetCheckpointState = {
  shown: boolean;
  /** Set when the participant chose Flag for later: shown above the draft. */
  flag: { note: string | null } | null;
};

export async function getBudgetCheckpointState(sessionId: string, taskId: string): Promise<BudgetCheckpointState> {
  const rows = await prisma.event.findMany({
    where: { sessionId, taskId, eventType: { in: ["checkpoint_shown", "checkpoint_resolved", "task_reopen"] } },
    orderBy: { id: "asc" },
    select: { id: true, eventType: true, payload: true },
  });
  const lastReopenId = rows.findLast((r) => r.eventType === "task_reopen")?.id ?? -1;
  const budgetRows = rows.filter(
    (r) => r.eventType !== "task_reopen" && (r.payload as { trigger?: unknown } | null)?.trigger === "time_budget",
  );
  const currentEpisodeRows = budgetRows.filter((r) => r.id > lastReopenId);
  const flagRow = budgetRows.findLast(
    (r) => r.eventType === "checkpoint_resolved" && (r.payload as { action?: unknown }).action === "flag",
  );
  const note = (flagRow?.payload as { note?: unknown } | undefined)?.note;
  return {
    shown: currentEpisodeRows.length > 0,
    flag: flagRow ? { note: typeof note === "string" && note ? note : null } : null,
  };
}
