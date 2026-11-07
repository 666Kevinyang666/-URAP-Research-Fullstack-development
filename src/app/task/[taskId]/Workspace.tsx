"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { DraftStatus } from "@/lib/constants";
import type { Plan } from "@/lib/plans";
import { useRouter } from "next/navigation";
import { logClientEvent, post } from "@/lib/clientApi";
import { BREAK_LENGTH_MS, elapsedSince } from "@/lib/timing";
import { useActiveTime } from "./useActiveTime";
import { enterFullscreen, fullscreenSupported, useFocusMode, type FocusAway } from "./useFocusMode";

/** Why the session is paused. "break" = "Take a 5-minute break" from a break prompt. */
export type PauseInfo = { since: number; reason: "manual" | "break"; breakIndex: number | null };
export type PauseOptions = { reason?: "manual" | "break"; breakIndex?: number };
/** "Flagged for later" from the time-budget checkpoint, shown above the draft. */
export type FlagInfo = { note: string | null };

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
  /** Live active task time in ms (excludes paused, hidden-tab and focus-mode away time). */
  activeMs: number;
  paused: boolean;
  /** When (server time) and why the current pause started; null when not paused. */
  pauseInfo: PauseInfo | null;
  pauseError: string | null;
  pause: (opts?: PauseOptions) => Promise<void>;
  resume: () => Promise<void>;
  /** Save the draft and active time now. Call before showing any prompt. */
  saveNow: () => Promise<void>;
  /** Current time on the server's clock (corrects for browser clock skew). */
  serverNow: () => number;
  /** Session clock: ms since Start work (Session.workStartedAt), including paused time. */
  sessionElapsedMs: () => number | null;
  /**
   * One treatment prompt at a time: claimPrompt returns false if another prompt is open or
   * prompts have stopped (End work). Call releasePrompt when the prompt closes.
   */
  claimPrompt: (name: string) => boolean;
  releasePrompt: (name: string) => void;
  /** True once End work or Withdraw has started; no prompt (or focus overlay) may open after that. */
  promptsStopped: boolean;
  /** features.focusMode: full screen, and the overlay while the participant is away. */
  focusMode: boolean;
  /** Current focus-mode away episode (overlay shown, editing blocked), or null. */
  focusAway: FocusAway | null;
  returnToStudy: () => void;
  flag: FlagInfo | null;
  setFlag: (f: FlagInfo) => void;
  /** Register a function to run before leaving the page. Returns an unregister function. */
  registerFlush: (fn: () => Promise<unknown>) => () => void;
  /** Register a getter for the editor's current text (sent with End work and Withdraw). */
  registerContentGetter: (fn: (() => string) | null) => void;
  /** The editor's current (possibly unsaved) text. */
  getContent: () => string;
  leaveTo: (url: string) => Promise<void>;
  /** Rejects, and work continues, if the server refuses (e.g. a required task isn't complete). */
  endWork: () => Promise<void>;
  withdraw: () => Promise<void>;
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
  /** ISO time of Start work, for the session clock. */
  workStartedAt: string | null;
  /** Server time (ms) when the page was rendered, to correct browser clock skew. */
  serverNowAtRender: number;
  initialPauseInfo: PauseInfo | null;
  initialFlag: FlagInfo | null;
  /** features.focusMode. Task switches then navigate client-side, which keeps full screen. */
  focusMode: boolean;
  children: React.ReactNode;
};

