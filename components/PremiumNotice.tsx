"use client";

import { useEffect, useState } from "react";

import type { Lang } from "@/lib/types";

import styles from "./PremiumNotice.module.css";

// Kept in sync by hand with the Stripe Price this app checks out against
// (product "VacancyBot", 1.99 EUR / month, live mode). If the price changes in
// Stripe, change it here too — showing one number and charging another is the
// one bug in this component that actually costs trust.
const PRICE: Record<Lang, string> = { ru: "1,99 €", en: "€1.99" };

const COPY = {
  ru: {
    badge: "Сейчас акция",
    title: "Живой голос за 1,99 € в месяц",
    body: "Бесплатный голос читает вопросы браузерным синтезатором и звучит как робот. По подписке собеседник говорит настоящим голосом, и интервью наконец похоже на разговор.",
    per: "в месяц, можно отменить в любой момент",
    f1: "Интервью без ограничений",
    f2: "Живой голос вместо браузерного",
    f3: "Разбор после каждого разговора",
    cta: "Подключить за 1,99 €",
    later: "Пока не надо",
    close: "Закрыть",
  },
  en: {
    badge: "Limited offer",
    title: "A real voice for €1.99 a month",
    body: "The free voice reads questions through your browser's synthesiser and sounds like a robot. On a subscription the interviewer speaks with a real voice, and the call finally feels like a conversation.",
    per: "per month, cancel any time",
    f1: "Unlimited interviews",
    f2: "A real voice instead of the browser one",
    f3: "A written report after every call",
    cta: "Get it for €1.99",
    later: "Not right now",
    close: "Close",
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
    // Shown on every visit, deliberately — the parent only mounts this
    // component while the visitor has no subscription (signed out, free
    // tier, or lapsed), so "every visit" means "every visit while there's
    // still something to sell." A short delay so it lands after the page has
    // painted rather than slamming shut over a blank screen.
    const timer = setTimeout(() => setVisible(true), 1400);
    return () => clearTimeout(timer);
  }, []);

  // Escape closes it, like any other modal.
  useEffect(() => {
    if (!visible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") dismiss();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [visible]);

  function dismiss() {
    // Only hides it for the rest of this page view — no persistence. It
    // comes back on the next full visit as long as the parent still thinks
    // there's a subscription to sell.
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) dismiss();
      }}
    >
      <div className={styles.card} role="dialog" aria-modal="true" aria-label={t.title}>
        <button type="button" className={styles.close} onClick={dismiss} aria-label={t.close}>
          ×
        </button>

        <span className={styles.badge}>{t.badge}</span>
        <h2 className={styles.title}>{t.title}</h2>
        <p className={styles.body}>{t.body}</p>

        <div className={styles.priceRow}>
          <span className={styles.price}>{PRICE[lang]}</span>
          <span className={styles.per}>{t.per}</span>
        </div>

        <ul className={styles.tiers}>
          <li>
            <span className={styles.tick} aria-hidden="true">
              ✓
            </span>
            {t.f1}
          </li>
          <li>
            <span className={styles.tick} aria-hidden="true">
              ✓
            </span>
            {t.f2}
          </li>
          <li>
            <span className={styles.tick} aria-hidden="true">
              ✓
            </span>
            {t.f3}
          </li>
        </ul>

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
    </div>
  );
}
