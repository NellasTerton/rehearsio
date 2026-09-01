import type { Lang } from "./types";

// Voice choice is locked to the interviewer persona the prompts commit to:
// Russian is always a man (cedar), English is always a woman. If you change a
// voice here you must change the matching persona instruction in
// buildTurnStateMessage/buildInterviewSystemPrompt in lib/prompts.ts, or the
// candidate hears one gender and is told another.

// Russian: cedar only. The other voices were noticeably worse on Russian in
// side-by-side testing, so there's nothing to rotate between.
const RU_VOICE = "cedar";

// English: any of these, picked per call for variety. All are female voices,
// matching the female persona the English prompt commits to.
const EN_FEMALE_VOICES = ["nova", "shimmer", "coral", "sage"] as const;

export type TtsVoice = string;

export function pickVoice(lang: Lang): TtsVoice {
  if (lang === "ru") return RU_VOICE;
  return EN_FEMALE_VOICES[Math.floor(Math.random() * EN_FEMALE_VOICES.length)];
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
