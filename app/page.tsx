"use client";

import { useState } from "react";
import LandingScreen from "@/components/LandingScreen";
import CallScreen from "@/components/CallScreen";
import SummaryScreen from "@/components/SummaryScreen";
import type { ChatMessage, Lang } from "@/lib/types";

type Screen = "setup" | "call" | "summary";

export default function Home() {
  const [screen, setScreen] = useState<Screen>("setup");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [lang, setLang] = useState<Lang>("ru");
  const [transcript, setTranscript] = useState<ChatMessage[]>([]);

  function handleStart(prompt: string, startLang: Lang) {
    setSystemPrompt(prompt);
    setLang(startLang);
    setTranscript([]);
    setScreen("call");
  }

  function handleEndCall(finalTranscript: ChatMessage[]) {
    setTranscript(finalTranscript);
    setScreen("summary");
  }

  function handleRestart() {
    setSystemPrompt("");
    setTranscript([]);
    setScreen("setup");
  }

  // Every screen now owns its own full-bleed background via its CSS module
  // (all three share the Rehearsio cream/white/iris tokens) — none of them
  // sit inside a shared centering wrapper.
  if (screen === "call") {
    return <CallScreen systemPrompt={systemPrompt} lang={lang} onEndCall={handleEndCall} />;
  }

  if (screen === "summary") {
    return <SummaryScreen transcript={transcript} lang={lang} onRestart={handleRestart} />;
  }

  return <LandingScreen onStart={handleStart} />;
}
