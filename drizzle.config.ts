import { readFileSync } from "node:fs";

import type { Config } from "drizzle-kit";

// Next.js loads .env.local automatically, but drizzle-kit runs outside Next
// and does not — without this the CLI sees no DATABASE_URL and fails.
function loadEnvLocal() {
  let text: string;
  try {
    text = readFileSync(".env.local", "utf8");
  } catch {
    return;
  }
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!process.env[key]) process.env[key] = trimmed.slice(eq + 1).trim();
  }
}
loadEnvLocal();

const url = process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL;
if (!url) {
  throw new Error("DATABASE_URL (or NEON_DATABASE_URL) is not set in .env.local");
}

export default {
  schema: "./lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url },
} satisfies Config;
