import { prisma } from "./db";
import { logEvent } from "./logEvent";
import type { CurrentSession } from "./session";

export type PlanInput = { purpose: string; goodEnough: string; timeBudgetMinutes: number };
export type Plan = PlanInput & { updatedAt: string };

const MAX_TEXT = 2000;
const MAX_BUDGET_MINUTES = 600;

/** Validate a plan from a request body. Returns the cleaned plan or an error message. */
export function parsePlan(body: Record<string, unknown>): PlanInput | string {
  const purpose = typeof body.purpose === "string" ? body.purpose.trim() : "";
  const goodEnough = typeof body.goodEnough === "string" ? body.goodEnough.trim() : "";
  const budget = Number(body.timeBudgetMinutes);
  if (!purpose || !goodEnough) return "Please fill in every field.";
  if (purpose.length > MAX_TEXT || goodEnough.length > MAX_TEXT) return "Answers are too long.";
  if (!Number.isInteger(budget) || budget < 1 || budget > MAX_BUDGET_MINUTES) {
    return `Time budget must be a whole number of minutes from 1 to ${MAX_BUDGET_MINUTES}.`;
  }
  return { purpose, goodEnough, timeBudgetMinutes: budget };
}

export async function getPlan(sessionId: string, taskId: string): Promise<Plan | null> {
  const row = await prisma.taskPlan.findUnique({ where: { sessionId_taskId: { sessionId, taskId } } });
  if (!row) return null;
  const { purpose, goodEnough, timeBudgetMinutes, updatedAt } = row;
  return { purpose, goodEnough, timeBudgetMinutes, updatedAt: updatedAt.toISOString() };
}

/**
 * Create or edit a task plan. Logs task_plan_submitted (first time, full plan) or
 * task_plan_updated (changed fields with old and new values). An unchanged edit logs nothing.
 */
export async function savePlan(s: CurrentSession, taskId: string, input: PlanInput): Promise<Plan> {
  const where = { sessionId_taskId: { sessionId: s.sessionId, taskId } };
  const existing = await prisma.taskPlan.findUnique({ where });

  if (!existing) {
    const row = await prisma.taskPlan.create({ data: { sessionId: s.sessionId, taskId, ...input } });
    await logEvent(s.sessionId, s.version, taskId, "task_plan_submitted", { ...input });
    return { ...input, updatedAt: row.updatedAt.toISOString() };
  }

  const changes: Record<string, { from: unknown; to: unknown }> = {};
  for (const key of ["purpose", "goodEnough", "timeBudgetMinutes"] as const) {
    if (existing[key] !== input[key]) changes[key] = { from: existing[key], to: input[key] };
  }
  if (Object.keys(changes).length === 0) {
    return { ...input, updatedAt: existing.updatedAt.toISOString() };
  }
  const row = await prisma.taskPlan.update({ where, data: input });
  await logEvent(s.sessionId, s.version, taskId, "task_plan_updated", { changes });
  return { ...input, updatedAt: row.updatedAt.toISOString() };
}
