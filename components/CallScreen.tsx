"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./CallScreen.module.css";
import {
  DEFAULT_MAX_QUESTIONS,
  computeInterviewPhase,
  pickClosingLine,
  type InterviewPhase,
} from "@/lib/prompts";
import type { CallState, ChatMessage, Lang } from "@/lib/types";

interface Props {
  systemPrompt: string;
  lang: Lang;
  onEndCall: (transcript: ChatMessage[]) => void;
}

const SILENCE_MS = 1300;

// All the interview's own spoken/logical content (system prompt, per-turn state
// message, closing lines) is built bilingually in lib/prompts.ts and lib/groq
// calls; this is just the screen's own chrome — labels, placeholders, error
// text — plus the BCP-47 tag that drives both recognition and speech synthesis.
const CALL_COPY: Record<
  Lang,
  {
    name: string;
    state: { idle: string; thinking: string; listening: string; listeningNoMic: string; speaking: string };
    micDenied: string;
    unsupportedHint: string;
    questionLabel: string;
    youSpeakLabel: string;
    inputCanType: string;
    inputWait: string;
    send: string;
    endCallAria: string;
    endCallHint: string;
    networkError: string;
    fallbackReply: string;
    speechLang: string;
  }
> = {
  ru: {
    name: "AI-собеседник",
    state: {
      idle: "Подготовка...",
      thinking: "Собеседник думает...",
      listening: "Слушаю вас...",
      listeningNoMic: "Ваша очередь — напишите ответ",
      speaking: "Собеседник говорит...",
    },
    micDenied: "Доступ к микрофону не разрешён. Разрешите доступ или отвечайте текстом ниже.",
    unsupportedHint:
      "Голосовой ввод недоступен в этом браузере — отвечайте текстом ниже, либо откройте страницу в Chrome.",
    questionLabel: "Вопрос собеседника",
    youSpeakLabel: "Вы говорите",
    inputCanType: "Напишите ответ вместо голоса...",
    inputWait: "Дождитесь вопроса...",
    send: "Отправить",
    endCallAria: "Завершить звонок",
    endCallHint: "Завершить",
    networkError: "Не удалось связаться с интервьюером. Проверьте соединение и попробуйте снова.",
    fallbackReply: "Извините, у меня проблемы со связью. Не могли бы вы повторить последний ответ?",
    speechLang: "ru-RU",
  },
  en: {
    name: "AI interviewer",
    state: {
      idle: "Getting ready...",
      thinking: "Thinking...",
      listening: "Listening...",
      listeningNoMic: "Your turn — type your answer",
      speaking: "Speaking...",
    },
    micDenied: "Microphone access was denied. Allow it, or answer by typing below.",
    unsupportedHint:
      "Voice input isn't available in this browser — answer by typing below, or open this page in Chrome.",
    questionLabel: "Question",
    youSpeakLabel: "You're speaking",
    inputCanType: "Type your answer instead of speaking...",
    inputWait: "Wait for the question...",
    send: "Send",
    endCallAria: "End call",
    endCallHint: "End call",
    networkError: "Couldn't reach the interviewer. Check your connection and try again.",
    fallbackReply: "Sorry, I'm having connection trouble. Could you repeat your last answer?",
    speechLang: "en-US",
  },
};

function extractSentences(buffer: string): { sentences: string[]; rest: string } {
  const regex = /[^.!?…]+[.!?…]+\s*/g;
  const sentences: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(buffer)) !== null) {
    sentences.push(match[0].trim());
    lastIndex = regex.lastIndex;
  }
  return { sentences, rest: buffer.slice(lastIndex) };
}

