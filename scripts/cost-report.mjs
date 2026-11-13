#!/usr/bin/env node
// npm run cost-report: estimated OpenAI cost from the token usage logged on every AI reply
// (ai_assistant_message = task assistant, interview_assistant_message = interview follow-ups),
// priced with config/pricing.json, plus a full-study projection. Writes docs/cost-report.md.
//
//   npm run cost-report                                  # DATABASE_URL (default file:./dev.db)
//   npm run cost-report -- --db demo.db                  # another SQLite file
//   npm run cost-report -- --db demo.db --sid-prefix pilot-   # only sessions whose sid starts with pilot-
//   options: --since <ISO date>  --out <file.md>  --no-write
//
// Works on Windows, macOS and Linux (Node 20+). Reads the database read-only.
// The cost formula matches src/lib/cost.ts (keep the two in sync).

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

// ---- Options ----
const argv = process.argv.slice(2);
const opt = (name) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
};
const flag = (name) => argv.includes(`--${name}`);
if (flag("help")) {
  console.log(readFileSync(fileURLToPath(import.meta.url), "utf8").split("\n").slice(1, 12).join("\n"));
  process.exit(0);
}

let dbUrl = opt("db");
if (!dbUrl) {
  const envPath = path.join(root, ".env");
  if (!process.env.DATABASE_URL && existsSync(envPath)) {
    const { parse } = await import("dotenv");
    dbUrl = parse(readFileSync(envPath)).DATABASE_URL;
  }
  dbUrl = (process.env.DATABASE_URL || dbUrl || "").trim() || "file:./dev.db";
}
const dbFile = path.resolve(root, dbUrl.replace(/^file:/, ""));
if (!existsSync(dbFile)) {
  console.error(`[cost-report] Database not found: ${dbFile}`);
  process.exit(1);
}
const sidPrefix = opt("sid-prefix");
const since = opt("since");
const outFile = path.resolve(root, opt("out") ?? "docs/cost-report.md");

const pricing = JSON.parse(readFileSync(path.join(root, "config/pricing.json"), "utf8"));
const interviewGuide = JSON.parse(readFileSync(path.join(root, "config/interview.json"), "utf8"));

// ---- Cost formula (same as src/lib/cost.ts) ----
function modelPrice(model) {
  if (pricing.models[model]) return pricing.models[model];
  const key = Object.keys(pricing.models)
    .filter((k) => model.startsWith(k))
    .sort((a, b) => b.length - a.length)[0];
  return key ? pricing.models[key] : null;
}
function tokens(usage) {
  const n = (v) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
  return {
    input: n(usage?.prompt_tokens),
    cachedInput: n(usage?.prompt_tokens_details?.cached_tokens),
    output: n(usage?.completion_tokens),
    reasoning: n(usage?.completion_tokens_details?.reasoning_tokens),
  };
}
function cost(t, price) {
  if (!price) return null;
  const uncached = Math.max(0, t.input - t.cachedInput);
  return (uncached * price.input + t.cachedInput * price.cachedInput + t.output * price.output) / 1e6;
}

// ---- Read the calls ----
const Database = require("better-sqlite3");
const db = new Database(dbFile, { readonly: true, fileMustExist: true });
const rows = db
  .prepare(
    `SELECT id, sessionId, version, taskId, eventType, payload, timestamp FROM Event
     WHERE eventType IN ('ai_assistant_message', 'interview_assistant_message') ORDER BY id`,
  )
  .all();
db.close();

const calls = [];
const turnByConversation = new Map(); // task-assistant turn number within (session, task)
for (const r of rows) {
  if (sidPrefix && !r.sessionId.startsWith(sidPrefix)) continue;
  const ts = new Date(typeof r.timestamp === "number" ? r.timestamp : String(r.timestamp));
  if (since && ts < new Date(since)) continue;
  let p;
  try {
    p = JSON.parse(r.payload);
  } catch {
    continue;
  }
  const kind = r.eventType === "ai_assistant_message" ? "task" : "interview";
  let turn = null;
  if (kind === "task") {
    const k = `${r.sessionId}|${r.taskId}`;
    turn = (turnByConversation.get(k) ?? 0) + 1;
    turnByConversation.set(k, turn);
  }
  if (!p?.usage || typeof p.usage !== "object") continue; // mock or scripted: no usage
  const t = tokens(p.usage);
  const model = String(p.model ?? "");
  calls.push({ sid: r.sessionId, version: r.version, kind, taskId: r.taskId, turn, model, t, cost: cost(t, modelPrice(model)) });
}

