// Local backup of unsaved text (main editor and drafting notes), so a refresh or closed tab can't
// lose it even if the final save request arrives after the next page has loaded (or never arrives).
export type Backup = { content: string; baseContent: string };

export function readBackup(key: string): Backup | null {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as Backup) : null;
  } catch {
    return null;
  }
}

export function writeBackup(key: string, backup: Backup | null) {
  try {
    if (backup) localStorage.setItem(key, JSON.stringify(backup));
    else localStorage.removeItem(key);
  } catch {
    // Storage unavailable (e.g. blocked); server autosave still applies.
  }
}
