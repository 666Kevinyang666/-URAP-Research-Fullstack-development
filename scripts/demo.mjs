#!/usr/bin/env node
// npm run demo: build the app, start it on port 3000 against a separate demo database
// (demo.db), and share it through a free Cloudflare quick tunnel (no account needed).
// Ctrl+C stops both the app and the tunnel. Works on Windows (Git Bash, PowerShell), macOS, Linux.
//
// Needs DEMO_PASSWORD and ADMIN_PASSWORD in .env (never committed). DEMO_TIME_SCALE defaults
// to 0.05 (60 minutes -> 3 minutes) unless set in the environment or .env.

import { spawn, spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = 3000;
const isWindows = process.platform === "win32";

function fail(message) {
  console.error(`\n[demo] ${message}\n`);
  process.exit(1);
}

// ---- 1. Check .env ----
const envPath = path.join(root, ".env");
if (!existsSync(envPath)) fail("No .env file. Copy .env.example to .env and set DEMO_PASSWORD and ADMIN_PASSWORD.");
const { parse } = await import("dotenv");
const fileEnv = parse(readFileSync(envPath));
const setting = (name) => (process.env[name] ?? fileEnv[name] ?? "").trim();
const missing = ["DEMO_PASSWORD", "ADMIN_PASSWORD"].filter((n) => !setting(n));
if (missing.length) {
  fail(
    `${missing.join(" and ")} ${missing.length > 1 ? "are" : "is"} not set. Add ${missing
      .map((n) => `${n}=<a password>`)
      .join(" and ")} to .env (it is gitignored), then run npm run demo again.`,
  );
}

const env = {
  ...process.env,
  DATABASE_URL: "file:./demo.db", // separate from dev.db; delete with npm run demo:reset
  DEMO_TIME_SCALE: setting("DEMO_TIME_SCALE") || "0.05",
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
};

const bin = (pkg, rel) => path.join(root, "node_modules", pkg, rel);
const run = (label, args) => {
  console.log(`[demo] ${label}...`);
  const r = spawnSync(process.execPath, args, { cwd: root, env, stdio: "inherit" });
  if (r.status !== 0) fail(`${label} failed (exit ${r.status}).`);
};

const portFree = () =>
  new Promise((resolve) => {
    const s = net.createServer().once("error", () => resolve(false));
    s.once("listening", () => s.close(() => resolve(true))).listen(PORT);
  });
if (!(await portFree())) fail(`Port ${PORT} is already in use. Stop the other server (e.g. npm run dev) first.`);

// ---- 2. Build and migrate ----
const prisma = bin("prisma", "build/index.js");
const next = bin("next", "dist/bin/next");
run("Generating the Prisma client", [prisma, "generate"]);
run("Applying migrations to demo.db", [prisma, "migrate", "deploy"]);
run("Building the app (production)", [next, "build"]);

// ---- 3. Start the app and the tunnel ----
const children = [];
function start(label, command, args, opts = {}) {
  const child = spawn(command, args, {
    cwd: root,
    env,
    stdio: ["ignore", "pipe", "pipe"],
    detached: !isWindows, // own process group on macOS/Linux, so the whole tree can be stopped
    windowsHide: true,
    ...opts,
  });
  children.push(child);
  child.on("exit", (code) => {
    if (!shuttingDown) {
      console.error(`\n[demo] ${label} stopped unexpectedly (exit ${code}).`);
      shutdown(1);
    }
  });
  return child;
}

let shuttingDown = false;
function killTree(child) {
  if (child.exitCode !== null || child.pid === undefined) return;
  try {
    if (isWindows) spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else process.kill(-child.pid, "SIGTERM");
  } catch {
    // Already gone.
  }
}
function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log("\n[demo] Stopping the app and the tunnel...");
  children.forEach(killTree);
  console.log("[demo] Stopped. The tunnel link no longer works.");
  process.exit(code);
}
process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));
process.on("SIGHUP", () => shutdown(0));

console.log(`[demo] Starting the app on http://localhost:${PORT} (DEMO_TIME_SCALE=${env.DEMO_TIME_SCALE})...`);
const app = start("The app", process.execPath, [next, "start", "-p", String(PORT)]);
app.stdout.on("data", (d) => process.env.DEMO_VERBOSE && process.stdout.write(d));
app.stderr.on("data", (d) => process.stderr.write(d));

// Wait until the app answers (401 = up and password-protected).
for (let i = 0; ; i++) {
  try {
    await fetch(`http://localhost:${PORT}/`);
    break;
  } catch {
    if (i > 120) fail("The app didn't start within 60 seconds.");
    await new Promise((r) => setTimeout(r, 500));
  }
}

console.log("[demo] Starting a Cloudflare quick tunnel (first run downloads cloudflared)...");
const npx = isWindows ? "npx.cmd" : "npx";
const tunnel = start("The tunnel", npx, ["--yes", "cloudflared", "tunnel", "--no-autoupdate", "--url", `http://localhost:${PORT}`], {
  shell: isWindows, // .cmd files need a shell on Windows
});

let announced = false;
const onTunnelOutput = (data) => {
  const text = data.toString();
  if (process.env.DEMO_VERBOSE) process.stderr.write(text);
  const match = text.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
  if (match && !announced) {
    announced = true;
    const url = match[0];
    console.log(`
============================================================
  Demo is running.

  Study link (share with the password):  ${url}
  Admin (create session links, export):  ${url}/admin
  Local:                                  http://localhost:${PORT}/admin

  Passwords are in .env (DEMO_PASSWORD for participants, ADMIN_PASSWORD
  for /admin). Any username works.
  Session clock speed: DEMO_TIME_SCALE=${env.DEMO_TIME_SCALE}

  The link works only while this command runs. Press Ctrl+C to stop.
  A new run gives a new link. npm run demo:reset clears demo data.
============================================================
`);
  }
};
tunnel.stdout.on("data", onTunnelOutput);
tunnel.stderr.on("data", onTunnelOutput);
setTimeout(() => {
  if (!announced) console.error("[demo] Still waiting for the tunnel link... (set DEMO_VERBOSE=1 to see cloudflared output)");
}, 45_000);
