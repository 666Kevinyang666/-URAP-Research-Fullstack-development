import { NextRequest, NextResponse } from "next/server";
import { adminAuthorized, exportJson, exportRows, isExportTable, toCsv } from "@/lib/admin";
import { challengeResponse } from "@/lib/basicAuth";

export const dynamic = "force-dynamic";

// GET /admin/export?format=json[&sid=]            -> every table, grouped by sid, as one JSON file
// GET /admin/export?format=csv&table=<t>[&sid=]   -> one table as CSV (every row has a sid column)
// Tables: sessions, drafts, snapshots, events, task_plans, active_time.
export async function GET(req: NextRequest) {
  if (!adminAuthorized(req)) return challengeResponse();

  const params = req.nextUrl.searchParams;
  const sid = params.get("sid")?.trim() || undefined;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
  const scope = sid ? `session-${sid.replace(/[^A-Za-z0-9_-]/g, "_")}` : "all";

  if (params.get("format") === "csv") {
    const table = params.get("table");
    if (!isExportTable(table)) return NextResponse.json({ error: "Unknown table" }, { status: 400 });
    return new NextResponse(toCsv(await exportRows(table, sid)), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="urap-${scope}-${table}-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  return new NextResponse(JSON.stringify(await exportJson(sid), null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="urap-${scope}-${stamp}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