// ---- Aggregate ----
const sum = (xs, f) => xs.reduce((a, x) => a + (f(x) ?? 0), 0);
const avg = (xs, f) => (xs.length ? sum(xs, f) / xs.length : 0);
const usd = (v, d = 4) => (v === null || v === undefined || Number.isNaN(v) ? "n/a" : `$${v.toFixed(d)}`);
const int = (v) => Math.round(v).toLocaleString("en-US");
const unpriced = [...new Set(calls.filter((c) => c.cost === null).map((c) => c.model))];
const models = [...new Set(calls.map((c) => c.model))];
const total = sum(calls, (c) => c.cost);
const tCalls = calls.filter((c) => c.kind === "task");
const iCalls = calls.filter((c) => c.kind === "interview");
const tokenCols = (xs) => [
  int(sum(xs, (c) => c.t.input)),
  int(sum(xs, (c) => c.t.cachedInput)),
  int(sum(xs, (c) => c.t.output)),
  int(sum(xs, (c) => c.t.reasoning)),
];
const table = (head, body) =>
  [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`, ...body.map((r) => `| ${r.join(" | ")} |`)].join("\n");

const sessions = new Map();
for (const c of calls) {
  if (!sessions.has(c.sid)) sessions.set(c.sid, { sid: c.sid, version: c.version, calls: [] });
  sessions.get(c.sid).calls.push(c);
}
const sessionRows = [...sessions.values()].sort((a, b) => a.version.localeCompare(b.version) || a.sid.localeCompare(b.sid));
const versions = ["none", "standard", "sustainable"];

// Price the same measured tokens with each model in pricing.json (what-if comparison).
const priceAs = (xs, model) => sum(xs, (c) => cost(c.t, pricing.models[model]));

// Conversation-length growth: task-assistant calls by turn number within a task conversation.
const turnBuckets = [
  ["1", (n) => n === 1],
  ["2", (n) => n === 2],
  ["3", (n) => n === 3],
  ["4–5", (n) => n >= 4 && n <= 5],
  ["6–10", (n) => n >= 6 && n <= 10],
  ["11+", (n) => n >= 11],
];
// Linear fit of input tokens on turn (history is capped at 20 messages = 10 prior turns in /api/ai).
function fit(xs) {
  const pts = xs.map((c) => [Math.min(c.turn, 11), c.t.input]);
  const n = pts.length;
  if (n < 2) return null;
  const mx = avg(pts, (p) => p[0]);
  const my = avg(pts, (p) => p[1]);
  const sxx = sum(pts, (p) => (p[0] - mx) ** 2);
  if (sxx === 0) return null;
  const b = sum(pts, (p) => (p[0] - mx) * (p[1] - my)) / sxx;
  return { a: my - b * mx, b };
}
const growth = fit(tCalls);

// ---- Projection ----
const P = { participants: 330, perArm: 110, requests: [30, 60, 120], tasksUsed: 3 };
const followUps = Object.fromEntries(
  versions.map((v) => [v, interviewGuide.questions.filter((q) => !q.versions || q.versions.includes(v)).length]),
);
const avgTok = (xs) => ({
  input: avg(xs, (c) => c.t.input),
  cachedInput: avg(xs, (c) => c.t.cachedInput),
  output: avg(xs, (c) => c.t.output),
  reasoning: avg(xs, (c) => c.t.reasoning),
});
const taskAvg = avgTok(tCalls);
const intAvg = avgTok(iCalls);
const cachedShare = taskAvg.input ? taskAvg.cachedInput / taskAvg.input : 0;
// Length-adjusted per-call input: N requests spread evenly over the 3 required tasks; the input
// grows with the turn (fitted above) until the 20-message history cap (turn 11).
function lengthAdjustedTaskCall(n) {
  if (!growth) return taskAvg;
  const perTask = n / P.tasksUsed;
  let tot = 0;
  for (let k = 1; k <= perTask; k++) tot += Math.max(0, growth.a + growth.b * Math.min(k, 11));
  const input = tot / Math.max(1, Math.floor(perTask));
  return { ...taskAvg, input, cachedInput: input * cachedShare };
}
function projection(model) {
  const price = pricing.models[model];
  const interviewPer = (v) => followUps[v] * (cost(intAvg, price) ?? 0);
  const rows = [];
  for (const n of P.requests) {
    const perCallFlat = cost(taskAvg, price) ?? 0;
    const perCallAdj = cost(lengthAdjustedTaskCall(n), price) ?? 0;
    const aiPart = (perCall) => ({
      none: interviewPer("none"),
      standard: n * perCall + interviewPer("standard"),
      sustainable: n * perCall + interviewPer("sustainable"),
    });
    const flat = aiPart(perCallFlat);
    const adj = aiPart(perCallAdj);
    const totalOf = (x) => P.perArm * (x.none + x.standard + x.sustainable);
    rows.push({ n, flat, adj, totalFlat: totalOf(flat), totalAdj: totalOf(adj) });
  }
  return rows;
}

// ---- Report ----
const today = new Date().toISOString().slice(0, 10);
const scope = [sidPrefix && `sids starting with \`${sidPrefix}\``, since && `since ${since}`].filter(Boolean).join(", ") || "all sessions";
const md = [];
md.push(`# AI cost report`, "");
md.push(
  `Generated ${today} by \`npm run cost-report\` from \`${path.relative(root, dbFile).replace(/\\/g, "/")}\` (${scope}).`,
  `Prices: \`config/pricing.json\` (as of ${pricing.asOf}, **${pricing.verified ? "verified" : "not yet verified against OpenAI's pricing page"}**).`,
  `Models in the data: ${models.map((m) => `\`${m}\``).join(", ") || "none"}.${unpriced.length ? ` **No price for: ${unpriced.join(", ")}** (counted as $0).` : ""}`,
  "",
);
md.push(`## Summary`, "");
md.push(
  table(
    ["", "Calls", "Input tokens", "Cached input", "Output tokens", "Reasoning", "Cost"],
    [
      ["Task assistant", tCalls.length, ...tokenCols(tCalls), usd(sum(tCalls, (c) => c.cost))],
      ["Interview follow-ups", iCalls.length, ...tokenCols(iCalls), usd(sum(iCalls, (c) => c.cost))],
      ["**Total**", calls.length, ...tokenCols(calls), `**${usd(total)}**`],
    ],
  ),
  "",
);
md.push(`## Per call type (averages per call)`, "");
md.push(
  table(
    ["Call type", "Calls", "Avg input", "Avg cached", "Avg output", "Avg reasoning", "Avg cost / call", "Min", "Max"],
    [
      ["Task assistant", tCalls, taskAvg],
      ["Interview follow-up", iCalls, intAvg],
    ].map(([label, xs, a]) => [
      label,
      xs.length,
      int(a.input),
      int(a.cachedInput),
      int(a.output),
      int(a.reasoning),
      usd(avg(xs, (c) => c.cost), 5),
      usd(xs.length ? Math.min(...xs.map((c) => c.cost ?? 0)) : null, 5),
      usd(xs.length ? Math.max(...xs.map((c) => c.cost ?? 0)) : null, 5),
    ]),
  ),
  "",
);
md.push(`## Per version`, "");
md.push(
  table(
    ["Version", "Sessions", "Task calls", "Interview calls", "Total cost", "Avg cost / session", "Avg cost / task call"],
    versions.map((v) => {
      const ss = sessionRows.filter((s) => s.version === v);
      const xs = calls.filter((c) => c.version === v);
      const tx = xs.filter((c) => c.kind === "task");
      return [v, ss.length, tx.length, xs.length - tx.length, usd(sum(xs, (c) => c.cost)), usd(ss.length ? sum(xs, (c) => c.cost) / ss.length : null), usd(tx.length ? avg(tx, (c) => c.cost) : null, 5)];
    }),
  ),
  "",
);
md.push(`## Per session`, "");
md.push(
  table(
    ["sid", "Version", "Task calls", "Interview calls", "Input", "Cached", "Output", "Reasoning", "Cost"],
    sessionRows.map((s) => {
      const tx = s.calls.filter((c) => c.kind === "task");
      return [`\`${s.sid}\``, s.version, tx.length, s.calls.length - tx.length, ...tokenCols(s.calls), usd(sum(s.calls, (c) => c.cost))];
    }),
  ),
  "",
);
md.push(`## Cost growth with conversation length (task assistant)`, "");
md.push(
  "Each request resends the system prompt (brief, task, current draft) plus the earlier turns of that task's conversation (up to 20 messages), so input tokens grow with each turn.",
  "",
);
md.push(
  table(
    ["Turn in task conversation", "Calls", "Avg input", "Avg output", "Avg cost / call"],
    turnBuckets
      .map(([label, test]) => [label, tCalls.filter((c) => test(c.turn))])
      .filter(([, xs]) => xs.length)
      .map(([label, xs]) => [label, xs.length, int(avg(xs, (c) => c.t.input)), int(avg(xs, (c) => c.t.output)), usd(avg(xs, (c) => c.cost), 5)]),
  ),
  "",
  growth
    ? `Linear fit: input ≈ ${int(growth.a)} + ${int(growth.b)} × turn tokens (turns past 11 held flat by the history cap). Measured cached share of input: ${(cachedShare * 100).toFixed(0)}%.`
    : "Not enough task-assistant calls to fit growth.",
  "",
);

