> 🇷🇺 [Читать по-русски](README.ru.md)

# Rehearsio

**Your interview. Rehearsed.**

Rehearsio is a voice interview trainer. Paste a job post (and optionally a résumé), and an AI interviewer calls you — asks questions out loud about that specific role, follows up when your answers are thin, and closes the call itself. Afterwards you get a written report: strengths, weak spots, a score per question, and what to fix before the real thing.

**Live: [rehearsioai.vercel.app](https://rehearsioai.vercel.app)**

## What it does

- Paste a job post → the interview is generated from *that* post, not a generic question bank.
- Spoken conversation, not a form: rapport → core questions → closing, with real follow-ups on vague or evasive answers.
- Bilingual end to end — Russian or English, and the interview itself is conducted in whichever language the post is in.
- Auto-detects seniority (intern → lead) from the job post and calibrates question depth accordingly.
- Free tier: one interview with no sign-up, one a day with a free account. A paid subscription removes the limit and swaps the browser's text-to-speech for a realistic AI voice.

## Why this is more than a chat wrapper

A handful of the harder problems this project actually had to solve:

- **The interview doesn't trust the model to behave.** Phase (rapport / core / closing), question count, and when the call ends are all tracked in code, not inferred from the model's own output — an LLM is unreliable at counting its own turns or reliably stopping when told to. The closing line is spoken from a fixed set rather than generated, because a model that won't stop asking questions ends a call abruptly mid-question.
- **Token-leak fix.** The model would often keep generating well past the one question a turn is allowed — the client cuts off at the first sentence ending in `?`, but the server was still paying for (and generating) everything downstream. Propagating the client's `cancel()` up through to the actual upstream Groq request measurably cut wasted generation.
- **The realistic voice is a single generation, not one call per sentence.** Early on, text was split into sentences client-side so speech could start immediately — but that meant multiple independent OpenAI TTS calls per reply, and TTS models aren't acoustically deterministic call-to-call: the interviewer's voice could audibly drift mid-sentence. Fixed by batching each full reply into one TTS request, with the voice ID pinned once per call and validated server-side against the locked persona (Russian interviewer is always male, English always female — matched to the synthesized voice, not just the name).
- **Audio streams, it doesn't buffer-then-play.** The TTS endpoint relays OpenAI's stream straight through; the client used to wait for the full mp3 (`res.blob()`) before playing anything, adding a multi-second silent gap after the text had already appeared. Rewritten to feed the response into an `<audio>` element via `MediaSource` as bytes arrive, with a full-buffer fallback for browsers without MSE/mp3 support.
- **Money-safe subscriptions.** Stripe's webhook is HMAC-signature verified on the raw body (the one thing standing between "the user actually paid" and anyone forging that event), event IDs are recorded to make delivery idempotent since Stripe guarantees *at-least-once* delivery, and a cancelled-but-still-paid-for subscription keeps working until the period actually lapses.
- **Abuse-aware by default.** Per-IP rate limiting backed by Upstash Redis in production, with an in-process fallback so a missing env var degrades gracefully instead of leaving the API wide open; free-tier usage is tracked server-side (claiming a run mints a signed cookie, checked before every interview start) so the limit can't be bypassed from the client.

## Stack

- **Next.js 14** (App Router) + TypeScript
- **Groq** (`openai/gpt-oss-20b`) — the interviewer and the feedback report, streamed
- **OpenAI** (`gpt-4o-mini-tts`) — the paid realistic voice
- Browser Web Speech API — the free voice and speech-to-text
- **Auth.js** (Google OAuth + email/password) for accounts
- **Neon Postgres** + **Drizzle ORM** for subscriptions and usage tracking
- **Stripe** for billing
- **Upstash Redis** for production rate limiting
- Deployed on **Vercel**

## Running it locally

```bash
git clone https://github.com/NellasTerton/rehearsio.git
cd rehearsio
npm install
cp .env.example .env.local   # fill in at least GROQ_API_KEY
npm run dev
```

Everything except `GROQ_API_KEY` is optional locally — without the rest, the app runs with the free voice and no accounts. See `.env.example` for what each variable is for and where to get it.

## License

No license file yet — all rights reserved for now.
