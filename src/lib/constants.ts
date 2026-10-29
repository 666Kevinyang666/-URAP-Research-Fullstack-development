export const VERSIONS = ["none", "standard", "sustainable"] as const;
export type Version = (typeof VERSIONS)[number];

export const DRAFT_STATUSES = ["not_started", "in_progress", "complete"] as const;
export type DraftStatus = (typeof DRAFT_STATUSES)[number];

export const SNAPSHOT_REASONS = ["interval", "complete", "reopen", "end_work", "withdraw"] as const;
export type SnapshotReason = (typeof SNAPSHOT_REASONS)[number];

/** What a Snapshot row copies: the answer in the main editor, or the drafting notes (features.notesPad). */
export const SNAPSHOT_KINDS = ["draft", "notes"] as const;
export type SnapshotKind = (typeof SNAPSHOT_KINDS)[number];

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
  "withdraw_prompt",
  "withdraw_cancel",
  "brief_download",
  "brief_panel_open",
  // Paste logging (every version).
  "paste",
  "large_paste",
  // Focus mode (features.focusMode).
  "fullscreen_entered",
  "fullscreen_exited",
  "fullscreen_unsupported",
  "fullscreen_request_failed",
  "tab_hidden",
  "tab_visible",
  "window_blur",
  "window_focus",
  "focus_overlay_shown",
  "focus_returned",
] as const;

export const SID_COOKIE = "sid";

export function isVersion(v: unknown): v is Version {
  return typeof v === "string" && (VERSIONS as readonly string[]).includes(v);
}
