/**
 * Single place that decides whether a user is entitled to the premium voice.
 * Every gate (API routes, UI) must call this rather than testing the status
 * string itself, so "what counts as paid" can never drift between callers.
 */

// Statuses Stripe considers a live, paid-for subscription. "past_due" is
// deliberately included: the renewal charge failed but Stripe is still
// retrying, and cutting someone off mid-retry over a temporarily declined
// card is a good way to lose a paying customer. "canceled"/"unpaid" are not
// here — but see the period-end check below, which keeps a cancelled
// subscription usable until the paid period actually runs out.
const ENTITLING_STATUSES = new Set(["active", "trialing", "past_due"]);

export interface SubscriptionFields {
  stripeSubscriptionStatus: string | null;
  stripeCurrentPeriodEnd: Date | null;
}

export function hasActiveSubscription(user: SubscriptionFields | null | undefined): boolean {
  if (!user?.stripeSubscriptionStatus) return false;

  if (ENTITLING_STATUSES.has(user.stripeSubscriptionStatus)) return true;

  // Cancelled but already paid through to a future date — they keep what
  // they bought until it lapses.
  if (
    user.stripeSubscriptionStatus === "canceled" &&
    user.stripeCurrentPeriodEnd &&
    user.stripeCurrentPeriodEnd.getTime() > Date.now()
  ) {
    return true;
  }

  return false;
}
