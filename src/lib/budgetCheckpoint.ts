import { prisma } from "./db";

// Time-budget checkpoint (treatment prompt 1, versions with features.checkpoints, when
// config/study.json's checkpointTrigger is "time_budget"). Shown once per task when the
// task's displayed active time reaches its current plan time budget. "Already shown" is
// persisted as a checkpoint_shown event, so a refresh or a later budget edit never re-shows it.
// Decisions reuse the checkpoint_resolved event with trigger: "time_budget" and no numeric
// index, so they don't mix with the AI-request checkpoint indices in @/lib/checkpoints.

export const BUDGET_CHECKPOINT_ACTIONS = ["finish", "continue", "pause", "flag"] as const;
export type BudgetCheckpointAction = (typeof BUDGET_CHECKPOINT_ACTIONS)[number];

export type BudgetCheckpointState = {
  shown: boolean;
  /** Set when the participant chose Flag for later: shown above the draft. */
  flag: { note: string | null } | null;
};

export async function getBudgetCheckpointState(sessionId: string, taskId: string): Promise<BudgetCheckpointState> {
  const rows = await prisma.event.findMany({
    where: { sessionId, taskId, eventType: { in: ["checkpoint_shown", "checkpoint_resolved"] } },
    orderBy: { id: "asc" },
    select: { eventType: true, payload: true },
  });
  const budgetRows = rows.filter((r) => (r.payload as { trigger?: unknown } | null)?.trigger === "time_budget");
  const flagRow = budgetRows.findLast(
    (r) => r.eventType === "checkpoint_resolved" && (r.payload as { action?: unknown }).action === "flag",
  );
  const note = (flagRow?.payload as { note?: unknown } | undefined)?.note;
  return {
    shown: budgetRows.length > 0,
    flag: flagRow ? { note: typeof note === "string" && note ? note : null } : null,
  };
}
