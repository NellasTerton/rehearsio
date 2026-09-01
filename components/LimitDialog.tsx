"use client";

import type { Lang } from "@/lib/types";

import styles from "./AuthDialog.module.css";

const COPY = {
  ru: {
    anonTitle: "Бесплатное интервью закончилось",
    anonBody:
      "Это был пробный разговор без аккаунта. Заведите аккаунт, и одно интервью будет доступно каждый день. В подписке их сколько угодно и голос настоящий.",
    freeTitle: "На сегодня всё",
    freeBody:
      "Бесплатное интервью на сегодня вы уже прошли, следующее будет завтра. В подписке ограничения нет, и собеседник говорит живым голосом.",
    signup: "Создать аккаунт",
    subscribe: "Оформить подписку",
    close: "Закрыть",
  },
  en: {
    anonTitle: "That was your free interview",
    anonBody:
      "That was the trial run without an account. Create one and you get an interview every day. A subscription removes the limit and adds the real voice.",
    freeTitle: "That's it for today",
    freeBody:
      "You've used today's free interview, the next one is tomorrow. A subscription removes the limit and the interviewer speaks with a real voice.",
    signup: "Create account",
    subscribe: "Subscribe",
    close: "Close",
  },
} as const;

export default function LimitDialog({
  lang,
  tier,
  onSignUp,
  onSubscribe,
  onClose,
}: {
  lang: Lang;
  tier: "anonymous" | "free";
  onSignUp: () => void;
  onSubscribe: () => void;
  onClose: () => void;
}) {
  const t = COPY[lang];
  const anon = tier === "anonymous";

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.card} role="dialog" aria-modal="true">
        <button type="button" className={styles.close} onClick={onClose} aria-label={t.close}>
          ×
        </button>
        <h2 className={styles.title}>{anon ? t.anonTitle : t.freeTitle}</h2>
        <p className={styles.subtitle}>{anon ? t.anonBody : t.freeBody}</p>

        {/* An anonymous visitor's cheapest next step is an account, not a
            card — asking for payment first would skip the free tier that
            makes the product worth paying for. */}
        <button
          type="button"
          className={styles.primary}
          onClick={anon ? onSignUp : onSubscribe}
        >
          {anon ? t.signup : t.subscribe}
        </button>
        {anon && (
          <div className={styles.switch}>
            <button type="button" className={styles.switchBtn} onClick={onSubscribe}>
              {t.subscribe}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
