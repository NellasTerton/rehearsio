import type { Lang } from "./types";

// Voice choice is locked to the interviewer persona the prompts commit to:
// Russian is always a man (cedar), English is always a woman. If you change a
// voice here you must change the matching persona instruction in
// buildTurnStateMessage/buildInterviewSystemPrompt in lib/prompts.ts, or the
// candidate hears one gender and is told another.

// Russian: cedar only. The other voices were noticeably worse on Russian in
// side-by-side testing, so there's nothing to rotate between.
const RU_VOICES = ["cedar"] as const;

// English: any of these, picked once per call for variety across different
// interviews. All are female voices, matching the female persona the English
// prompt commits to.
const EN_FEMALE_VOICES = ["nova", "shimmer", "coral", "sage"] as const;

export type TtsVoice = string;

function voicesFor(lang: Lang): readonly string[] {
  return lang === "ru" ? RU_VOICES : EN_FEMALE_VOICES;
}

/**
 * Picks a voice for a NEW call. Call this once per interview and keep the
 * result for every /api/tts request in that call — the interviewer must
 * sound like the same person for the whole conversation. Calling this per
 * request (instead of once per call) is the exact bug that made the voice
 * randomly change mid-interview; if you're tempted to call it from the TTS
 * route itself, don't — see isValidVoice below instead.
 */
export function pickVoice(lang: Lang): TtsVoice {
  const voices = voicesFor(lang);
  return voices[Math.floor(Math.random() * voices.length)];
}

/**
 * Server-side check that a client-supplied voice is actually one of the
 * persona-appropriate options for this language, so a request can't ask for
 * (say) a male voice on an English call and break the name/voice match.
 */
export function isValidVoice(lang: Lang, voice: unknown): voice is TtsVoice {
  return typeof voice === "string" && voicesFor(lang).includes(voice as TtsVoice);
}

export const TTS_MODEL = "gpt-4o-mini-tts";

// Steering text for gpt-4o-mini-tts. Keeps delivery conversational rather
// than newsreader-flat, which is what makes a synthesised interviewer sound
// like a recording instead of a person on a call.
export const TTS_INSTRUCTIONS: Record<Lang, string> = {
  ru:
    "Speak natural, native-sounding Russian with correct Russian stress and " +
    "intonation. Warm and conversational, like a real recruiter on a phone " +
    "call — not a news announcer.",
  en:
    "Speak warmly and conversationally, like a real recruiter on a phone " +
    "call — relaxed pacing, natural intonation, not a news announcer.",
};