export function WorkspaceProvider(props: Props) {
  const { taskId, children } = props;
  const [status, setStatus] = useState(props.initialStatus);
  const [revisionCount, setRevisionCount] = useState(props.initialRevisionCount);
  const [paused, setPaused] = useState(props.initialPaused);
  const [pauseInfo, setPauseInfo] = useState<PauseInfo | null>(props.initialPaused ? props.initialPauseInfo : null);
  const [pauseError, setPauseError] = useState<string | null>(null);
  const [plan, setPlan] = useState(props.initialPlan);
  const [flag, setFlag] = useState<FlagInfo | null>(props.initialFlag);
  const [promptsStopped, setPromptsStopped] = useState(false);
  const needsPlan = props.planRequired && plan === null;
  const flushers = useRef(new Set<() => Promise<unknown>>());
  const contentGetter = useRef<(() => string) | null>(null);
  const openPromptRef = useRef<string | null>(null);
  const promptsStoppedRef = useRef(false);

  // Offset between the server and browser clocks, measured once at load.
  const [clockOffset] = useState(() => props.serverNowAtRender - Date.now());
  const serverNow = useCallback(() => Date.now() + clockOffset, [clockOffset]);
  const workStartedAtMs = props.workStartedAt ? Date.parse(props.workStartedAt) : null;
  const sessionElapsedMs = useCallback(
    () => (workStartedAtMs === null ? null : elapsedSince(workStartedAtMs, serverNow())),
    [workStartedAtMs, serverNow],
  );

  const router = useRouter();
  const { focusMode } = props;
  // Set below; useFocusMode saves through it when an away episode starts.
  const flushAllRef = useRef<() => Promise<void>>(async () => {});
  const { away: focusAway, returnToStudy } = useFocusMode({
    enabled: focusMode,
    active: focusMode && !paused && !promptsStopped,
    taskId,
    onAway: () => void flushAllRef.current(),
  });

  // Away time (focus mode) doesn't count as active task time.
  const { activeMs, flush: flushActiveTime } = useActiveTime(
    taskId,
    props.initialActiveMs,
    !paused && focusAway === null,
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
  flushAllRef.current = flushAll;

  const getContent = useCallback(() => contentGetter.current?.() ?? "", []);

  const leaveTo = useCallback(
    async (url: string) => {
      await flushAll();
      if (focusMode) {
        // A full page load always leaves full screen, so focus mode navigates client-side.
        logClientEvent(taskId, "task_close", { navigation: "client" });
        router.push(url);
      } else {
        window.location.assign(url);
      }
    },
    [flushAll, focusMode, router, taskId],
  );

  const claimPrompt = useCallback((name: string) => {
    if (promptsStoppedRef.current) return false;
    if (openPromptRef.current !== null && openPromptRef.current !== name) return false;
    openPromptRef.current = name;
    return true;
  }, []);

  const releasePrompt = useCallback((name: string) => {
    if (openPromptRef.current === name) openPromptRef.current = null;
  }, []);

  // End work and Withdraw stop all treatment prompts and focus mode first. If the server
  // refuses, work continues as before.
  const stopAndPost = useCallback(
    async (url: string, then: (data: { next?: string }) => void) => {
      promptsStoppedRef.current = true;
      setPromptsStopped(true);
      try {
        await flushAll();
        then(await post<{ next?: string }>(url, { taskId, content: contentGetter.current?.() }));
      } catch (e) {
        promptsStoppedRef.current = false;
        setPromptsStopped(false);
        throw e;
      }
    },
    [flushAll, taskId],
  );

  // The server renders the "continue to survey" page after End work.
  const endWork = useCallback(() => stopAndPost("/api/session/end", () => window.location.reload()), [stopAndPost]);

  const withdraw = useCallback(
    () => stopAndPost("/api/session/withdraw", (data) => window.location.assign(data.next ?? "/exit")),
    [stopAndPost],
  );

  // Pausing stops the clock immediately (setPaused), then saves and records the pause.
  const pause = useCallback(
    async (opts: PauseOptions = {}) => {
      const reason = opts.reason ?? "manual";
      const breakIndex = opts.breakIndex ?? null;
      setPaused(true);
      setPauseInfo({ since: serverNow(), reason, breakIndex });
      setPauseError(null);
      try {
        await flushAll();
        await post("/api/pause", { taskId, action: "pause", clientTs: new Date().toISOString(), reason, breakIndex });
      } catch (e) {
        setPaused(false);
        setPauseInfo(null);
        setPauseError((e as Error).message);
      }
    },
    [flushAll, taskId, serverNow],
  );

  const resume = useCallback(async () => {
    // Focus mode: back to full screen from this click (needs the user gesture, so before any await).
    if (focusMode && fullscreenSupported() && !document.fullscreenElement) void enterFullscreen(taskId);
    setPauseError(null);
    try {
      await post("/api/pause", { taskId, action: "resume", clientTs: new Date().toISOString() });
      setPaused(false);
      setPauseInfo(null);
    } catch (e) {
      setPauseError((e as Error).message);
    }
  }, [taskId, focusMode]);

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
      pauseInfo,
      pauseError,
      pause,
      resume,
      saveNow: flushAll,
      serverNow,
      sessionElapsedMs,
      claimPrompt,
      releasePrompt,
      promptsStopped,
      focusMode,
      focusAway,
      returnToStudy,
      flag,
      setFlag,
      registerFlush,
      registerContentGetter,
      getContent,
      leaveTo,
      endWork,
      withdraw,
    }),
    [
      taskId,
      status,
      revisionCount,
      plan,
      needsPlan,
      activeMs,
      paused,
      pauseInfo,
      pauseError,
      pause,
      resume,
      flushAll,
      serverNow,
      sessionElapsedMs,
      claimPrompt,
      releasePrompt,
      promptsStopped,
      focusMode,
      focusAway,
      returnToStudy,
      flag,
      registerFlush,
      registerContentGetter,
      getContent,
      leaveTo,
      endWork,
      withdraw,
    ],
  );

  return (
    <WorkspaceContext.Provider value={value}>
      <div className={paused ? "is-paused" : undefined}>{children}</div>
      {focusMode && <FocusOverlay />}
    </WorkspaceContext.Provider>
  );
}

