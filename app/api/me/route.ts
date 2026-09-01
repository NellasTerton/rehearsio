import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { hasActiveSubscription } from "@/lib/subscription";

export const runtime = "nodejs";

/**
 * Account state for the UI: who is signed in and whether they're entitled to
 * the premium voice. Subscription status deliberately lives here rather than
 * in the session token, so cancelling takes effect immediately instead of
 * whenever the session happens to be reissued.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ signedIn: false, hasSubscription: false });
  }

  const [user] = await db
    .select({
      email: users.email,
      stripeCustomerId: users.stripeCustomerId,
      stripeSubscriptionStatus: users.stripeSubscriptionStatus,
      stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  return Response.json({
    signedIn: true,
    email: user?.email ?? session.user.email ?? null,
    hasSubscription: hasActiveSubscription(user),
    // Drives whether the UI offers "manage subscription" (Stripe portal) at
    // all — someone who never checked out has no billing account to manage.
    hasBillingAccount: Boolean(user?.stripeCustomerId),
  });
}
