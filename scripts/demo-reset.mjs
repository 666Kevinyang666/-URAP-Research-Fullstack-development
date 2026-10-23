#!/usr/bin/env node
// npm run demo:reset: delete the demo database (demo.db) so the next npm run demo starts fresh.
// Doesn't touch dev.db. Stop npm run demo first.

import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const files = ["demo.db", "demo.db-journal", "demo.db-wal", "demo.db-shm"].map((f) => path.join(root, f));
const existing = files.filter((f) => existsSync(f));

try {
  existing.forEach((f) => rmSync(f));
} catch (e) {
  console.error(`[demo:reset] Couldn't delete the demo database (${e.code}). Stop npm run demo first, then try again.`);
  process.exit(1);
}
console.log(existing.length ? "[demo:reset] Deleted demo.db. The next npm run demo starts with no sessions." : "[demo:reset] No demo.db to delete.");
