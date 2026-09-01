import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

/**
 * Hands the user to Stripe's own billing portal to cancel, change card, or
 * download invoices. Using the hosted portal rather than building those
 * screens means none of that flow — including cancellation — is ours to get
 * wrong.
 */
export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Sign in required", { status: 401 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user?.stripeCustomerId) {
    return new Response("No billing account for this user", { status: 404 });
  }

  const origin = new URL(req.url).origin;

  try {
    const portal = await getStripe().billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: origin,
    });
    return Response.json({ url: portal.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Stripe error";
    return new Response(message, { status: 502 });
  }
}
