import Stripe from "stripe";

// Lazily constructed for the same reason as the database client: the
// production build imports these modules with no runtime env vars present,
// so throwing here would break the build rather than the one request that
// actually needs Stripe.
let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const apiKey = process.env.STRIPE_API_KEY;
  if (!apiKey) {
    throw new Error("STRIPE_API_KEY is not set — see .env.example");
  }
  // No explicit apiVersion: this SDK release pins its own (see
  // node_modules/stripe/OPENAPI_VERSION), so hardcoding the string would only
  // add a second place to update, and a type error, on every SDK upgrade.
  cached = new Stripe(apiKey, { typescript: true });
  return cached;
}

export function getStripePriceId(): string {
  return process.env.STRIPE_PRICE_ID ?? "";
}