function formatTimer(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60)
    .toString()
    .padStart(2, "0");
  const s = (totalSeconds % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

export default function CallScreen({ systemPrompt, lang, onEndCall }: Props) {
  const T = CALL_COPY[lang];

  const [supported, setSupported] = useState(true);
  const [callState, setCallState] = useState<CallState>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [interimText, setInterimText] = useState("");
  const [liveAssistantText, setLiveAssistantText] = useState("");
  const [error, setError] = useState("");

  const [textInput, setTextInput] = useState("");

  const messagesRef = useRef<ChatMessage[]>([]);
  const recognitionRef = useRef<any>(null);
  const isRecognizingRef = useRef(false);
  const finalTranscriptRef = useRef("");
  const silenceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callActiveRef = useRef(true);
  const callStateRef = useRef<CallState>("idle");
  const typingPausedRef = useRef(false);

  const ttsQueueRef = useRef<string[]>([]);
  const isSpeakingRef = useRef(false);
  const streamDoneRef = useRef(true);
  const speakTokenRef = useRef(0);
  const speakWatchdogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Starts optimistic: the first /api/tts call doubles as the entitlement
  // check. A 401/402 (or any failure) latches this off for the rest of the
  // call, so a free user pays one wasted round-trip, not one per sentence.
  const premiumVoiceRef = useRef(true);
  const premiumAudioRef = useRef<HTMLAudioElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Interview state we track in code rather than trusting the model to count its
  // own turns from the transcript. questionsAskedRef increments once per completed
  // interviewer turn; currentPhaseRef records which phase THAT turn was, so once
  // it's done playing we know whether to keep listening or end the call ourselves.
  const questionsAskedRef = useRef(0);
  const currentPhaseRef = useRef<InterviewPhase>("rapport");

  useEffect(() => {
    callStateRef.current = callState;
  }, [callState]);

  // Elapsed call timer
  useEffect(() => {
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Setup speech recognition (if available) + kick off the first question.
  // Voice input is optional — the interview works in text-only mode when the
  // browser has no Web Speech API, so we never block the screen on it.
  //
  // React 18 StrictMode intentionally mounts this effect, runs its cleanup, then
  // mounts it again in dev — so this body can run twice. We reset the shared refs
  // here (rather than relying on their useRef initial values) so the "real" second
  // run starts clean instead of inheriting whatever the throwaway first run left
  // behind, and give each run its own AbortController so a stale/cleaned-up run's
  // in-flight fetch can never keep pushing audio into a queue nobody owns anymore.
  useEffect(() => {
    callActiveRef.current = true;
    ttsQueueRef.current = [];
    isSpeakingRef.current = false;
    speakTokenRef.current++;
    if (speakWatchdogRef.current) clearInterval(speakWatchdogRef.current);
    messagesRef.current = [];
    questionsAskedRef.current = 0;
    currentPhaseRef.current = "rapport";
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;

    const SpeechRecognitionCtor =
      typeof window !== "undefined" &&
      ((window as any).webkitSpeechRecognition || (window as any).SpeechRecognition);

    let recognition: any = null;

    if (SpeechRecognitionCtor) {
      recognition = new SpeechRecognitionCtor();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = T.speechLang;

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscriptRef.current += result[0].transcript + " ";
          } else {
            interim += result[0].transcript;
          }
        }
        setInterimText(interim);
        resetSilenceTimer();
      };

      recognition.onspeechend = () => {
        stopAndProcess();
      };

      recognition.onerror = (event: any) => {
        if (event.error === "no-speech" || event.error === "aborted") {
          return;
        }
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          setError(T.micDenied);
        }
      };

      recognition.onend = () => {
        isRecognizingRef.current = false;
        if (!callActiveRef.current) return;
        const text = finalTranscriptRef.current.trim();
        finalTranscriptRef.current = "";
        setInterimText("");
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

        if (text) {
          submitAnswer(text);
        } else if (typingPausedRef.current) {
          // Recognition was aborted because the user focused the text field —
          // don't auto-restart listening, let blur/send decide what's next.
          typingPausedRef.current = false;
        } else if (callStateRef.current === "listening") {
          // No speech captured yet — keep listening.
          startListening();
        }
      };

      recognitionRef.current = recognition;
    } else {
      setSupported(false);
    }

    // First question from the interviewer.
    runTurn([]);

    return () => {
      callActiveRef.current = false;
      abortControllerRef.current?.abort();
      if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
      if (speakWatchdogRef.current) clearInterval(speakWatchdogRef.current);
      speakTokenRef.current++;
      if (recognition) {
        try {
          recognition.onresult = null;
          recognition.onend = null;
          recognition.onerror = null;
          recognition.onspeechend = null;
          recognition.abort();
        } catch {
          // ignore
        }
      }
      cancelSpeechIfActive();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setMessagesState(updated: ChatMessage[]) {
    messagesRef.current = updated;
  }

  // Only calls cancel() when something is actually queued/speaking. Calling
  // speechSynthesis.cancel() gratuitously (e.g. on every effect cleanup, even
  // when nothing was ever spoken) is itself a known trigger for Chrome's engine
  // going quiet on the *next* speak() call, so we avoid it unless it does something.
  function cancelSpeechIfActive() {
    if (typeof window === "undefined") return;
    // The premium voice plays through an <audio> element, which speechSynthesis
    // knows nothing about — stop it here too, or ending the call (or barging in)
    // would leave the interviewer talking over everything.
    const audio = premiumAudioRef.current;
    if (audio) {
      audio.pause();
      audio.src = "";
      premiumAudioRef.current = null;
    }
    if (window.speechSynthesis.speaking || window.speechSynthesis.pending) {
      window.speechSynthesis.cancel();
    }
  }

  function resetSilenceTimer() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    silenceTimerRef.current = setTimeout(() => {
      stopAndProcess();
    }, SILENCE_MS);
  }

  function stopAndProcess() {
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (isRecognizingRef.current && recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
  }

  function startListening() {
    if (!callActiveRef.current || !recognitionRef.current) return;
    if (isRecognizingRef.current) return;
    finalTranscriptRef.current = "";
    setInterimText("");
    try {
      recognitionRef.current.start();
      isRecognizingRef.current = true;
      setCallState("listening");
    } catch {
      // start() can throw if already started; ignore
    }
  }

  function enqueueSpeech(text: string) {
    if (!text.trim() || typeof window === "undefined") return;
    ttsQueueRef.current.push(text);
    playNextInQueue();
  }

  function playNextInQueue() {
    if (isSpeakingRef.current) return;
    const next = ttsQueueRef.current.shift();
    if (!next) {
      checkIdle();
      return;
    }
    isSpeakingRef.current = true;
    const myToken = ++speakTokenRef.current;

    const advance = () => {
      // Ignore late/duplicate callbacks from an utterance the watchdog already moved past.
      if (speakTokenRef.current !== myToken) return;
      if (speakWatchdogRef.current) clearInterval(speakWatchdogRef.current);
      isSpeakingRef.current = false;
      playNextInQueue();
    };

    if (premiumVoiceRef.current) {
      void speakPremium(next, myToken, advance);
      return;
    }
    speakWithBrowser(next, myToken, advance);
  }

  /**
   * Paid realistic voice. Any failure — not entitled, network, provider
   * error — falls back to the free browser voice rather than leaving the
   * candidate in silence, because a call with no audio is worse than a call
   * with a plain voice.
   */
  async function speakPremium(text: string, myToken: number, advance: () => void) {
    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, lang }),
      });

      if (!res.ok) {
        premiumVoiceRef.current = false;
        if (speakTokenRef.current !== myToken) return;
        speakWithBrowser(text, myToken, advance);
        return;
      }

      const blob = await res.blob();
      // The call may have been ended or barged in on while the audio was
      // being generated — don't start playing something already superseded.
      if (speakTokenRef.current !== myToken || !callActiveRef.current) return;

      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      premiumAudioRef.current = audio;

      const finish = () => {
        URL.revokeObjectURL(url);
        if (premiumAudioRef.current === audio) premiumAudioRef.current = null;
        advance();
      };
      audio.onended = finish;
      audio.onerror = finish;
      await audio.play();
    } catch {
      premiumVoiceRef.current = false;
      if (speakTokenRef.current !== myToken) return;
      speakWithBrowser(text, myToken, advance);
    }
  }

  function speakWithBrowser(next: string, myToken: number, advance: () => void) {
    if (typeof window === "undefined") {
      advance();
      return;
    }
    let started = false;
    let retried = false;

    const speakNow = () => {
      const utter = new SpeechSynthesisUtterance(next);
      utter.lang = T.speechLang;
      utter.onstart = () => {
        started = true;
      };
      utter.onend = advance;
      utter.onerror = advance;
      window.speechSynthesis.speak(utter);
    };

    speakNow();

    // Safety net for two separate Chrome flakiness modes:
    // 1) speak() is occasionally silently swallowed — no onstart, no onend, no
    //    onerror, just permanent silence. If nothing started within ~500ms we
    //    cancel and re-issue the same utterance once (the standard workaround).
    // 2) onend/onerror themselves occasionally never fire even though audio did
    //    play. We must NOT force-advance on a fixed timer here either — guessing
    //    "how long this takes to speak" wrong makes the next utterance start
    //    while this one is still audible (overlapping/garbled speech). So once
    //    speech has genuinely started, we poll the engine's own `speaking` flag
    //    and only advance once it agrees nothing is playing, with a generous
    //    hard cap as a last resort.
    let checks = 0;
    speakWatchdogRef.current = setInterval(() => {
      checks++;
      if (speakTokenRef.current !== myToken) {
        if (speakWatchdogRef.current) clearInterval(speakWatchdogRef.current);
        return;
      }
      if (!started && !retried && checks === 2) {
        retried = true;
        window.speechSynthesis.cancel();
        speakNow();
        return;
      }
      const stillSpeaking = window.speechSynthesis.speaking || window.speechSynthesis.pending;
      if (!stillSpeaking || checks > 150) {
        advance();
      }
    }, 250);
  }

  function checkIdle() {
    if (
      callActiveRef.current &&
      streamDoneRef.current &&
      ttsQueueRef.current.length === 0 &&
      !isSpeakingRef.current
    ) {
      // The interviewer just finished its closing remark — the interview ends
      // itself here instead of waiting for the candidate to say "stop" or press
      // the end-call button (that stays as an emergency exit only).
      if (currentPhaseRef.current === "closing") {
        handleEndCall();
        return;
      }
      // Keep the question text on screen while the candidate answers — it only
      // gets replaced once the next question actually starts streaming in.
      if (recognitionRef.current) {
        startListening();
      } else {
        // Text-only mode: no mic to start, just mark it as the user's turn.
        setCallState("listening");
      }
    }
  }

  /** Submits a candidate answer, whether it came from speech or the text field. */
  function submitAnswer(rawText: string) {
    const text = rawText.trim();
    if (!text || !callActiveRef.current) return;

    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);

    // Barge-in: if the interviewer is still (or about to be) speaking when the
    // candidate submits a typed answer, cut the playback short instead of making
    // them wait for it to finish — like talking over someone on a real call.
    if (isSpeakingRef.current || ttsQueueRef.current.length > 0) {
      speakTokenRef.current++;
      if (speakWatchdogRef.current) clearInterval(speakWatchdogRef.current);
      ttsQueueRef.current = [];
      isSpeakingRef.current = false;
      cancelSpeechIfActive();
    }

    if (isRecognizingRef.current && recognitionRef.current) {
      typingPausedRef.current = true;
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }
    finalTranscriptRef.current = "";
    setInterimText("");
    setTextInput("");
    // Leave liveAssistantText showing the question just answered — it'll be
    // replaced once the next question actually starts streaming in.

    const updated = [...messagesRef.current, { role: "user" as const, content: text }];
    setMessagesState(updated);
    runTurn(updated);
  }

  function handleTextInputFocus() {
    if (isRecognizingRef.current && recognitionRef.current) {
      typingPausedRef.current = true;
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }
  }

  function handleTextInputBlur() {
    if (
      !textInput.trim() &&
      callActiveRef.current &&
      callStateRef.current === "listening" &&
      !isRecognizingRef.current &&
      recognitionRef.current
    ) {
      startListening();
    }
  }

  function handleTextInputKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submitAnswer(textInput);
    }
  }

  async function runTurn(history: ChatMessage[], attempt = 1) {
    // Every call gets its own AbortController and immediately supersedes whatever
    // turn was previously in flight. This matters for two distinct cases: (1) the
    // call session gets torn down (e.g. React StrictMode's dev-only double-mount,
    // or the user ending the call), and (2) the candidate barges in with a new
    // answer WHILE the previous turn's network stream is still actively arriving
    // (not just still being spoken — the fetch itself hasn't finished). Without
    // this, two runTurn calls can run concurrently and both mutate the shared
    // transcript/caption state, producing interleaved, garbled output. Once
    // superseded, `controller.signal.aborted` flips true and every checkpoint
    // below bails out without touching state a newer turn now owns.
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // Computed from our own counter, not asked of the model — this is the phase
    // THIS turn is being generated for. checkIdle() reads it back once the turn
    // has finished playing to decide whether to keep listening or end the call.
    const phase = computeInterviewPhase(questionsAskedRef.current, DEFAULT_MAX_QUESTIONS);
    currentPhaseRef.current = phase;

    if (phase === "closing") {
      // The one turn where correctness really matters: testing showed the model
      // doesn't reliably stop asking questions here even when told to explicitly,
      // and getting it wrong means the call ends abruptly mid-question. Speak a
      // fixed goodbye ourselves instead of gambling on the model complying.
      setError("");
      const closingText = pickClosingLine(lang);
      setLiveAssistantText(closingText);
      setCallState("speaking");
      enqueueSpeech(closingText);
      streamDoneRef.current = true;
      questionsAskedRef.current += 1;
      setMessagesState([...history, { role: "assistant" as const, content: closingText }]);
      return;
    }

    setCallState("thinking");
    setError("");
    streamDoneRef.current = false;
    let buffer = "";
    let fullText = "";
    let firstChunk = true;
    let shouldRetry = false;
    // The prompt asks for exactly one question per turn, but at the token budget
    // needed to avoid empty responses (see maxTokens below), the model sometimes
    // ignores that and keeps going — reaction, question, then another reaction,
    // another question, on and on. Rather than trust compliance, we enforce it:
    // once we've spoken a sentence that ends the one question this turn is
    // allowed to ask, we stop consuming the stream and discard whatever follows.
    let turnComplete = false;

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemPrompt,
          messages: history,
          questionsAsked: questionsAskedRef.current,
          maxQuestions: DEFAULT_MAX_QUESTIONS,
          lang,
        }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        throw new Error(`Request failed: ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        if (controller.signal.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        if (!chunk) continue;
        if (firstChunk) {
          setCallState("speaking");
          firstChunk = false;
        }
        buffer += chunk;
        const { sentences, rest } = extractSentences(buffer);
        buffer = rest;

        for (const s of sentences) {
          if (turnComplete) break;
          fullText += (fullText ? " " : "") + s;
          enqueueSpeech(s);
          if (s.endsWith("?")) turnComplete = true;
        }
        setLiveAssistantText(fullText);

        if (turnComplete) {
          try {
            await reader.cancel();
          } catch {
            // ignore
          }
          break;
        }
      }
      if (!turnComplete && buffer.trim() && !controller.signal.aborted) {
        fullText += (fullText ? " " : "") + buffer.trim();
        enqueueSpeech(buffer.trim());
      }
      if (!fullText.trim() && !controller.signal.aborted) {
        // The request succeeded but the model produced zero visible content (e.g.
        // gpt-oss burned its whole token budget on reasoning before reaching the
        // final answer). A silent, textless turn is just as broken as a network
        // failure — retry it the same way instead of leaving the candidate hanging.
        if (attempt < 2) {
          shouldRetry = true;
        } else {
          fullText = T.fallbackReply;
          enqueueSpeech(fullText);
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      if (attempt < 2 && !fullText) {
        // Nothing came back yet (e.g. a stalled connection that just timed out) —
        // treat it as a transient hiccup and retry once, silently, before bothering
        // the candidate with an error or putting a fake line in the transcript.
        shouldRetry = true;
      } else {
        setError(T.networkError);
        if (!fullText) {
          fullText = T.fallbackReply;
          enqueueSpeech(fullText);
        }
      }
    } finally {
      if (controller.signal.aborted) return;
      if (shouldRetry) {
        setTimeout(() => {
          if (callActiveRef.current) runTurn(history, attempt + 1);
        }, 900);
        return;
      }
      streamDoneRef.current = true;
      questionsAskedRef.current += 1;
      const finalMessages = [...history, { role: "assistant" as const, content: fullText }];
      setMessagesState(finalMessages);
      checkIdle();
    }
  }

  function handleEndCall() {
    callActiveRef.current = false;
    if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current);
    if (speakWatchdogRef.current) clearInterval(speakWatchdogRef.current);
    speakTokenRef.current++;
    try {
      recognitionRef.current?.abort();
    } catch {
      // ignore
    }
    cancelSpeechIfActive();
    onEndCall(messagesRef.current);
  }

  const stateLabel: Record<CallState, string> = {
    idle: T.state.idle,
    thinking: T.state.thinking,
    listening: supported ? T.state.listening : T.state.listeningNoMic,
    speaking: T.state.speaking,
  };

  // Typing is allowed once the question has started arriving — the candidate can
  // type over the interviewer mid-question (barge-in) instead of waiting for TTS
  // to finish. Only truly blocked while we're waiting on the network ("thinking").
  const canType = callState === "listening" || callState === "speaking";
  const showInterim = callState === "listening" && interimText;
  const hasCaptionContent = !!error || !supported || !!liveAssistantText || !!showInterim;

  return (
    <div className={styles.page}>
      <div className={styles.card}>
        <div className={styles.header}>
          <p className={styles.name}>{T.name}</p>
          <p className={styles.timer}>{formatTimer(elapsed)}</p>
          <span className={styles.statusChip} data-tone={callState}>
            {stateLabel[callState]}
          </span>
        </div>

        <div className={styles.orbHolder} data-state={callState}>
          <span className={styles.orbRing} />
          <span className={styles.orbRing} />
          <span className={styles.orb}>
            {callState === "thinking" ? (
              <span className={styles.thinkingDots} aria-hidden="true">
                <span />
                <span />
                <span />
              </span>
            ) : (
              <span className={styles.wave} aria-hidden="true">
                <span />
                <span />
                <span />
                <span />
                <span />
              </span>
            )}
          </span>
        </div>

        {hasCaptionContent && (
          <div className={styles.captionCard}>
            {error && <div className={styles.errorBox}>{error}</div>}
            {!supported && <div className={styles.hintBox}>{T.unsupportedHint}</div>}
            {liveAssistantText && (
              <div className={styles.block}>
                <div className={styles.captionLabel}>{T.questionLabel}</div>
                <div className={styles.liveText}>{liveAssistantText}</div>
              </div>
            )}
            {showInterim && (
              <div className={styles.block}>
                <div className={styles.captionLabel}>{T.youSpeakLabel}</div>
                <div className={`${styles.liveText} ${styles.answerText}`}>{interimText}</div>
              </div>
            )}
          </div>
        )}

        <form
          className={styles.textRow}
          onSubmit={(e) => {
            e.preventDefault();
            submitAnswer(textInput);
          }}
        >
          <textarea
            className={styles.textInput}
            value={textInput}
            onChange={(e) => setTextInput(e.target.value)}
            onFocus={handleTextInputFocus}
            onBlur={handleTextInputBlur}
            onKeyDown={handleTextInputKeyDown}
            placeholder={canType ? T.inputCanType : T.inputWait}
            disabled={!canType}
            rows={1}
          />
          <button type="submit" className={styles.sendBtn} disabled={!canType || !textInput.trim()}>
            {T.send}
          </button>
        </form>

        <div className={styles.footer}>
          <button className={styles.endBtn} onClick={handleEndCall} aria-label={T.endCallAria}>
            ✕
          </button>
          <span className={styles.endHint}>{T.endCallHint}</span>
        </div>
      </div>
    </div>
  );
}
