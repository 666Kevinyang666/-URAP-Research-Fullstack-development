// Browser-side AI request count per task, for the effort panel and completion checkpoints.
//
// The count is always read from the server (count of ai_user_message events for the task,
// see countAiRequests in @/lib/effort), never kept as a separate client tally, so it can't drift.
// Server-side code can call countAiRequests(sessionId, taskId) directly instead.
//
//   const unsubscribe = onAiRequestCount(taskId, (count) => { ... });
//   // the chat pane calls notifyAiRequestSettled(taskId) after each request finishes

type Listener = (count: number) => void;

const listeners = new Map<string, Set<Listener>>();

/** Subscribe to the AI request count for a task. Returns an unsubscribe function. */
export function onAiRequestCount(taskId: string, listener: Listener): () => void {
  let set = listeners.get(taskId);
  if (!set) listeners.set(taskId, (set = new Set()));
  set.add(listener);
  return () => {
    set.delete(listener);
  };
}

/**
 * Call after an AI request finishes (success or error). Fetches the current count and
 * notifies subscribers. Resolves to the count, or null if it couldn't be fetched.
 */
export async function notifyAiRequestSettled(taskId: string): Promise<number | null> {
  try {
    const res = await fetch(`/api/effort?taskId=${encodeURIComponent(taskId)}`);
    if (!res.ok) return null;
    const { aiRequestCount } = (await res.json()) as { aiRequestCount: number };
    listeners.get(taskId)?.forEach((fn) => fn(aiRequestCount));
    return aiRequestCount;
  } catch {
    return null;
  }
}
