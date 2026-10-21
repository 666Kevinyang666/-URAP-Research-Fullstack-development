// HTTP Basic Auth for demos (used by src/proxy.ts and the /admin routes). Edge-safe: no Node APIs.
//
// - DEMO_PASSWORD unset: auth is off everywhere (normal local dev), except that /admin still
//   needs ADMIN_PASSWORD if that one is set.
// - DEMO_PASSWORD set: every route needs a password. Participant routes accept DEMO_PASSWORD or
//   ADMIN_PASSWORD; /admin accepts only ADMIN_PASSWORD (and refuses everyone if it's unset).
// The username is ignored. Both use one realm, so a researcher's browser that has the admin
// password cached can also open participant links.

export const AUTH_REALM = "URAP study demo";

export type AuthScope = "participant" | "admin";

/** Password from an "Authorization: Basic ..." header, or null. */
function passwordFrom(header: string | null): string | null {
  if (!header?.toLowerCase().startsWith("basic ")) return null;
  try {
    const decoded = atob(header.slice(6).trim());
    const colon = decoded.indexOf(":");
    return colon === -1 ? null : decoded.slice(colon + 1);
  } catch {
    return null;
  }
}

/** Compares without returning early on the first differing character. */
function safeEqual(a: string, b: string): boolean {
  let diff = a.length ^ b.length;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  }
  return diff === 0;
}

export type AuthResult = "ok" | "challenge" | "admin_disabled";

export function checkBasicAuth(scope: AuthScope, authorization: string | null): AuthResult {
  const demo = process.env.DEMO_PASSWORD?.trim() || "";
  const admin = process.env.ADMIN_PASSWORD?.trim() || "";

  if (scope === "admin") {
    if (!admin) return demo ? "admin_disabled" : "ok";
  } else if (!demo) {
    return "ok";
  }

  const given = passwordFrom(authorization);
  if (given === null) return "challenge";
  const accepted = scope === "admin" ? [admin] : [demo, admin].filter(Boolean);
  return accepted.some((p) => safeEqual(given, p)) ? "ok" : "challenge";
}

/** The 401 that makes the browser show its password prompt. */
export function challengeResponse(): Response {
  return new Response("Password required.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${AUTH_REALM}", charset="UTF-8"`, "Cache-Control": "no-store" },
  });
}

export function adminDisabledResponse(): Response {
  return new Response("The admin page is off: set ADMIN_PASSWORD in .env and restart.", { status: 403 });
}

export function isAdminPath(pathname: string): boolean {
  return pathname === "/admin" || pathname.startsWith("/admin/");
}
