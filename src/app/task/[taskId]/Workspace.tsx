"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DraftStatus } from "@/lib/constants";
import type { Plan } from "@/lib/plans";
import { post } from "@/lib/clientApi";
import { useActiveTime } from "./useActiveTime";

/**
 * Client state shared by the task page's parts (navigation, editor, side panels).
 * Anything that must be saved before leaving the page registers a flush function;
 * navigation, pause and End work await all of them first.
 */
type WorkspaceValue = {
  taskId: string;
  status: DraftStatus;
  setStatus: (s: DraftStatus) => void;
  revisionCount: number;
  setRevisionCount: (n: number) => void;
  /** Task plan (versions with features.taskPlan). */
  plan: Plan | null;
  setPlan: (p: Plan) => void;
  /** True until the plan is submitted, in versions that require one; the editor is locked meanwhile. */
  needsPlan: boolean;
  /** Live active task time in ms (excludes paused and hidden-tab time). */
  activeMs: number;
  paused: boolean;
  pauseError: string | null;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  /** Register a function to run before leaving the page. Returns an unregister function. */
  registerFlush: (fn: () => Promise<unknown>) => () => void;
  /** Register a getter for the editor's current text (sent with End work). */
  registerContentGetter: (fn: (() => string) | null) => void;
  leaveTo: (url: string) => Promise<void>;
  endWork: () => Promise<void>;
};

const WorkspaceContext = createContext<WorkspaceValue | null>(null);

export function useWorkspace() {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used inside <WorkspaceProvider>");
  return ctx;
}

type Props = {
  taskId: string;
  initialStatus: DraftStatus;
  initialRevisionCount: number;
  initialActiveMs: number;
  initialPaused: boolean;
  activeTimeFlushIntervalMs: number;
  planRequired: boolean;
  initialPlan: Plan | null;
  children: React.ReactNode;
};

export function WorkspaceProvider(props: Props) {
  const { taskId, children } = props;
  const [status, setStatus] = useState(props.initialStatus);
  const [revisionCount, setRevisionCount] = useState(props.initialRevisionCount);
  const [paused, setPaused] = useState(props.initialPaused);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [plan, setPlan] = useState(props.initialPlan);
  const needsPlan = props.planRequired && plan === null;
  const flushers = useRef(new Set<() => Promise<unknown>>());
  const contentGetter = useRef<(() => string) | null>(null);

  const { activeMs, flush: flushActiveTime } = useActiveTime(
    taskId,
    props.initialActiveMs,
    !paused,
    props.activeTimeFlushIntervalMs,
  );

  const registerFlush = useCallback((fn: () => Promise<unknown>) => {
    flushers.current.add(fn);
    return () => {
      flushers.current.delete(fn);
    };
  }, []);

  useEffect(() => registerFlush(() => flushActiveTime("navigate")), [registerFlush, flushActiveTime]);

  const registerContentGetter = useCallback((fn: (() => string) | null) => {
    contentGetter.current = fn;
  }, []);

  const flushAll = useCallback(async () => {
    await Promise.allSettled([...flushers.current].map((fn) => fn()));
  }, []);

  const leaveTo = useCallback(
    async (url: string) => {
      await flushAll();
      window.location.assign(url);
    },
    [flushAll],
  );

  const endWork = useCallback(async () => {
    await flushAll();
    await post("/api/session/end", { taskId, content: contentGetter.current?.() });
    window.location.reload(); // server renders the "continue to survey" page
  }, [flushAll, taskId]);

  // Pausing stops the clock immediately (setPaused), then saves and records the pause.
  const pause = useCallback(async () => {
    setPaused(true);
    setPauseError(null);
    try {
      await flushAll();
      await post("/api/pause", { taskId, action: "pause", clientTs: new Date().toISOString() });
    } catch (e) {
      setPaused(false);
      setPauseError((e as Error).message);
    }
  }, [flushAll, taskId]);

  const resume = useCallback(async () => {
    setPauseError(null);
    try {
      await post("/api/pause", { taskId, action: "resume", clientTs: new Date().toISOString() });
      setPaused(false);
    } catch (e) {
      setPauseError((e as Error).message);
    }
  }, [taskId]);

  const value = useMemo(
    () => ({
      taskId,
      status,
      setStatus,
      revisionCount,
      setRevisionCount,
      plan,
      setPlan,
      needsPlan,
      activeMs,
      paused,
      pauseError,
      pause,
      resume,
      registerFlush,
      registerContentGetter,
      leaveTo,
      endWork,
    }),
    [taskId, status, revisionCount, plan, needsPlan, activeMs, paused, pauseError, pause, resume, registerFlush, registerContentGetter, leaveTo, endWork],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      <div className={paused ? "is-paused" : undefined}>{children}</div>
    </WorkspaceContext.Provider>
  );
}

/** Covers the task while paused. Hidden content keeps its size, so the layout doesn't shift. */
export function PauseBanner() {
  const { paused, resume, pauseError } = useWorkspace();
  if (!paused) return null;
  return (
    <div className="pause-banner" role="status">
      <p>
        <strong>Paused.</strong> Your work is saved and the task timer is stopped.
      </p>
      <button type="button" onClick={resume}>
        Resume
      </button>
      {pauseError && <p className="save-status not-saved">{pauseError}</p>}
    </div>
  );
}
