"use client";

import { useEffect, useState } from "react";

import type { Lang } from "@/lib/types";

import styles from "./PremiumNotice.module.css";

const DISMISS_KEY = "rehearsio_premium_notice_dismissed";

const COPY = {
  ru: {
    title: "Голос, который звучит как человек",
    body: "Бесплатный голос читает вопросы браузерным синтезатором. В подписке собеседник говорит настоящим голосом, и разговор перестаёт быть похожим на робота.",
    anon: "Без аккаунта",
    anonWhat: "одно интервью",
    free: "С аккаунтом",
    freeWhat: "по одному интервью каждый день",
    paid: "Подписка",
    paidWhat: "интервью без ограничений и живой голос",
    cta: "Подключить",
    later: "Потом",
  },
  en: {
    title: "A voice that sounds human",
    body: "The free voice reads questions with your browser's speech synthesiser. On a subscription the interviewer speaks with a real voice, and the call stops sounding like a robot.",
    anon: "No account",
    anonWhat: "one interview",
    free: "With an account",
    freeWhat: "one interview every day",
    paid: "Subscription",
    paidWhat: "unlimited interviews and the real voice",
    cta: "Get it",
    later: "Later",
  },
} as const;

export default function PremiumNotice({
  lang,
  onSubscribe,
}: {
  lang: Lang;
  onSubscribe: () => void;
}) {
  const t = COPY[lang];
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only ever shown once per browser. A pitch that reappears on every visit
    // reads as nagging, and the same information stays available in the
    // account bar.
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      // Private mode or blocked storage: treat as not dismissed, but then
      // never persist either — showing it once per session is acceptable.
    }
    if (dismissed) return;
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  function dismiss() {
    setVisible(false);
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      // ignore
    }
  }

  if (!visible) return null;

  return (
    <aside className={styles.wrap} aria-live="polite">
      <h3 className={styles.title}>{t.title}</h3>
      <p className={styles.body}>{t.body}</p>
      <ul className={styles.tiers}>
        <li>
          <span className={styles.tierName}>{t.anon}</span>: {t.anonWhat}
        </li>
        <li>
          <span className={styles.tierName}>{t.free}</span>: {t.freeWhat}
        </li>
        <li className={styles.paid}>
          <span className={styles.tierName}>{t.paid}</span>: {t.paidWhat}
        </li>
      </ul>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.cta}
          onClick={() => {
            dismiss();
            onSubscribe();
          }}
        >
          {t.cta}
        </button>
        <button type="button" className={styles.later} onClick={dismiss}>
          {t.later}
        </button>
      </div>
    </aside>
  );
}
