"use client";

import { useEffect, useRef, useState } from "react";
import styles from "./SummaryScreen.module.css";
import type { ChatMessage, Lang } from "@/lib/types";

interface Props {
  transcript: ChatMessage[];
  lang: Lang;
  onRestart: () => void;
}

const SUMMARY_COPY: Record<
  Lang,
  {
    title: string;
    subtitle: string;
    loading: string;
    fetchError: string;
    emptyError: string;
    restart: string;
  }
> = {
  ru: {
    title: "Итоги собеседования",
    subtitle: "Разбор вашего интервью от AI-собеседника",
    loading: "Анализируем собеседование...",
    fetchError: "Не удалось сформировать отчёт. Попробуйте начать собеседование заново.",
    emptyError: "Транскрипт собеседования пуст — нечего анализировать.",
    restart: "Начать заново",
  },
  en: {
    title: "Interview summary",
    subtitle: "Your interview, reviewed by the AI interviewer",
    loading: "Reviewing the interview...",
    fetchError: "Couldn't put the report together. Try starting the interview again.",
    emptyError: "The transcript is empty — there's nothing to review.",
    restart: "Start over",
  },
};

function stripMarkdown(text: string): string {
  const withoutInline = text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*]\s+/gm, "- ");

  // Markdown tables occasionally slip through despite being told not to
  // (observed more often in English reports than Russian ones): drop the
  // header-separator row (any number of columns), then flatten each
  // remaining `| a | b |` row into a plain "a — b" line instead of showing
  // raw pipe syntax. Line-based rather than one big regex because a
  // separator row's pipe count varies with the table's column count.
  const lines = withoutInline.split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (/^\|?[\s:-]+\|([\s:-]+\|)*[\s:-]*$/.test(trimmed) && trimmed.includes("-")) {
      continue;
    }
    if (/^\|.*\|$/.test(trimmed)) {
      const cells = trimmed
        .slice(1, -1)
        .split("|")
        .map((c) => c.trim())
        .filter(Boolean);
      out.push(cells.join(" — "));
      continue;
    }
    out.push(line);
  }
  return out.join("\n").replace(/\n{3,}/g, "\n\n");
}

export default function SummaryScreen({ transcript, lang, onRestart }: Props) {
  const T = SUMMARY_COPY[lang];
  const [report, setReport] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    async function fetchSummary() {
      setLoading(true);
      setError("");
      try {
        const res = await fetch("/api/summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ transcript, lang }),
        });
        if (!res.ok || !res.body) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let text = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const chunk = decoder.decode(value, { stream: true });
          if (!chunk) continue;
          text += chunk;
          setReport(text);
        }
      } catch (err) {
        setError(T.fetchError);
      } finally {
        setLoading(false);
      }
    }

    if (transcript.length === 0) {
      setLoading(false);
      setError(T.emptyError);
      return;
    }

    fetchSummary();
    // T is derived from lang, which doesn't change during a summary's lifetime.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [transcript, lang]);

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div>
          <h1 className={styles.title}>{T.title}</h1>
          <p className={styles.subtitle}>{T.subtitle}</p>
        </div>

        {error && <div className={styles.errorBox}>{error}</div>}

        {loading && !report && (
          <div className={styles.loading}>
            <span className={styles.dot} />
            {T.loading}
          </div>
        )}

        {report && <div className={styles.report}>{stripMarkdown(report)}</div>}

        <button className={styles.restartBtn} onClick={onRestart}>
          {T.restart}
        </button>
      </div>
    </div>
  );
}