md.push(`## Full-study projection`, "");
md.push(
  `${P.participants} participants, ${P.perArm} per arm. \`none\` uses the interview only; \`standard\` and \`sustainable\` use the task assistant plus the interview. Per-participant numbers scale the measured per-call averages above.`,
  "",
);
for (const model of Object.keys(pricing.models)) {
  const rows = projection(model);
  md.push(`### ${model}${model === models[0] ? " (measured model)" : " (same tokens, repriced)"}`, "");
  md.push(
    table(
      ["AI requests / AI-arm participant", "none / participant", "standard / participant", "sustainable / participant", "Study total (flat)", "Study total (length-adjusted)"],
      rows.map((r) => [r.n, usd(r.flat.none), usd(r.flat.standard, 2), usd(r.flat.sustainable, 2), `**${usd(r.totalFlat, 2)}**`, usd(r.totalAdj, 2)]),
    ),
    "",
  );
}
md.push(`### Terra vs Luna`, "");
md.push(
  table(
    ["", ...Object.keys(pricing.models)],
    [
      ["Measured calls, repriced", ...Object.keys(pricing.models).map((m) => usd(priceAs(calls, m)))],
      ["Avg task call", ...Object.keys(pricing.models).map((m) => usd(cost(taskAvg, pricing.models[m]), 5))],
      ["Avg interview follow-up", ...Object.keys(pricing.models).map((m) => usd(cost(intAvg, pricing.models[m]), 5))],
      ...P.requests.map((n) => [
        `Study total at ${n} requests (flat)`,
        ...Object.keys(pricing.models).map((m) => usd(projection(m).find((r) => r.n === n).totalFlat, 2)),
      ]),
    ],
  ),
  "",
  "Luna figures reprice the tokens Terra used. A different model may write longer or shorter replies, so test Luna directly before relying on them.",
  "",
);
md.push(`## Assumptions`, "");
md.push(
  [
    `- Prices are from \`config/pricing.json\` (as of ${pricing.asOf}) and ${pricing.verified ? "were verified" : "**have not been verified**"} against OpenAI's pricing page.`,
    "- Cost = (input − cached) × input price + cached × cached-input price + output × output price. Reasoning tokens are part of `completion_tokens` and billed as output. `cache_write_tokens`, if reported, is billed at the normal input price (no surcharge assumed).",
    "- Only successful replies with logged `usage` are counted. Failed calls (`ai_error`, `interview_error`), mock replies and scripted interview lines have no usage and cost $0 here; OpenAI may still bill a failed call's input.",
    `- Projection, flat: N requests × the measured average task-call cost, plus interview follow-ups (none ${followUps.none}, standard ${followUps.standard}, sustainable ${followUps.sustainable} per participant, from \`config/interview.json\`) × the measured average follow-up cost.`,
    `- Projection, length-adjusted: N requests split evenly over the ${P.tasksUsed} required tasks; input per call follows the fitted growth by turn, capped at the 20-message history limit, with the measured cached share. Longer conversations than the pilot's make this the better guide at 60–120 requests.`,
    "- Drafts are assumed to be about as long as in the measured sessions; the system prompt includes the current draft, so longer drafts raise input cost.",
    "- Both AI arms are assumed to use the same number of requests. Real usage will differ by arm and by person.",
    "- No allowance for retries, testing, piloting or price changes. Add a margin.",
  ].join("\n"),
  "",
);

