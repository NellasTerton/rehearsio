import { index, integer, pgTable, primaryKey, text, timestamp } from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

// The four tables below are the shape Auth.js's Drizzle adapter expects —
// column names and types are dictated by the adapter, not by us, so don't
// rename them. The subscription columns on `users` are our own addition:
// Stripe stays the source of truth for billing, but we mirror the current
// status here so a call can check entitlement with one local query instead of
// a round-trip to Stripe on every spoken turn.
export const users = pgTable("user", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("emailVerified", { mode: "date" }),
  image: text("image"),
  // Null for accounts created through Google — those have no password to
  // store, and storing one would be a liability with no benefit.
  passwordHash: text("passwordHash"),

  // Mirrored from Stripe via the webhook. Null until the user starts a
  // checkout for the first time.
  stripeCustomerId: text("stripeCustomerId").unique(),
  stripeSubscriptionId: text("stripeSubscriptionId"),
  // Raw Stripe status string ("active", "trialing", "past_due", "canceled"…).
  // Kept as text rather than an enum so a new Stripe status can never break
  // a write — entitlement is decided in code, see lib/subscription.ts.
  stripeSubscriptionStatus: text("stripeSubscriptionStatus"),
  // When the paid period ends. A subscription the user has cancelled stays
  // usable until this moment, which is what they paid for.
  stripeCurrentPeriodEnd: timestamp("stripeCurrentPeriodEnd", { mode: "date" }),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("providerAccountId").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (account) => ({
    compoundKey: primaryKey({
      columns: [account.provider, account.providerAccountId],
    }),
  })
);

export const sessions = pgTable(
  "session",
  {
    sessionToken: text("sessionToken").primaryKey(),
    userId: text("userId")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (session) => ({
    userIdIdx: index("session_userId_idx").on(session.userId),
  })
);

export const verificationTokens = pgTable(
  "verificationToken",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (vt) => ({
    compoundKey: primaryKey({ columns: [vt.identifier, vt.token] }),
  })
);

// Stripe delivers webhooks at least once, not exactly once — the same event
// can arrive twice (retries after a timeout, or a genuine duplicate). Writing
// the event id here inside the same transaction as the subscription update
// makes replays a no-op instead of double-applying.
export const processedStripeEvents = pgTable("processed_stripe_event", {
  id: text("id").primaryKey(),
  processedAt: timestamp("processedAt", { mode: "date" }).notNull().defaultNow(),
});

// One row per completed interview start. Drives the free-tier limits:
// anonymous visitors get a single run ever, signed-in users one per day,
// subscribers unlimited. Rows are keyed by userId when known and by an
// opaque visitor cookie otherwise.
export const interviewRuns = pgTable(
  "interview_run",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    userId: text("userId").references(() => users.id, { onDelete: "cascade" }),
    // Set for anonymous runs: a random id we put in a cookie. Clearing
    // cookies resets it — that's inherent to not requiring an account, and
    // why the anonymous allowance is deliberately tiny.
    visitorId: text("visitorId"),
    createdAt: timestamp("createdAt", { mode: "date" }).notNull().defaultNow(),
  },
  (run) => ({
    userIdx: index("interview_run_userId_idx").on(run.userId),
    visitorIdx: index("interview_run_visitorId_idx").on(run.visitorId),
  })
);
