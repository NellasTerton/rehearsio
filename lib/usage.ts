import { and, eq, gte, sql } from "drizzle-orm";

import { db } from "./db";
import { interviewRuns } from "./db/schema";

// Free-tier allowances. Anonymous is deliberately tiny — it's a taste, not a
// product, and it's the only tier that can be reset by clearing cookies.
export const ANON_TOTAL_RUNS = 1;
export const FREE_RUNS_PER_DAY = 1;

export const VISITOR_COOKIE = "rehearsio_visitor";

export type UsageTier = "anonymous" | "free" | "subscriber";

export interface UsageState {
  tier: UsageTier;
  allowed: boolean;
  used: number;
  limit: number | null; // null = unlimited
}

function startOfTodayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

async function countRuns(where: Parameters<typeof db.select>[0] extends never ? never : any) {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(interviewRuns)
    .where(where);
  return row?.n ?? 0;
}

/**
 * Reports what the caller is allowed to do, without recording anything.
 * Recording happens separately in recordRun(), so merely opening the page
 * doesn't burn someone's single free interview.
 */
export async function getUsage(opts: {
  userId: string | null;
  visitorId: string | null;
  hasSubscription: boolean;
}): Promise<UsageState> {
  if (opts.hasSubscription) {
    return { tier: "subscriber", allowed: true, used: 0, limit: null };
  }

  if (opts.userId) {
    const used = await countRuns(
      and(eq(interviewRuns.userId, opts.userId), gte(interviewRuns.createdAt, startOfTodayUtc()))
    );
    return {
      tier: "free",
      allowed: used < FREE_RUNS_PER_DAY,
      used,
      limit: FREE_RUNS_PER_DAY,
    };
  }

  if (!opts.visitorId) {
    // No cookie yet — this is a first-time visitor, so they still have their
    // single run. The cookie gets set when they actually start.
    return { tier: "anonymous", allowed: true, used: 0, limit: ANON_TOTAL_RUNS };
  }

  const used = await countRuns(eq(interviewRuns.visitorId, opts.visitorId));
  return {
    tier: "anonymous",
    allowed: used < ANON_TOTAL_RUNS,
    used,
    limit: ANON_TOTAL_RUNS,
  };
}

export async function recordRun(opts: { userId: string | null; visitorId: string | null }) {
  await db.insert(interviewRuns).values({
    userId: opts.userId,
    visitorId: opts.userId ? null : opts.visitorId,
  });
}
