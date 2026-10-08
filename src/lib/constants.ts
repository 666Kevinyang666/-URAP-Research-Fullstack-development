export const VERSIONS = ["none", "standard", "sustainable"] as const;
export type Version = (typeof VERSIONS)[number];

export const DRAFT_STATUSES = ["not_started", "in_progress", "complete"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const SNAPSHOT_REASONS = ["interval", "complete", "reopen", "end_work"] as const;
export type SnapshotReason = (typeof SNAPSHOT_REASONS)[number];

// Event types the browser is allowed to log via POST /api/events.
// Server-side code (including the AI proxy) may log any event type via logEvent().
export const CLIENT_EVENT_TYPES = [
  "editor_focus",
  "editor_blur",
  "visibility_hidden",
  "visibility_visible",
  "task_close",
  "end_work_prompt",
  "end_work_cancel",
] as const;

export const SID_COOKIE = "sid";

export function isVersion(v: unknown): v is Version {
  return typeof v === "string" && (VERSIONS as readonly string[]).includes(v);
}
