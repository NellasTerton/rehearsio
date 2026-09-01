export type Lang = "ru" | "en";

export type ChatRole = "user" | "assistant";

export interface ChatMessage {
  role: ChatRole;
  content: string;
}

export type CallState = "idle" | "listening" | "thinking" | "speaking";
