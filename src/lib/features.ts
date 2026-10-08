import type { Version } from "./constants";

/**
 * Which study features each version gets. Use these flags instead of comparing
 * version strings, so a version's feature set is defined in one place.
 * Layout and editor size are the same in every version; only flagged features differ.
 */
export type Features = {
  /** AI chat pane and /api/ai. */
  ai: boolean;
  /** Task plan form before the first edit, and the plan panel. */
  taskPlan: boolean;
  /** Effort panel (active time, AI requests, revisions). Metrics are logged in every version. */
  effortDisplay: boolean;
  /** Completion checkpoints (Kevin). */
  checkpoints: boolean;
  /** Peer chat (Kevin). */
  peerChat: boolean;
};

export const FEATURES: Record<Version, Features> = {
  none: { ai: false, taskPlan: false, effortDisplay: false, checkpoints: false, peerChat: false },
  standard: { ai: true, taskPlan: false, effortDisplay: false, checkpoints: false, peerChat: false },
  sustainable: { ai: true, taskPlan: true, effortDisplay: true, checkpoints: true, peerChat: true },
};

export function getFeatures(version: Version): Features {
  return FEATURES[version];
}
