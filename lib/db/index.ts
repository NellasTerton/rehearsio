import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";

import * as schema from "./schema";

// Neon's HTTP driver rather than a TCP pool: serverless functions get frozen
// and recycled between invocations, so a pooled TCP connection is either
// wasted or actively harmful there. HTTP has no connection to keep alive.
//
// The client is built eagerly (Auth.js's Drizzle adapter inspects this object
// at import time to work out the dialect, so it cannot be a lazy proxy), but
// a missing connection string must NOT throw here: Next imports every route
// handler while building, before any runtime env var exists, so throwing
// would fail the whole production build instead of the one request that
// actually needs the database. Fall back to a syntactically valid placeholder
// and let the failure surface on the query instead.
const PLACEHOLDER = "postgresql://unset:unset@unset.neon.tech/unset";

const connectionString =
  process.env.DATABASE_URL ?? process.env.NEON_DATABASE_URL ?? PLACEHOLDER;

if (connectionString === PLACEHOLDER && process.env.NEXT_PHASE !== "phase-production-build") {
  // Visible in the server log the first time this module loads without
  // configuration, rather than only as a confusing query error later.
  console.warn("[db] DATABASE_URL (or NEON_DATABASE_URL) is not set — database calls will fail.");
}

export const db = drizzle(neon(connectionString), { schema });
