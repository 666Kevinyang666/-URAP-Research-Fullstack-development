import { NextResponse } from "next/server";
import { withSession, error } from "@/lib/api";
import { getFeatures } from "@/lib/features";
import { parsePlan, savePlan } from "@/lib/plans";

// Create or edit a task plan (versions with features.taskPlan only).
// Body: { taskId, purpose, goodEnough, timeBudgetMinutes }
export const POST = withSession(async (s, body) => {
  if (!getFeatures(s.version).taskPlan) return error(403, "Task plans are not part of this version.");
  if (typeof body.taskId !== "string") return error(400, "taskId is required");
  const input = parsePlan(body);
  if (typeof input === "string") return error(400, input);
  const plan = await savePlan(s, body.taskId, input);
  return NextResponse.json({ plan });
});
