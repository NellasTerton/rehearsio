"use client";

import { signOut } from "next-auth/react";
import { useCallback, useEffect, useState } from "react";

import type { Lang } from "@/lib/types";

import AuthDialog from "./AuthDialog";
import PremiumNotice from "./PremiumNotice";
import styles from "./AccountBar.module.css";

interface Me {
  signedIn: boolean;
  email?: string | null;
  hasSubscription: boolean;
  hasBillingAccount?: boolean;
}

const COPY: Record<Lang, Record<string, string>> = {
  ru: {
    signIn: "Войти",
    getVoice: "Живой голос",
    signOut: "Выйти",
    buy: "Живой голос",
    manage: "Подписка",
    active: "Живой голос включён",
    working: "Секунду…",
    failed: "Не получилось, попробуйте ещё раз",
  },
  en: {
    signIn: "Sign in",
    getVoice: "Realistic voice",
    signOut: "Sign out",
    buy: "Realistic voice",
    manage: "Subscription",
    active: "Realistic voice on",
    working: "One moment…",
    failed: "That didn't work, try again",
  },
};

export default function AccountBar({ lang }: { lang: Lang }) {
  const [me, setMe] = useState<Me | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const t = COPY[lang];

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/me");
      if (!res.ok) return;
      setMe(await res.json());
    } catch {
      // Offline or the account API is down — leave the bar hidden rather than
      // showing a broken control. The interview itself doesn't depend on this.
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Stripe sends the user back here after checkout. The webhook is what
  // actually records the subscription, and it can land a moment after the
  // redirect, so re-check a few times instead of once.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success") return;
    window.history.replaceState({}, "", window.location.pathname);

    let tries = 0;
    const timer = setInterval(() => {
      tries++;
      void load();
      if (tries >= 5) clearInterval(timer);
    }, 1500);
    return () => clearInterval(timer);
  }, [load]);

  async function signOutNow() {
    await signOut({ redirect: false });
    window.location.reload();
  }

  async function go(endpoint: string) {
    setBusy(true);
    setError(false);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      if (!res.ok) throw new Error(await res.text());
      const { url } = await res.json();
      window.location.href = url;
    } catch {
      setError(true);
      setBusy(false);
    }
  }

  if (!me) return null;

  if (!me.signedIn) {
    return (
      <>
        <div className={styles.bar}>
          <button type="button" className={styles.signInBtn} onClick={() => setAuthOpen(true)}>
            {t.signIn}
          </button>
        </div>
        {authOpen && <AuthDialog lang={lang} onClose={() => setAuthOpen(false)} />}
        <PremiumNotice lang={lang} onSubscribe={() => setAuthOpen(true)} />
      </>
    );
  }

  return (
    <div className={styles.bar}>
      {me.hasSubscription ? (
        <span className={styles.badge}>{t.active}</span>
      ) : (
        <button
          type="button"
          className={styles.cta}
          onClick={() => go("/api/stripe/checkout")}
          disabled={busy}
        >
          {busy ? t.working : t.buy}
        </button>
      )}

      {me.hasBillingAccount && (
        <button
          type="button"
          className={styles.link}
          onClick={() => go("/api/stripe/portal")}
          disabled={busy}
        >
          {t.manage}
        </button>
      )}

      <button type="button" className={styles.link} onClick={() => void signOutNow()}>
        {t.signOut}
      </button>

      {error && <span className={styles.error}>{t.failed}</span>}
      {!me.hasSubscription && <PremiumNotice lang={lang} onSubscribe={() => go("/api/stripe/checkout")} />}
    </div>
  );
}
