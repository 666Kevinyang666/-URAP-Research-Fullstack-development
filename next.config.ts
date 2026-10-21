import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Native SQLite driver must not be bundled.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  // Session-clock speed-up for demos (see src/lib/timing.ts). Inlined into server and browser
  // code at build / dev start, so the browser's break and peer check-in timers use it too.
  env: { DEMO_TIME_SCALE: process.env.DEMO_TIME_SCALE ?? "" },
};

export default nextConfig;
