"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import type { DraftStatus } from "@/lib/constants";
import { post } from "@/lib/clientApi";

/**
 * Client state shared by the task page's parts (navigation, editor, side panels).
 * Anything that must be saved before leaving the page registers a flush function;
 * navigation and End work await all of them first.
 */
type WorkspaceValue = {
  taskId: string;
  status: DraftStatus;
  setStatus: (s: DraftStatus) => void;
  revisionCount: number;
  setRevisionCount: (n: number) => void;
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
  children: React.ReactNode;
};

export function WorkspaceProvider({ taskId, initialStatus, initialRevisionCount, children }: Props) {
  const [status, setStatus] = useState(initialStatus);
  const [revisionCount, setRevisionCount] = useState(initialRevisionCount);
  const flushers = useRef(new Set<() => Promise<unknown>>());
  const contentGetter = useRef<(() => string) | null>(null);

  const registerFlush = useCallback((fn: () => Promise<unknown>) => {
    flushers.current.add(fn);
    return () => {
      flushers.current.delete(fn);
    };
  }, []);

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

  const value = useMemo(
    () => ({
      taskId,
      status,
      setStatus,
      revisionCount,
      setRevisionCount,
      registerFlush,
      registerContentGetter,
      leaveTo,
      endWork,
    }),
    [taskId, status, revisionCount, registerFlush, registerContentGetter, leaveTo, endWork],
  );

  return <WorkspaceContext.Provider value={value}>{children}</WorkspaceContext.Provider>;
}