/**
 * Focus mode (features.focusMode): full-page overlay while the participant is away (left full
 * screen, hid the tab or switched windows). A modal dialog, so it covers any other open dialog
 * and blocks editing until the button is used.
 */
function FocusOverlay() {
  const { focusAway, returnToStudy } = useWorkspace();
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (focusAway && !dialog.open) dialog.showModal();
    if (!focusAway && dialog.open) dialog.close();
  }, [focusAway]);
  return (
    <dialog
      ref={dialogRef}
      className="focus-overlay"
      aria-labelledby="focus-overlay-title"
      onCancel={(e) => e.preventDefault() /* only the button returns */}
    >
      {focusAway && (
        <div className="focus-overlay-body">
          <p id="focus-overlay-title">
            <strong>Please return to the study.</strong> Outside tools and websites are not allowed in this session.
          </p>
          <button type="button" onClick={returnToStudy}>
            {fullscreenSupported() ? "Return to full screen" : "Return to the study"}
          </button>
        </div>
      )}
    </dialog>
  );
}

function formatClock(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Pause screen for a break taken from a break prompt: counts up, then says the break is over. */
function BreakBanner({ since }: { since: number }) {
  const { resume, pauseError, serverNow } = useWorkspace();
  const [now, setNow] = useState(() => serverNow());
  useEffect(() => {
    const id = setInterval(() => setNow(serverNow()), 500);
    return () => clearInterval(id);
  }, [serverNow]);
  const elapsed = now - since;
  return (
    <div className="pause-banner" role="status">
      <p>
        <strong>
          {elapsed < BREAK_LENGTH_MS
            ? `Break time: ${formatClock(elapsed)}`
            : "Your 5-minute break is over. Return when you’re ready."}
        </strong>
      </p>
      <button type="button" onClick={resume}>
        Return to work
      </button>
      {pauseError && <p className="save-status not-saved">{pauseError}</p>}
    </div>
  );
}

/** Covers the task while paused. Hidden content keeps its size, so the layout doesn't shift. */
export function PauseBanner() {
  const { paused, pauseInfo, resume, pauseError } = useWorkspace();
  if (!paused) return null;
  if (pauseInfo?.reason === "break") return <BreakBanner since={pauseInfo.since} />;
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

/** "Flagged for later" note above the draft (time-budget checkpoint). */
export function FlagBanner() {
  const { flag } = useWorkspace();
  if (!flag) return null;
  return (
    <div className="flag-banner" role="status">
      <strong>Flagged for later</strong>
      {flag.note && <p>{flag.note}</p>}
    </div>
  );
}
