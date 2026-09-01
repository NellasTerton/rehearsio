import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { checkChatRateLimit, getClientIp } from "@/lib/rate-limit";

export const runtime = "nodejs";

const MIN_PASSWORD = 8;
const MAX_PASSWORD = 200;
const MAX_EMAIL = 254;

export async function POST(req: Request) {
  // Registration is a write endpoint open to the internet — rate limit it or
  // it becomes a free way to fill the database.
  const limit = await checkChatRateLimit(getClientIp(req));
  if (!limit.success) {
    return new Response("Too many requests, please slow down", {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec) },
    });
  }

  let body: { email?: string; password?: string; name?: string };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 100) : "";

  if (!email || email.length > MAX_EMAIL || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return Response.json({ error: "invalid_email" }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD || password.length > MAX_PASSWORD) {
    return Response.json({ error: "weak_password" }, { status: 400 });
  }

  const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (existing) {
    // An account already exists. If it was created through Google it has no
    // password — attach one so the same person can also sign in with a
    // password, rather than creating a second account for the same email.
    if (!existing.passwordHash) {
      const passwordHash = await bcrypt.hash(password, 12);
      await db.update(users).set({ passwordHash }).where(eq(users.id, existing.id));
      return Response.json({ ok: true, linked: true });
    }
    return Response.json({ error: "already_registered" }, { status: 409 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  await db.insert(users).values({
    email,
    name: name || null,
    passwordHash,
  });

  return Response.json({ ok: true });
}
