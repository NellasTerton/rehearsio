import { eq } from "drizzle-orm";

import { auth } from "@/lib/auth";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { checkChatRateLimit, getClientIp } from "@/lib/rate-limit";
import { hasActiveSubscription } from "@/lib/subscription";
import { TTS_INSTRUCTIONS, TTS_MODEL, pickVoice } from "@/lib/tts";
import type { Lang } from "@/lib/types";

export const runtime = "nodejs";

// One spoken turn. Well above the longest interviewer line measured in
// testing (260 chars) while still bounding what a single request can cost.
const MAX_TEXT_CHARS = 1200;

export async function POST(req: Request) {
  // Rate limit first: this endpoint costs real money per call, so the check
  // must happen before any work, including the database lookup.
  const limit = await checkChatRateLimit(getClientIp(req));
  if (!limit.success) {
    return new Response("Too many requests, please slow down", {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec) },
    });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new Response("Sign in required", { status: 401 });
  }

  // Entitlement is read fresh from the database on every request rather than
  // trusted from the session — a subscription cancelled five minutes ago must
  // stop working now, not whenever the session happens to expire.
  const [user] = await db
    .select({
      stripeSubscriptionStatus: users.stripeSubscriptionStatus,
      stripeCurrentPeriodEnd: users.stripeCurrentPeriodEnd,
    })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);

  if (!hasActiveSubscription(user)) {
    // 402 rather than 403: the client uses this exact code to fall back to
    // the free browser voice instead of showing an error.
    return new Response("Subscription required", { status: 402 });
  }

  let body: { text?: string; lang?: Lang };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const text = typeof body.text === "string" ? body.text.trim() : "";
  if (!text) {
    return new Response("text is required", { status: 400 });
  }
  if (text.length > MAX_TEXT_CHARS) {
    return new Response("Text is too long", { status: 413 });
  }

  const lang: Lang = body.lang === "en" ? "en" : "ru";
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return new Response("OPENAI_API_KEY is not set on the server", { status: 500 });
  }

  try {
    const upstream = await fetch("https://api.openai.com/v1/audio/speech", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: TTS_MODEL,
        voice: pickVoice(lang),
        input: text,
        instructions: TTS_INSTRUCTIONS[lang],
        // mp3 rather than wav: roughly a tenth the bytes over the wire for
        // the same spoken line, which matters because the candidate is
        // waiting on this audio before the call can continue.
        response_format: "mp3",
      }),
    });

    if (!upstream.ok || !upstream.body) {
      const errText = await upstream.text().catch(() => "");
      return new Response(`TTS provider error ${upstream.status}: ${errText.slice(0, 300)}`, {
        status: 502,
      });
    }

    // Stream straight through so playback can start before the whole file
    // has been generated.
    return new Response(upstream.body, {
      headers: {
        "Content-Type": "audio/mpeg",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 502 });
  }
}
