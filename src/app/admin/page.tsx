import type { Metadata } from "next";
import { headers } from "next/headers";
import { EXPORT_TABLES, listSessions } from "@/lib/admin";
import { checkBasicAuth } from "@/lib/basicAuth";
import { publicOrigin } from "@/lib/origin";
import LinkCreator, { CopyButton } from "./LinkCreator";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Study admin" };

const fmt = (iso: string | null) => (iso ? iso.replace("T", " ").slice(0, 19) : "—");

// Researcher admin, outside the participant flow (ADMIN_PASSWORD, see src/proxy.ts).
// The version picker exists only here, never in the participant workspace.
export default async function AdminPage() {
  const h = await headers();
  if (checkBasicAuth("admin", h.get("authorization")) !== "ok") {
    return (
      <main className="page">
        <h1>Not authorized</h1>
      </main>
    );
  }
  const origin = publicOrigin(h);
  const sessions = await listSessions();

  return (
    <main className="admin">
      <h1>Study admin</h1>
      <p className="admin-hint">
        Links use this address: <code>{origin}</code>. Through the demo tunnel they work only while{" "}
        <code>npm run demo</code> is running.
      </p>

      <section>
        <h2>Create session links</h2>
        <LinkCreator />
      </section>

      <section>
        <h2>Sessions ({sessions.length})</h2>
        <p>
          <a href="/admin">Refresh</a>
        </p>
        {sessions.length === 0 ? (
          <p>No sessions yet.</p>
        ) : (
          <div className="admin-scroll">
            <table className="admin-table" id="sessions-table">
              <thead>
                <tr>
                  <th>sid</th>
                  <th>Version</th>
                  <th>Created</th>
                  <th>Work started</th>
                  <th>Ended</th>
                  <th>Stage</th>
                  <th>Tasks</th>
                  <th>Link</th>
                  <th>Export</th>
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => (
                  <tr key={s.sid} data-sid={s.sid}>
                    <td>
                      <code>{s.sid}</code>
                      {s.peer && <div className="admin-hint">peer: {s.peer}</div>}
                    </td>
                    <td>{s.version}</td>
                    <td>{s.createdAt ? fmt(s.createdAt) : `link made ${fmt(s.linkCreatedAt)}`}</td>
                    <td>{fmt(s.workStartedAt)}</td>
                    <td>{fmt(s.endedAt)}</td>
                    <td className="stage">{s.stage.replace(/_/g, " ")}</td>
                    <td>
                      <ol className="admin-tasks">
                        {s.tasks.map((t) => (
                          <li key={t.id} title={t.title} className={`task-status-${t.status}`}>
                            {t.status.replace(/_/g, " ")}
                          </li>
                        ))}
                      </ol>
                    </td>
                    <td>
                      <CopyButton text={origin + s.link} />
                    </td>
                    <td>
                      <a href={`/admin/export?format=json&sid=${encodeURIComponent(s.sid)}`}>JSON</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section>
        <h2>Export</h2>
        <p>
          Every row is keyed by <code>sid</code>, the same ID the Qualtrics surveys store as embedded data.
        </p>
        <ul>
          <li>
            <a href="/admin/export?format=json" id="export-json">
              All data (JSON, grouped by sid)
            </a>
          </li>
          {EXPORT_TABLES.map((t) => (
            <li key={t}>
              <a href={`/admin/export?format=csv&table=${t}`}>{t}.csv</a>
            </li>
          ))}
        </ul>
        <p className="admin-hint">
          One session: use its JSON link in the table, or add <code>&amp;sid=…</code> to any export link.
        </p>
      </section>
    </main>
  );
}
