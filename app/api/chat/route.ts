import { streamGroqCompletion } from "@/lib/groq";
import { DEFAULT_MAX_QUESTIONS, buildTurnStateMessage, computeInterviewPhase } from "@/lib/prompts";
import { checkChatRateLimit, getClientIp } from "@/lib/rate-limit";
import type { ChatMessage, Lang } from "@/lib/types";

export const runtime = "nodejs";

const KICKOFF_CUE: Record<Lang, string> = {
  ru: "(Собеседование начинается прямо сейчас.)",
  en: "(The interview is starting right now.)",
};

// Abuse ceilings. The cheapest way to burn someone else's Groq budget is to
// paste a novel as the "job post", so cap what we're willing to forward.
// Generous enough that no real job post or CV comes close: the system prompt
// carries the post plus the CV plus our instructions.
const MAX_SYSTEM_PROMPT_CHARS = 24000;
const MAX_MESSAGE_CHARS = 4000;
const MAX_MESSAGES = 40;

export async function POST(req: Request) {
  const ip = getClientIp(req);
  const limit = await checkChatRateLimit(ip);
  if (!limit.success) {
    return new Response("Too many requests, please slow down", {
      status: 429,
      headers: { "Retry-After": String(limit.retryAfterSec) },
    });
  }

  let body: {
    systemPrompt?: string;
    messages?: ChatMessage[];
    questionsAsked?: number;
    maxQuestions?: number;
    lang?: Lang;
  };
  try {
    body = await req.json();
  } catch {
    return new Response("Invalid JSON body", { status: 400 });
  }

  const { systemPrompt, messages } = body;
  if (!systemPrompt || typeof systemPrompt !== "string" || !Array.isArray(messages)) {
    return new Response("systemPrompt (string) and messages (array) are required", {
      status: 400,
    });
  }

  if (systemPrompt.length > MAX_SYSTEM_PROMPT_CHARS) {
    return new Response("Job post is too long", { status: 413 });
  }
  if (messages.length > MAX_MESSAGES) {
    return new Response("Conversation is too long", { status: 413 });
  }
  if (messages.some((m) => typeof m?.content !== "string" || m.content.length > MAX_MESSAGE_CHARS)) {
    return new Response("Message is too long", { status: 413 });
  }

  const lang: Lang = body.lang === "en" ? "en" : "ru";

  // The phase (rapport/core/closing) is computed here from plain counters, not
  // trusted from the client and not left for the model to infer from the
  // transcript — the model is unreliable at counting its own turns.
  const questionsAsked =
    typeof body.questionsAsked === "number" && body.questionsAsked >= 0 ? body.questionsAsked : 0;
  const maxQuestions =
    typeof body.maxQuestions === "number" && body.maxQuestions > 0
      ? body.maxQuestions
      : DEFAULT_MAX_QUESTIONS;
  const phase = computeInterviewPhase(questionsAsked, maxQuestions);
  const stateMessage = buildTurnStateMessage(questionsAsked, maxQuestions, phase, lang);

  // When the transcript is still empty this is the opening turn: give the model an
  // explicit user-role cue to react to instead of leaving it with only system
  // messages, which otherwise tends to make it hallucinate the whole dialogue in
  // one go. This cue is never shown to the user or stored in the transcript.
  const kickoff = messages.length === 0 ? [{ role: "user" as const, content: KICKOFF_CUE[lang] }] : [];

  const fullMessages = [
    { role: "system" as const, content: systemPrompt },
    { role: "system" as const, content: stateMessage },
    ...kickoff,
    ...messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  // Auto-ending the call relies on our own turn counter, not on parsing the
  // model's words — but if the model ignores the closing instruction and asks
  // yet another question instead of wrapping up, the call would still end right
  // after it, abruptly, mid-question. A lower temperature here isn't for style,
  // it's to make that specific instruction more reliably followed.
  const temperature = phase === "closing" ? 0.3 : 0.7;

  try {
    // 300 rather than 500: measured across 5 full interviews, a legitimate
    // spoken turn costs 48-169 completion tokens (reasoning included, since
    // reasoning_effort is "low"), and the model always stopped on its own well
    // under the cap. The cap only ever bites on the overrun tail — the model
    // roleplaying the candidate's reply after its own question — which the
    // client discards anyway. Stream cancellation (see lib/groq.ts) handles
    // most of that; this is the backstop for turns the client can't cancel
    // because the reply contains no question mark to cut on.
    const stream = await streamGroqCompletion(fullMessages, temperature, 300);
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
