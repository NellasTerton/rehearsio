import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

export interface LimitResult {
  success: boolean;
  /** Seconds until the caller may retry. Only meaningful when success is false. */
  retryAfterSec: number;
}

// Real per-IP throttling needs a store shared across serverless invocations —
// plain in-process memory resets on every cold start and isn't shared between
// concurrent instances, so it can't stop someone hammering the API from a
// script. Upstash Redis (REST-based, works from serverless/edge) is the
// production backend; see .env.example for the two env vars it needs.
//
// Locally, and in production before those env vars are set, we fall back to
// an in-process fixed-window counter. It only limits a single long-lived
// process (exactly what `next dev` is, and also good enough to not be
// literally wide open if someone deploys before wiring up Upstash), so it's
// a safety net, not the real defense — the real defense is Upstash.
const upstashConfigured =
  !!process.env.UPSTASH_REDIS_REST_URL && !!process.env.UPSTASH_REDIS_REST_TOKEN;

const redis = upstashConfigured ? Redis.fromEnv() : null;

function makeUpstashLimiter(limit: number, windowSec: number) {
  return new Ratelimit({
    redis: redis!,
    limiter: Ratelimit.slidingWindow(limit, `${windowSec} s`),
    analytics: false,
  });
}

class MemoryLimiter {
  private hits = new Map<string, { count: number; windowStart: number }>();
  private readonly windowMs: number;

  constructor(private limit: number, windowSec: number) {
    this.windowMs = windowSec * 1000;
    // Keep the map from growing forever on a long-lived process — sweep out
    // anything whose window has lapsed every few minutes.
    const timer = setInterval(() => this.sweep(), 5 * 60 * 1000);
    // Don't hold the process open just for this timer (matters for scripts/tests).
    if (typeof timer.unref === "function") timer.unref();
  }

  private sweep() {
    const now = Date.now();
    for (const [key, entry] of this.hits) {
      if (now - entry.windowStart >= this.windowMs) this.hits.delete(key);
    }
  }

  check(key: string): LimitResult {
    const now = Date.now();
    const entry = this.hits.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.hits.set(key, { count: 1, windowStart: now });
      return { success: true, retryAfterSec: 0 };
    }
    entry.count++;
    if (entry.count > this.limit) {
      const retryAfterSec = Math.ceil((this.windowMs - (now - entry.windowStart)) / 1000);
      return { success: false, retryAfterSec };
    }
    return { success: true, retryAfterSec: 0 };
  }
}

// Limits are per IP. Chat is called once per spoken turn (~8 turns per full
// interview), summary once per finished interview — chat's ceiling is set
// well above a single legitimate interview (including retries after a
// network hiccup) but low enough to bound a scripted burst.
const CHAT_LIMIT = 30;
const CHAT_WINDOW_SEC = 600; // 10 min
const SUMMARY_LIMIT = 10;
const SUMMARY_WINDOW_SEC = 600;

const chatUpstash = upstashConfigured ? makeUpstashLimiter(CHAT_LIMIT, CHAT_WINDOW_SEC) : null;
const summaryUpstash = upstashConfigured
  ? makeUpstashLimiter(SUMMARY_LIMIT, SUMMARY_WINDOW_SEC)
  : null;
const chatMemory = new MemoryLimiter(CHAT_LIMIT, CHAT_WINDOW_SEC);
const summaryMemory = new MemoryLimiter(SUMMARY_LIMIT, SUMMARY_WINDOW_SEC);

/**
 * Extracts the caller's IP from standard proxy headers. Vercel (and most
 * proxies) set x-forwarded-for; Vercel also sets x-real-ip. Falls back to a
 * shared bucket if neither is present (e.g. some local setups) — that
 * degrades to "everyone shares one limit" rather than "no limit at all".
 */
export function getClientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  if (real) return real.trim();
  return "unknown";
}

export async function checkChatRateLimit(ip: string): Promise<LimitResult> {
  if (chatUpstash) {
    const { success, reset } = await chatUpstash.limit(ip);
    return { success, retryAfterSec: success ? 0 : Math.ceil((reset - Date.now()) / 1000) };
  }
  return chatMemory.check(ip);
}

export async function checkSummaryRateLimit(ip: string): Promise<LimitResult> {
  if (summaryUpstash) {
    const { success, reset } = await summaryUpstash.limit(ip);
    return { success, retryAfterSec: success ? 0 : Math.ceil((reset - Date.now()) / 1000) };
  }
  return summaryMemory.check(ip);
}
