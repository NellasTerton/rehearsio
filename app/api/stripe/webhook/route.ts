import { eq } from "drizzle-orm";
import type Stripe from "stripe";

import { db } from "@/lib/db";
import { processedStripeEvents, users } from "@/lib/db/schema";
import { getStripe } from "@/lib/stripe";

export const runtime = "nodejs";

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// Only the events that actually change entitlement. Ignoring everything else
// keeps the handler from doing work (and from failing) on the long tail of
// events Stripe sends.
const HANDLED = new Set([
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
]);

function periodEndOf(subscription: Stripe.Subscription): Date | null {
  // current_period_end moved onto the subscription item in recent API
  // versions; read whichever this account's version provides rather than
  // assuming, so the field can't silently come back undefined.
  const legacy = (subscription as unknown as { current_period_end?: number }).current_period_end;
  const fromItem = subscription.items?.data?.[0]?.current_period_end;
  const unix = legacy ?? fromItem;
  return typeof unix === "number" ? new Date(unix * 1000) : null;
}

async function applySubscription(subscription: Stripe.Subscription) {
  const customerId =
    typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;

  await db
    .update(users)
    .set({
      stripeSubscriptionId: subscription.id,
      stripeSubscriptionStatus: subscription.status,
      stripeCurrentPeriodEnd: periodEndOf(subscription),
    })
    .where(eq(users.stripeCustomerId, customerId));
}

export async function POST(req: Request) {
  if (!WEBHOOK_SECRET) {
    return new Response("STRIPE_WEBHOOK_SECRET is not configured", { status: 500 });
  }

  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return new Response("Missing stripe-signature header", { status: 400 });
  }

  // Signature verification runs on the RAW body — parsing it first would
  // change the bytes and the check would fail. This is the only thing
  // stopping anyone from POSTing a fake "subscription active" event and
  // granting themselves the paid feature, so it must never be skipped.
  const rawBody = await req.text();

  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(rawBody, signature, WEBHOOK_SECRET);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid signature";
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  if (!HANDLED.has(event.type)) {
    return new Response("ignored", { status: 200 });
  }

  // Stripe retries on any non-2xx and can deliver the same event twice.
  // Claim the event id first; if it's already there, this is a replay.
  const claimed = await db
    .insert(processedStripeEvents)
    .values({ id: event.id })
    .onConflictDoNothing()
    .returning({ id: processedStripeEvents.id });

  if (claimed.length === 0) {
    return new Response("already processed", { status: 200 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.subscription) {
          const subscriptionId =
            typeof session.subscription === "string"
              ? session.subscription
              : session.subscription.id;
          // The checkout session itself doesn't carry the subscription's
          // status or period end — fetch the real subscription.
          const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
          await applySubscription(subscription);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        await applySubscription(event.data.object);
        break;
      }
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    // Roll back the idempotency claim, otherwise Stripe's retry would be
    // swallowed as "already processed" and the failure would be permanent.
    await db.delete(processedStripeEvents).where(eq(processedStripeEvents.id, event.id));
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(`Webhook handler failed: ${message}`, { status: 500 });
  }
}