const text = md.join("\n");
if (!flag("no-write")) {
  mkdirSync(path.dirname(outFile), { recursive: true });
  writeFileSync(outFile, text);
}

// ---- Console summary ----
console.log(`[cost-report] ${path.relative(root, dbFile)} (${scope}): ${calls.length} AI calls with usage (${tCalls.length} task, ${iCalls.length} interview), ${sessionRows.length} sessions.`);
console.log(`[cost-report] Total ${usd(total)}. Avg task call ${usd(avg(tCalls, (c) => c.cost), 5)}, avg interview follow-up ${usd(avg(iCalls, (c) => c.cost), 5)}.`);
for (const v of versions) {
  const ss = sessionRows.filter((s) => s.version === v);
  if (ss.length) console.log(`[cost-report]   ${v}: ${ss.length} sessions, avg ${usd(sum(calls.filter((c) => c.version === v), (c) => c.cost) / ss.length)} / session`);
}
for (const model of Object.keys(pricing.models)) {
  console.log(`[cost-report] Study projection (${model}): ${projection(model).map((r) => `${r.n} req → ${usd(r.totalFlat, 2)}`).join(", ")}`);
}
if (unpriced.length) console.log(`[cost-report] WARNING: no price for ${unpriced.join(", ")}.`);
if (!pricing.verified) console.log("[cost-report] Prices in config/pricing.json are not verified yet; check OpenAI's pricing page.");
if (!flag("no-write")) console.log(`[cost-report] Wrote ${path.relative(root, outFile)}`);
