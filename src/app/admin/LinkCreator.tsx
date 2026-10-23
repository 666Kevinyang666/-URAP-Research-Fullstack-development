"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { VERSIONS, type Version } from "@/lib/constants";

type CreatedLink = { sid: string; version: Version; peer: string | null; url: string };

export function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      window.prompt("Copy this link:", text);
    }
  }
  return (
    <button type="button" onClick={copy}>
      {copied ? "Copied" : "Copy"}
    </button>
  );
}

/** Create participant links: one at a time, or a full demo set. */
export default function LinkCreator() {
  const router = useRouter();
  const [version, setVersion] = useState<Version>("none");
  const [sid, setSid] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [links, setLinks] = useState<CreatedLink[]>([]);

  async function create(body: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/admin/links", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      setLinks(data.links);
      setSid("");
      router.refresh(); // update the sessions table
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-links">
      <div className="toolbar">
        <button type="button" onClick={() => create({ demoSet: true })} disabled={busy} id="create-demo-set">
          Create demo set
        </button>
        <span className="admin-hint">One none link, one standard link, and a paired sustainable pair.</span>
      </div>

      <form
        className="admin-form"
        onSubmit={(e) => {
          e.preventDefault();
          create({ version, sid });
        }}
      >
        <label>
          Version{" "}
          <select value={version} onChange={(e) => setVersion(e.target.value as Version)} name="version">
            {VERSIONS.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </label>
        <label>
          sid (optional){" "}
          <input
            name="sid"
            value={sid}
            onChange={(e) => setSid(e.target.value)}
            placeholder="auto-generated if blank"
            maxLength={64}
          />
        </label>
        <button type="submit" disabled={busy}>
          Create link
        </button>
      </form>

      {error && <p className="save-status not-saved">{error}</p>}

      {links.length > 0 && (
        <table className="admin-table" id="created-links">
          <caption>New links (each opens a fresh session; send one link per person)</caption>
          <thead>
            <tr>
              <th>Version</th>
              <th>sid</th>
              <th>Link</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {links.map((l) => (
              <tr key={l.sid} data-version={l.version}>
                <td>
                  {l.version}
                  {l.peer && <div className="admin-hint">paired with {l.peer}</div>}
                </td>
                <td>
                  <code>{l.sid}</code>
                </td>
                <td className="admin-link-cell">
                  <code className="admin-link">{l.url}</code>
                </td>
                <td>
                  <CopyButton text={l.url} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
