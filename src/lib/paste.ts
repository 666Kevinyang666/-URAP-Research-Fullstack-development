import { STUDY } from "./config";
import { logClientEvent } from "./clientApi";

// Paste logging, every version (so the arms stay comparable). Pasting is never blocked.
// Every paste logs `paste`; one of largePasteChars (config/study.json, default 200) or more
// characters also logs `large_paste`.

export const LARGE_PASTE_CHARS: number =
  typeof STUDY.largePasteChars === "number" && STUDY.largePasteChars > 0 ? STUDY.largePasteChars : 200;

export type PasteTarget = "editor" | "notes";

export function logPaste(taskId: string, target: PasteTarget, e: React.ClipboardEvent) {
  const chars = e.clipboardData.getData("text").length;
  const large = chars >= LARGE_PASTE_CHARS;
  logClientEvent(taskId, "paste", { chars, target, large });
  if (large) logClientEvent(taskId, "large_paste", { chars, target });
}
