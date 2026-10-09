import { prisma } from "./db";
import { STUDY } from "./config";

/**
 * AI-request-count thresholds that open a completion checkpoint (sustainable version only),
 * from config/study.json. The last threshold is the "later checkpoint" that opens with a
 * peer check-in first (see src/lib/peer.ts); earlier ones open the checkpoint directly.
 */
export const CHECKPOINT_THRESHOLDS: number[] = STUDY.checkpointAiRequestThresholds ?? [];
export const PEER_CHECKPOINT_INDEX = CHECKPOINT_THRESHOLDS.length - 1;

export const CHECKPOINT_ACTIONS = ["finish", "continue", "pause", "flag"] as const;
export type CheckpointAction = (typeof CHECKPOINT_ACTIONS)[number];

/** Indices into CHECKPOINT_THRESHOLDS already resolved for this task. */
export async function getResolvedCheckpointIndices(sessionId: string, taskId: string): Promise<number[]> {
  const rows = await prisma.event.findMany({
    where: { sessionId, taskId, eventType: "checkpoint_resolved" },
    select: { payload: true },
  });
  return rows
    .map((r) => (r.payload as { index?: unknown }).index)
    .filter((i): i is number => typeof i === "number");
}
