/**
 * The origin the participant's browser used (e.g. https://xyz.trycloudflare.com through the
 * demo tunnel, or http://localhost:3000), for absolute redirects and copyable links.
 * Prefers the X-Forwarded-* headers a tunnel or proxy adds over the Host header.
 */
export function publicOrigin(headers: Headers): string {
  const host = (headers.get("x-forwarded-host") ?? headers.get("host") ?? "localhost:3000").split(",")[0].trim();
  const forwardedProto = headers.get("x-forwarded-proto")?.split(",")[0].trim();
  const proto = forwardedProto || (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Absolute URL for an app path (or a full URL, returned as is) on the participant-facing origin. */
export function publicUrl(headers: Headers, pathOrUrl: string): URL {
  return new URL(pathOrUrl, publicOrigin(headers));
}
