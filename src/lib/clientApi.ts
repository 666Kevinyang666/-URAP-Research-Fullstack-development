// Browser-side helpers for calling the app's API routes.

export async function post<T = Record<string, unknown>>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return res.json();
}

/** POST that survives page unload (sendBeacon). Use for flushes on hide/close. */
export function beacon(url: string, body: unknown) {
  navigator.sendBeacon(url, new Blob([JSON.stringify(body)], { type: "application/json" }));
}

/** Log an allow-listed browser event (see CLIENT_EVENT_TYPES). Fire-and-forget. */
export function logClientEvent(taskId: string | null, eventType: string, payload: Record<string, unknown> = {}) {
  const body = JSON.stringify({ taskId, eventType, payload: { ...payload, clientTs: new Date().toISOString() } });
  // keepalive lets the request finish even if the page is unloading.
  fetch("/api/events", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(
    () => {},
  );
}
