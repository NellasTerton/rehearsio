import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { getStripe, getStripePriceId } from "@/lib/stripe";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Sign in required", { status: 401 });
  }
  const priceId = getStripePriceId();
  if (!priceId) {
    return new Response("STRIPE_PRICE_ID is not configured", { status: 500 });
  }

  const [user] = await db.select().from(users).where(eq(users.id, session.user.id)).limit(1);
  if (!user) {
    return new Response("User not found", { status: 404 });
  }

  // Reuse the Stripe customer across checkouts so a returning subscriber
  // doesn't accumulate duplicate customer records (which would then split
  // their billing history and break the portal).
  let customerId = user.stripeCustomerId;
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: user.email ?? undefined,
      metadata: { userId: user.id },
    });
    customerId = customer.id;
    await db.update(users).set({ stripeCustomerId: customerId }).where(eq(users.id, user.id));
  }

  const origin = new URL(req.url).origin;

  try {
    const checkout = await getStripe().checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancelled`,
      // Belt and braces: the webhook resolves the user via the customer
      // record, but stamping the id on the subscription too means a support
      // question ("who does this subscription belong to?") is answerable
      // from the Stripe dashboard alone.
      subscription_data: { metadata: { userId: user.id } },
    });

    if (!checkout.url) {
      return new Response("Stripe did not return a checkout URL", { status: 502 });
    }
    return Response.json({ url: checkout.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown Stripe error";
    return new Response(message, { status: 502 });
  }
}
