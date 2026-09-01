import { eq } from "drizzle-orm";
import { cookies } from "next/headers";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hasActiveSubscription } from "@/lib/subscription";
import { VISITOR_COOKIE, getUsage, recordRun } from "@/lib/usage";

export const runtime = "nodejs";

async function resolveCaller() {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const visitorId = cookies().get(VISITOR_COOKIE)?.value ?? null;

  let hasSubscription = false;
  if (userId) {
    const [user] = await db
      .select({
        stripeSubscriptionStatus: users.stripeSubscriptionStatus,
        stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
      })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    hasSubscription = hasActiveSubscription(user);
  }

  return { userId, visitorId, hasSubscription };
}

/** Read-only: what the caller is allowed to do right now. Records nothing. */
export async function GET() {
  const caller = await resolveCaller();
  const usage = await getUsage(caller);
  return Response.json(usage);
}

/**
 * Claims one interview run. Called when a call actually starts, not when the
 * page loads — otherwise merely visiting would burn the single free run.
 */
export async function POST() {
  const caller = await resolveCaller();
  const usage = await getUsage(caller);

  if (!usage.allowed) {
    return Response.json(usage, { status: 402 });
  }

  // Mint a visitor id on first anonymous start so the allowance can be
  // tracked at all. httpOnly: the client never needs to read it, and not
  // exposing it to scripts makes it marginally harder to tamper with.
  let visitorId = caller.visitorId;
  const res = Response.json({ ...usage, used: usage.used + 1 });
  if (!caller.userId && !visitorId) {
    visitorId = crypto.randomUUID();
    cookies().set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  await recordRun({ userId: caller.userId, visitorId });
  return res;
}
