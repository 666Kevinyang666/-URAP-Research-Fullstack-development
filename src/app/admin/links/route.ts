import { NextResponse } from "next/server";
import { LinkError, adminAuthorized, createLinks, demoSetSpecs, newSid, startPath } from "@/lib/admin";
import { challengeResponse } from "@/lib/basicAuth";
import { isVersion } from "@/lib/constants";
import { publicOrigin } from "@/lib/origin";

// POST /admin/links { version, sid? }  -> one participant link (sid auto-generated if blank)
// POST /admin/links { demoSet: true }  -> none, standard, and a paired sustainable pair
// -> { links: [{ sid, version, peer, url }] }, with full URLs on the host the researcher is using.
export async function POST(req: Request) {
  if (!adminAuthorized(req)) return challengeResponse();

  let body: Record<string, unknown>;
  try {
    body = JSON.parse((await req.text()) || "{}");
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let specs;
  if (body.demoSet === true) {
    specs = demoSetSpecs();
  } else {
    if (!isVersion(body.version)) return NextResponse.json({ error: "Pick a version" }, { status: 400 });
    const sid = typeof body.sid === "string" && body.sid.trim() ? body.sid.trim() : newSid(body.version);
    specs = [{ sid, version: body.version }];
  }

  try {
    await createLinks(specs);
  } catch (e) {
    if (e instanceof LinkError) return NextResponse.json({ error: e.message }, { status: 409 });
    throw e;
  }
  const origin = publicOrigin(req.headers);
  return NextResponse.json({
    links: specs.map((s) => ({ sid: s.sid, version: s.version, peer: s.peer ?? null, url: origin + startPath(s) })),
  });
}
