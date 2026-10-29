import type { Version } from "./constants";
import { STUDY } from "./config";

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
  /**
   * Completion checkpoint (Kevin). Opened by the time budget or the AI request count,
   * per config/study.json's checkpointTrigger.
   */
  checkpoints: boolean;
  /** Peer chat (Kevin). */
  peerChat: boolean;
  /** Break prompts at the session-clock times in config/study.json (breakPromptMinutes). */
  breakPrompts: boolean;
  /**
   * Full screen from Start work, and a "Please return to the study" overlay when the participant
   * leaves full screen, hides the tab or switches windows. Versions in config/study.json's
   * focusModeVersions (default: none only).
   */
  focusMode: boolean;
  /**
   * "Drafting notes" panel in the side column, one per task, in place of the AI pane. Versions in
   * config/study.json's notesPadVersions (default: none only).
   */
  notesPad: boolean;
};

const FOCUS_MODE_VERSIONS: readonly string[] = STUDY.focusModeVersions ?? [];
const NOTES_PAD_VERSIONS: readonly string[] = STUDY.notesPadVersions ?? [];

const base: Record<Version, Omit<Features, "focusMode" | "notesPad">> = {
  none: { ai: false, taskPlan: false, effortDisplay: false, checkpoints: false, peerChat: false, breakPrompts: false },
  standard: { ai: true, taskPlan: false, effortDisplay: false, checkpoints: false, peerChat: false, breakPrompts: false },
  sustainable: { ai: true, taskPlan: true, effortDisplay: true, checkpoints: true, peerChat: true, breakPrompts: true },
};

export const FEATURES: Record<Version, Features> = Object.fromEntries(
  (Object.keys(base) as Version[]).map((v) => [
    v,
    { ...base[v], focusMode: FOCUS_MODE_VERSIONS.includes(v), notesPad: NOTES_PAD_VERSIONS.includes(v) },
  ]),
) as Record<Version, Features>;

export function getFeatures(version: Version): Features {
  return FEATURES[version];
}
