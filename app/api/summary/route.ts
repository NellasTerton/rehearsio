import { streamGroqCompletion } from "@/lib/groq";
import { buildSummarySystemPrompt } from "@/lib/prompts";
import { checkSummaryRateLimit, getClientIp } from "@/lib/rate-limit";
import type { ChatMessage, Lang } from "@/lib/types";

export const runtime = "nodejs";

const ROLE_LABEL: Record<Lang, { interviewer: string; candidate: string; intro: string }> = {
  ru: { interviewer: "Интервьюер", candidate: "Кандидат", intro: "Транскрипт собеседования:" },
  en: { interviewer: "Interviewer", candidate: "Candidate", intro: "Interview transcript:" },
};

// This endpoint is reachable directly (not only after a real interview), so it
// needs its own ceiling — matching MAX_MESSAGE_CHARS / MAX_MESSAGES in
// app/api/chat/route.ts rather than trusting that a transcript only ever
// arrives via the normal call flow.
const MAX_MESSAGE_CHARS = 4000;
const MAX_MESSAGES = 40;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = await checkSummaryRateLimit(ip);
  if (!limit.success) {
    return new Response("Too many requests, please slow down", {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec) },
    });
  }

  let body: { transcript?: ChatMessage[]; lang?: Lang };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { transcript } = body;
  if (!Array.isArray(transcript) || transcript.length === 0) {
    return new Response("transcript (non-empty array) is required", { status: 400 });
  }
  if (transcript.length > MAX_MESSAGES) {
    return new Response("Transcript is too long", { status: 413 });
  }
  if (transcript.some((m) => typeof m?.content !== "string" || m.content.length > MAX_MESSAGE_CHARS)) {
    return new Response("Message is too long", { status: 413 });
  }

  const lang: Lang = body.lang === "en" ? "en" : "ru";
  const labels = ROLE_LABEL[lang];

  const transcriptText = transcript
    .map((m) => `${m.role === "assistant" ? labels.interviewer : labels.candidate}: ${m.content}`)
    .join("\n\n");

  const fullMessages = [
    { role: "system" as const, content: buildSummarySystemPrompt(lang) },
    { role: "user" as const, content: `${labels.intro}\n\n${transcriptText}` },
  ];

  try {
    const stream = await streamGroqCompletion(fullMessages, 0.4, 1500);
    return new Response(stream, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-cache",
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(message, { status: 502 });
  }
}
