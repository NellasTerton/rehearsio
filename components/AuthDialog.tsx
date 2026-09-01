"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";

import type { Lang } from "@/lib/types";

import styles from "./AuthDialog.module.css";

type Mode = "signin" | "signup";

const COPY = {
  ru: {
    signinTitle: "С возвращением",
    signinSub: "Войдите, чтобы получать бесплатное интервью каждый день.",
    signupTitle: "Регистрация",
    signupSub: "Бесплатное интервью каждый день вместо одного-единственного.",
    email: "Почта",
    password: "Пароль",
    name: "Имя",
    namePh: "Как к вам обращаться",
    signinBtn: "Войти",
    signupBtn: "Создать аккаунт",
    google: "Continue with Google",
    or: "или",
    toSignup: "Нет аккаунта?",
    toSignin: "Уже есть аккаунт?",
    signupLink: "Зарегистрироваться",
    signinLink: "Войти",
    working: "Секунду…",
    errBadCreds: "Почта или пароль не подходят.",
    errExists: "Такая почта уже зарегистрирована. Попробуйте войти.",
    errWeak: "Пароль должен быть не короче 8 символов.",
    errEmail: "Проверьте адрес почты.",
    errGeneric: "Что-то пошло не так. Попробуйте ещё раз.",
  },
  en: {
    signinTitle: "Welcome back",
    signinSub: "Sign in to get a free interview every day.",
    signupTitle: "Create an account",
    signupSub: "A free interview every day instead of just one.",
    email: "Email",
    password: "Password",
    name: "Name",
    namePh: "What should we call you",
    signinBtn: "Sign in",
    signupBtn: "Create account",
    google: "Continue with Google",
    or: "or",
    toSignup: "No account yet?",
    toSignin: "Already have an account?",
    signupLink: "Sign up",
    signinLink: "Sign in",
    working: "One moment…",
    errBadCreds: "That email or password doesn't match.",
    errExists: "That email is already registered. Try signing in.",
    errWeak: "Password must be at least 8 characters.",
    errEmail: "Check the email address.",
    errGeneric: "Something went wrong. Please try again.",
  },
} as const;

export default function AuthDialog({
  lang,
  initialMode = "signin",
  onClose,
}: {
  lang: Lang;
  initialMode?: Mode;
  onClose: () => void;
}) {
  const t = COPY[lang];
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");

    try {
      if (mode === "signup") {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, name }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          if (data.error === "already_registered") setError(t.errExists);
          else if (data.error === "weak_password") setError(t.errWeak);
          else if (data.error === "invalid_email") setError(t.errEmail);
          else setError(t.errGeneric);
          setBusy(false);
          return;
        }
      }

      // Both paths end the same way: sign the person in straight after
      // registering, so they never have to type the password twice.
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        setError(t.errBadCreds);
        setBusy(false);
        return;
      }
      window.location.reload();
    } catch {
      setError(t.errGeneric);
      setBusy(false);
    }
  }

  return (
    <div
      className={styles.backdrop}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.card} role="dialog" aria-modal="true">
        <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
          ×
        </button>
        <h2 className={styles.title}>{mode === "signin" ? t.signinTitle : t.signupTitle}</h2>
        <p className={styles.subtitle}>{mode === "signin" ? t.signinSub : t.signupSub}</p>

        {error && <div className={styles.error}>{error}</div>}

        <button type="button" className={styles.googleBtn} onClick={() => signIn("google")}>
          {t.google}
        </button>

        <div className={styles.divider}>{t.or}</div>

        <form onSubmit={submit}>
          {mode === "signup" && (
            <label className={styles.field}>
              <span className={styles.label}>{t.name}</span>
              <input
                className={styles.input}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={t.namePh}
                maxLength={100}
              />
            </label>
          )}
          <label className={styles.field}>
            <span className={styles.label}>{t.email}</span>
            <input
              className={styles.input}
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              maxLength={254}
            />
          </label>
          <label className={styles.field}>
            <span className={styles.label}>{t.password}</span>
            <input
              className={styles.input}
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
              maxLength={200}
            />
          </label>
          <button type="submit" className={styles.primary} disabled={busy}>
            {busy ? t.working : mode === "signin" ? t.signinBtn : t.signupBtn}
          </button>
        </form>

        <div className={styles.switch}>
          {mode === "signin" ? t.toSignup : t.toSignin}{" "}
          <button
            type="button"
            className={styles.switchBtn}
            onClick={() => {
              setMode(mode === "signin" ? "signup" : "signin");
              setError("");
            }}
          >
            {mode === "signin" ? t.signupLink : t.signinLink}
          </button>
        </div>
      </div>
    </div>
  );
}
