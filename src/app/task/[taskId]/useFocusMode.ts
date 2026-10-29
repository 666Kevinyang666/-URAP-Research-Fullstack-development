"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { logClientEvent } from "@/lib/clientApi";

/** Why the participant counts as away: they left full screen, hid the tab or switched windows. */
export type AwayReason = "fullscreen_exit" | "tab_hidden" | "window_blur" | "not_fullscreen";
export type FocusAway = { since: number; reasons: AwayReason[] };

/** Delay before checking for full screen after the page loads or work resumes (the request is async). */
const FULLSCREEN_CHECK_DELAY_MS = 1500;

export function fullscreenSupported(): boolean {
  return typeof document !== "undefined" && document.fullscreenEnabled === true && !!document.documentElement.requestFullscreen;
}

/**
 * Request full screen. Must be called from a click handler (browsers need a user gesture).
 * Resolves true once in full screen, false if unsupported or refused (logged).
 */
export async function enterFullscreen(taskId: string | null): Promise<boolean> {
  if (!fullscreenSupported()) {
    logClientEvent(taskId, "fullscreen_unsupported");
    return false;
  }
  if (document.fullscreenElement) return true;
  try {
    await document.documentElement.requestFullscreen();
    return true;
  } catch (e) {
    logClientEvent(taskId, "fullscreen_request_failed", { message: String(e) });
    return false;
  }
}

/**
 * Focus mode (features.focusMode) on a task page. While `enabled`, logs fullscreen_entered /
 * fullscreen_exited, tab_hidden / tab_visible and window_blur / window_focus. While `active`
 * too (not paused, not ending or withdrawing), any of those departures starts an away episode:
 * `away` is set (the overlay shows and the active-time clock stops) and onAway runs (saves the
 * draft). It ends only through returnToStudy, from the overlay's button, which logs
 * focus_returned with awayMs.
 */
export function useFocusMode(opts: { enabled: boolean; active: boolean; taskId: string; onAway: () => void }) {
  const { enabled, active, taskId } = opts;
  const [away, setAway] = useState<FocusAway | null>(null);
  const awayRef = useRef<FocusAway | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const onAwayRef = useRef(opts.onAway);
  onAwayRef.current = opts.onAway;

  const begin = useCallback(
    (reason: AwayReason) => {
      if (!activeRef.current) return;
      const current = awayRef.current;
      if (current) {
        if (!current.reasons.includes(reason)) {
          awayRef.current = { ...current, reasons: [...current.reasons, reason] };
          setAway(awayRef.current);
        }
        return;
      }
      awayRef.current = { since: Date.now(), reasons: [reason] };
      setAway(awayRef.current);
      logClientEvent(taskId, "focus_overlay_shown", { reason });
      onAwayRef.current(); // save before (or as) the overlay shows
    },
    [taskId],
  );

  useEffect(() => {
    if (!enabled) return;
    const onFullscreen = () => {
      if (document.fullscreenElement) {
        logClientEvent(taskId, "fullscreen_entered");
      } else {
        logClientEvent(taskId, "fullscreen_exited");
        begin("fullscreen_exit");
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") {
        logClientEvent(taskId, "tab_hidden");
        begin("tab_hidden");
      } else {
        logClientEvent(taskId, "tab_visible");
      }
    };
    const onBlur = () => {
      logClientEvent(taskId, "window_blur");
      begin("window_blur");
    };
    const onFocus = () => logClientEvent(taskId, "window_focus");
    document.addEventListener("fullscreenchange", onFullscreen);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("blur", onBlur);
    window.addEventListener("focus", onFocus);
    if (!fullscreenSupported()) logClientEvent(taskId, "fullscreen_unsupported");
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreen);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("blur", onBlur);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, taskId, begin]);

  // On load, and when work resumes after a pause, the page must be in full screen (a refresh or
  // a full page load always leaves it). Checked after a short delay, since Start work and Resume
  // request full screen just before.
  useEffect(() => {
    if (!enabled || !active || !fullscreenSupported()) return;
    const id = setTimeout(() => {
      if (!document.fullscreenElement) begin("not_fullscreen");
    }, FULLSCREEN_CHECK_DELAY_MS);
    return () => clearTimeout(id);
  }, [enabled, active, begin]);

  /** From the overlay's button (a user gesture): re-enter full screen, then end the away episode. */
  const returnToStudy = useCallback(() => {
    const finish = () => {
      const current = awayRef.current;
      if (!current) return;
      awayRef.current = null;
      setAway(null);
      logClientEvent(taskId, "focus_returned", { awayMs: Date.now() - current.since, reasons: current.reasons });
    };
    if (fullscreenSupported() && !document.fullscreenElement) {
      // If full screen is refused, let them back in anyway; the departure is already logged.
      enterFullscreen(taskId).then(finish);
    } else {
      finish();
    }
  }, [taskId]);

  // Pausing, End work and Withdraw end any open episode without the overlay.
  useEffect(() => {
    if (active || !awayRef.current) return;
    const current = awayRef.current;
    awayRef.current = null;
    setAway(null);
    logClientEvent(taskId, "focus_returned", {
      awayMs: Date.now() - current.since,
      reasons: current.reasons,
      endedBy: "inactive",
    });
  }, [active, taskId]);

  return { away, returnToStudy };
}
