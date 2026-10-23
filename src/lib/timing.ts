import { STUDY } from "./config";

// Session-clock timings from config/study.json, in ms. Safe to import from browser code.
// The session clock runs from Session.workStartedAt ("Start work") and includes paused
// time, per the treatment prompts document. Server code can use getSessionClock() in
// @/lib/sessionClock; browser code gets the same clock from useWorkspace().sessionElapsedMs().

/**
 * Multiplier applied to every session-clock timing, for demos and testing. 1 = real time;
 * 1/60 (≈ 0.0167) turns 60 minutes into 60 seconds. Doesn't affect task time budgets,
 * which are compared against active task time, not the session clock.
 *
 * The DEMO_TIME_SCALE environment variable overrides demoTimeScale in config/study.json, so a
 * demo can speed up the clock without editing committed config (`npm run demo` sets 0.05).
 * next.config.ts inlines it into server and browser code when the app is built or `next dev`
 * starts, so change it by restarting (the demo script rebuilds every run).
 */
const ENV_TIME_SCALE = Number(process.env.DEMO_TIME_SCALE);
export const DEMO_TIME_SCALE: number =
  ENV_TIME_SCALE > 0
    ? ENV_TIME_SCALE
    : typeof STUDY.demoTimeScale === "number" && STUDY.demoTimeScale > 0
      ? STUDY.demoTimeScale
      : 1;

/** Converts configured session-clock minutes to (scaled) ms. */
export function sessionMinutesToMs(minutes: number): number {
  return Math.round(minutes * 60_000 * DEMO_TIME_SCALE);
}

/** Break prompt times (default 60:00 and 120:00). */
export const BREAK_PROMPT_TIMES_MS: number[] = (STUDY.breakPromptMinutes ?? []).map(sessionMinutesToMs);

/** Break length (default 5:00) after which the pause screen says the break is over. */
export const BREAK_LENGTH_MS = sessionMinutesToMs(STUDY.breakLengthMinutes ?? 5);

/** Peer check-in invitation time (default 90:00). For Kevin's peer check-in trigger. */
export const PEER_CHECKIN_MS = sessionMinutesToMs(STUDY.peerCheckinMinutes ?? 90);

/** Elapsed session-clock ms since Start work, including paused time. */
export function elapsedSince(workStartedAt: Date | number, now: Date | number = Date.now()): number {
  return Math.max(0, Number(now) - Number(workStartedAt));
}
