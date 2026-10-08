"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { beacon, post } from "@/lib/clientApi";

/**
 * Counts active task time: time while this page is open, the tab is visible and
 * `running` is true (not paused). Sends increments to /api/active-time every
 * `flushIntervalMs`, and immediately when the tab is hidden or the page closes.
 * Returns the live total (server total at load + time counted since) for display.
 */
export function useActiveTime(taskId: string, initialMs: number, running: boolean, flushIntervalMs: number) {
  const countedRef = useRef(initialMs); // all time counted so far, including the server total at load
  const sentRef = useRef(initialMs); // portion of countedRef sent to the server (or in flight)
  const sinceRef = useRef<number | null>(null); // start of the current active stretch, if active
  const runningRef = useRef(running);
  const [displayMs, setDisplayMs] = useState(initialMs);

  // Close the current stretch, then start a new one if still active.
  const settle = useCallback(() => {
    const now = performance.now();
    if (sinceRef.current !== null) countedRef.current += now - sinceRef.current;
    const active = runningRef.current && document.visibilityState === "visible";
    sinceRef.current = active ? now : null;
  }, []);

  const takeDelta = useCallback(() => {
    settle();
    const delta = Math.floor(countedRef.current - sentRef.current);
    if (delta > 0) sentRef.current += delta;
    return delta;
  }, [settle]);

  const flush = useCallback(
    async (reason: string) => {
      const delta = takeDelta();
      if (delta <= 0) return;
      try {
        await post("/api/active-time", { taskId, deltaMs: delta, reason });
      } catch {
        sentRef.current -= delta; // resend with the next heartbeat
      }
    },
    [takeDelta, taskId],
  );

  const flushOnUnload = useCallback(
    (reason: string) => {
      const delta = takeDelta();
      if (delta > 0) beacon("/api/active-time", { taskId, deltaMs: delta, reason });
    },
    [takeDelta, taskId],
  );

  // Start or stop the clock when pause state changes.
  useEffect(() => {
    runningRef.current = running;
    settle();
  }, [running, settle]);

  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === "hidden") flushOnUnload("hidden");
      else settle();
    };
    const onPageHide = () => flushOnUnload("pagehide");
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onPageHide);
    const heartbeat = setInterval(() => flush("interval"), flushIntervalMs);
    const tick = setInterval(() => {
      const current = sinceRef.current === null ? 0 : performance.now() - sinceRef.current;
      setDisplayMs(countedRef.current + current);
    }, 1000);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onPageHide);
      clearInterval(heartbeat);
      clearInterval(tick);
    };
  }, [flush, flushOnUnload, settle, flushIntervalMs]);

  return { activeMs: displayMs, flush };
}
