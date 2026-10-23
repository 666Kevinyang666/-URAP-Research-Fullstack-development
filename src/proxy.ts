import { NextResponse, type NextRequest } from "next/server";
import { adminDisabledResponse, challengeResponse, checkBasicAuth, isAdminPath } from "@/lib/basicAuth";

// Next 16 request interception (formerly middleware.ts): password-protects the demo with HTTP
// Basic Auth. Off unless DEMO_PASSWORD is set; /admin also requires ADMIN_PASSWORD. Rules are in
// @/lib/basicAuth. Browsers resend the cached credentials on every same-origin request, so
// fetch, sendBeacon saves, polling, voice uploads and survey return links keep working.
export function proxy(request: NextRequest) {
  const scope = isAdminPath(request.nextUrl.pathname) ? "admin" : "participant";
  const result = checkBasicAuth(scope, request.headers.get("authorization"));
  if (result === "challenge") return challengeResponse();
  if (result === "admin_disabled") return adminDisabledResponse();
  return NextResponse.next();
}

export const config = {
  // Everything except Next's static build assets (hashed JS/CSS, which hold no study data).
  matcher: ["/((?!_next/static|_next/image).*)"],
};
