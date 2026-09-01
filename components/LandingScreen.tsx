"use client";

import { useEffect, useRef, useState } from "react";
import AccountBar from "./AccountBar";
import AuthDialog from "./AuthDialog";
import LimitDialog from "./LimitDialog";
import styles from "./LandingScreen.module.css";
import { buildInterviewSystemPrompt } from "@/lib/prompts";
import type { Lang } from "@/lib/types";

interface Props {
  onStart: (systemPrompt: string, lang: Lang) => void;
}

interface QAPair {
  q: string;
  a: string;
}

interface Copy {
  nav: { how: string; call: string; report: string; faq: string; cta: string };
  hero: {
    badge: string;
    h1: string;
    sub: string;
    placeholder: string;
    cta: string;
    resumeAdd: string;
    resumeRemove: string;
    resumePlaceholder: string;
    note: string;
  };
  how: {
    eyebrow: string;
    h2: string;
    s1t: string; s1b: string;
    s2t: string; s2b: string;
    s3t: string; s3b: string;
  };
  call: {
    eyebrow: string;
    h2: string;
    input: string;
    labelQ: string;
    labelA: string;
    chipSpeaking: string;
    chipListening: string;
    chipThinking: string;
    pool: QAPair[];
  };
  report: {
    eyebrow: string; h2: string;
    p1: string; p2: string; p3: string;
    cardTitle: string; cardMeta: string;
    q1: string; q2: string; q3: string; q4: string;
    v1t: string; v1b: string;
    v2t: string; v2b: string;
  };
  faq: {
    eyebrow: string; h2: string;
    q1: string; a1: string;
    q2: string; a2: string;
    q3: string; a3: string;
    q4: string; a4: string;
    q5: string; a5: string;
    q6: string; a6: string;
  };
  footer: { eyebrow: string; h2: string; cta: string; note: string };
  validation: string;
}

const COPY: Record<Lang, Copy> = {
  ru: {
    nav: { how: "Как это работает", call: "Звонок", report: "Разбор", faq: "Вопросы", cta: "Начать" },
    hero: {
      badge: "Бесплатно, без регистрации",
      h1: 'Собеседование, на котором можно <span class="accent">облажаться</span>',
      sub: "Первое интервью всегда страшно. Пусть оно случится здесь, а не в реальности.",
      placeholder: "Вставьте текст вакансии",
      cta: "Начать",
      resumeAdd: "Добавить резюме",
      resumeRemove: "Убрать резюме",
      resumePlaceholder: "Вставьте текст резюме (необязательно)",
      note: "AI-собеседник прочитает вакансию и будет спрашивать по ней. Голосом.",
    },
    how: {
      eyebrow: "Как это работает",
      h2: "Три шага",
      s1t: "Вставьте вакансию", s1b: "Любую, которая вам интересна.",
      s2t: "Ответьте вслух", s2b: "Собеседник задаёт вопрос, вы отвечаете голосом. Если говорить неудобно, можно написать.",
      s3t: "Прочитайте разбор", s3b: "Где вы были убедительны, а где стоит поработать над самопрезентацией.",
    },
    call: {
      eyebrow: "Звонок",
      h2: "Здесь придётся говорить вслух",
      input: "Или напишите ответ вместо голоса…",
      labelQ: "Спрашивает",
      labelA: "Вы говорите",
      chipSpeaking: "Собеседник говорит",
      chipListening: "Слушаю вас",
      chipThinking: "Собеседник думает",
      pool: [
        { q: "Расскажите про задачу, где пришлось выбирать между быстрым решением и правильным. Что вы выбрали?",
          a: "Сроки горели, поэтому сделали временное решение и сразу завели тикет на переделку…" },
        { q: "Какую самую неприятную ошибку в продакшене вы находили и как вы её искали?",
          a: "Утечка памяти в фоновом воркере. Нашёл по графикам потребления и дампу кучи…" },
        { q: "Опишите ситуацию, когда вы были не согласны с решением команды. Как вы поступили?",
          a: "Не согласился с выбором библиотеки, собрал прототип на альтернативе и показал цифры…" },
        { q: "Что вы делаете, когда задача поставлена расплывчато, а заказчик недоступен?",
          a: "Выписываю допущения, согласовываю их письменно и делаю минимальную версию…" },
        { q: "Расскажите про случай, когда вы сорвали срок. Что стало причиной?",
          a: "Недооценил интеграцию со сторонним API. Предупредил за неделю и пересобрал план…" },
        { q: "Как вы объясните человеку без технического бэкграунда, чем вы занимаетесь?",
          a: "Говорю, что отвечаю за то, чтобы приложение работало быстро и ничего не ломалось…" },
        { q: "Почему вы уходите с текущего места?",
          a: "Продукт перешёл в поддержку, новых задач почти нет, расти стало некуда…" },
        { q: "Где вы сейчас видите свой профессиональный потолок?",
          a: "Слабо знаю инфраструктуру, поэтому в архитектурных спорах чувствую себя неуверенно…" },
        { q: "Как вы понимаете, что ваше решение сработало? На какие метрики смотрите?",
          a: "Смотрю на конверсию в целевое действие и на количество обращений в поддержку…" },
        { q: "Что вы делаете, если на код-ревью получаете жёсткий комментарий, с которым не согласны?",
          a: "Прошу пояснить аргумент, а если в переписке буксуем, зову обсудить голосом…" },
      ],
    },
    report: {
      eyebrow: "После звонка",
      h2: "Обратная связь, которую на настоящем интервью вам не дадут",
      p1: "Оценка по каждому ответу",
      p2: "Что прозвучало убедительно",
      p3: "Над чем поработать в самопрезентации",
      cardTitle: "Итоги собеседования",
      cardMeta: "Frontend-разработчик, React/TypeScript · 6 вопросов",
      q1: "Оптимизация рендеринга дашборда",
      q2: "Типизация ответов API",
      q3: "Конфликт в команде на код-ревью",
      q4: "Тестирование компонентов",
      v1t: "Сильная сторона",
      v1b: "Отвечая про оптимизацию, вы назвали инструмент и конкретные цифры. Так ответ звучит убедительно, и уточнять уже нечего.",
      v2t: "Слабое место",
      v2b: "В истории про конфликт вы описали ситуацию, но не сказали, что сделали сами. Здесь ждали вашу роль и чем всё закончилось.",
    },
    faq: {
      eyebrow: "Частые вопросы",
      h2: "Да, бесплатно. Нет, вас никто не слушает.",
      q1: "Это точно бесплатно?",
      a1: "Да. Без карты, без подписки, без регистрации. Открыли, вставили вакансию, начали.",
      q2: "Мои данные видны кому-то?",
      a2: "Аккаунтов и базы данных нет, поэтому сохранять вас просто некуда. Вакансия, ответы и разбор живут во вкладке браузера. Закрыли вкладку, и они исчезли. При этом текст обрабатывает языковая модель, которая ведёт разговор, как в любом AI-сервисе. Поэтому не вставляйте то, что не должно попасть к третьей стороне.",
      q3: "А если я не знаю, что отвечать?",
      a3: "Так и скажите. Собеседник переспросит и зайдёт с другой стороны, а в разборе вы увидите, какого ответа здесь ждали.",
      q4: "Нужен микрофон?",
      a4: "Не обязательно. Отвечать можно текстом прямо во время звонка.",
      q5: "Сколько это длится?",
      a5: "Приветствие, шесть вопросов и прощание. Обычно это 5–10 минут. Бросить можно в любой момент, разбор всё равно придёт.",
      q6: "В каком браузере работает?",
      a6: "Голос работает в Chrome. В остальных браузерах разговор идёт текстом, а разбор получается тот же.",
    },
    footer: {
      eyebrow: "Осталось одно действие",
      h2: 'Облажайтесь сейчас, бесплатно и без <span class="accent">свидетелей</span>',
      cta: "Начать",
      note: "Без регистрации · Работает в браузере · Ничего не сохраняем",
    },
    validation: "Сначала вставьте текст вакансии",
  },

  en: {
    nav: { how: "How it works", call: "The call", report: "Feedback", faq: "FAQ", cta: "Start" },
    hero: {
      badge: "Free, no sign-up",
      h1: 'The interview where you\'re allowed to <span class="accent">blow it</span>',
      sub: "A first interview is always frightening. Better it happens here than for real.",
      placeholder: "Paste the job post",
      cta: "Start",
      resumeAdd: "Add your CV",
      resumeRemove: "Remove CV",
      resumePlaceholder: "Paste your CV (optional)",
      note: "An AI interviewer reads the post and asks about it. Out loud.",
    },
    how: {
      eyebrow: "How it works",
      h2: "Three steps",
      s1t: "Paste a job post", s1b: "Any one you're curious about.",
      s2t: "Answer out loud", s2b: "It asks a question, you answer with your voice. If speaking is awkward, you can type instead.",
      s3t: "Read the feedback", s3b: "Where you sounded convincing, and where your self-presentation needs work.",
    },
    call: {
      eyebrow: "The call",
      h2: "Here you have to say it out loud",
      input: "Or type your answer instead…",
      labelQ: "Asking",
      labelA: "You're speaking",
      chipSpeaking: "Interviewer speaking",
      chipListening: "Listening",
      chipThinking: "Thinking",
      pool: [
        { q: "Tell me about a task where you had to choose between the quick fix and the right one. Which did you pick?",
          a: "We were out of runway, so we shipped the quick fix and filed a ticket to redo it…" },
        { q: "What's the nastiest production bug you've found, and how did you track it down?",
          a: "A memory leak in a background worker. Found it from usage graphs and a heap dump…" },
        { q: "Describe a time you disagreed with a team decision. What did you do?",
          a: "I disagreed on a library choice, built a prototype with the alternative and showed numbers…" },
        { q: "What do you do when a task is vague and the stakeholder is unreachable?",
          a: "I write down my assumptions, confirm them in writing and build the smallest version…" },
        { q: "Tell me about a deadline you missed. What caused it?",
          a: "I underestimated a third-party integration. Flagged it a week ahead and replanned…" },
        { q: "How would you explain what you do to someone with no technical background?",
          a: "I say I make sure the app stays fast and doesn't fall over…" },
        { q: "Why are you leaving your current job?",
          a: "The product moved into maintenance, there's little new work and nowhere to grow…" },
        { q: "Where do you see the ceiling of your skills right now?",
          a: "My infrastructure knowledge is thin, so architecture debates make me uneasy…" },
        { q: "How do you know your solution worked? Which metrics do you look at?",
          a: "Conversion into the target action, plus how many support tickets it generates…" },
        { q: "What do you do when a code review comment is harsh and you disagree with it?",
          a: "I ask for the reasoning, and if the thread stalls I move it to a call…" },
      ],
    },
    report: {
      eyebrow: "After the call",
      h2: "The feedback a real interview never gives you",
      p1: "A score for every answer",
      p2: "What sounded convincing",
      p3: "What to work on in your self-presentation",
      cardTitle: "Interview summary",
      cardMeta: "Frontend Developer, React/TypeScript · 6 questions",
      q1: "Dashboard render optimisation",
      q2: "Typing API responses",
      q3: "Team conflict in code review",
      q4: "Component testing",
      v1t: "Strong point",
      v1b: "On the optimisation question you named the tool and real numbers. That makes the answer land, and leaves nothing to follow up on.",
      v2t: "Weak point",
      v2b: "On the conflict you described the situation but never said what you did yourself. They were waiting for your part in it and how it ended.",
    },
    faq: {
      eyebrow: "FAQ",
      h2: "Yes, free. No, nobody's listening.",
      q1: "Is this really free?",
      a1: "Yes. No card, no subscription, no sign-up. Open it, paste a job post, start.",
      q2: "Can anyone see my data?",
      a2: "There are no accounts and no database, so there is nowhere to store you. The job post, your answers and the feedback live in your browser tab. Close the tab and they are gone. The text is processed by the language model running the conversation, as with any AI service. So don't paste anything that shouldn't reach a third party.",
      q3: "What if I don't know what to say?",
      a3: "Say exactly that. It will rephrase and come at the topic from another angle, and the feedback will show you what the answer should have been.",
      q4: "Do I need a microphone?",
      a4: "Not necessarily. You can type your answers during the call.",
      q5: "How long does it take?",
      a5: "A greeting, six questions and a goodbye. Usually 5–10 minutes. Quit whenever you like, the feedback still comes.",
      q6: "Which browser do I need?",
      a6: "Voice works in Chrome. In other browsers the conversation runs as text and the feedback is the same.",
    },
    footer: {
      eyebrow: "One thing left to do",
      h2: 'Blow it now, for free, with nobody <span class="accent">watching</span>',
      cta: "Start",
      note: "No sign-up · Runs in your browser · Nothing is stored",
    },
    validation: "Paste a job post first",
  },
};

function detectLang(): Lang {
  try {
    const saved = localStorage.getItem("rehearsio-lang");
    if (saved === "ru" || saved === "en") return saved;
  } catch {
    // private mode — fall through to detection
  }
  if (typeof navigator === "undefined") return "ru";
  const nav = (navigator.languages && navigator.languages[0]) || navigator.language || "ru";
  return nav.toLowerCase().startsWith("ru") ? "ru" : "en";
}

function withAccent(html: string, accentClass: string) {
  return html.replace(/class="accent"/g, `class="${accentClass}"`);
}

function shuffle(n: number): number[] {
  const a = Array.from({ length: n }, (_, i) => i);
  for (let j = a.length - 1; j > 0; j--) {
    const k = Math.floor(Math.random() * (j + 1));
    [a[j], a[k]] = [a[k], a[j]];
  }
  return a;
}

/** Grows a textarea from one line up to a cap as its value changes, and
 * reports whether it has grown past one line (pill -> card) or hit the cap
 * (needs its own scrollbar). Mirrors the standalone prototype's behaviour. */
function useAutoGrow(value: string) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const oneLineRef = useRef(0);
  const [open, setOpen] = useState(false);
  const [full, setFull] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    if (!oneLineRef.current) oneLineRef.current = el.scrollHeight;
    const wanted = el.scrollHeight;
    el.style.height = Math.min(wanted, 220) + "px";
    setOpen(wanted > oneLineRef.current + 4);
    setFull(wanted > 220);
  }, [value]);

  return { ref, open, full };
}

export default function LandingScreen({ onStart }: Props) {
  const [lang, setLang] = useState<Lang>("ru");
  const [vacancy, setVacancy] = useState("");
  const [resume, setResume] = useState("");
  const [resumeOpen, setResumeOpen] = useState(false);
  const [flash, setFlash] = useState(false);

  const t = COPY[lang];

  const vacancyGrow = useAutoGrow(vacancy);
  const resumeGrow = useAutoGrow(resume);

  const heroCtaRef = useRef<HTMLButtonElement | null>(null);
  const footerCtaRef = useRef<HTMLButtonElement | null>(null);
  const [navAccent, setNavAccent] = useState(false);
  const [starting, setStarting] = useState(false);
  const [limitHit, setLimitHit] = useState<null | "anonymous" | "free">(null);
  const [authOpen, setAuthOpen] = useState(false);

  const mockRef = useRef<HTMLDivElement | null>(null);
  const chipRef = useRef<HTMLSpanElement | null>(null);
  const labelRef = useRef<HTMLSpanElement | null>(null);
  const transcriptRef = useRef<HTMLParagraphElement | null>(null);
  const [callTimer, setCallTimer] = useState(252);

  useEffect(() => {
    setLang(detectLang());
  }, []);

  function changeLang(next: Lang) {
    setLang(next);
    try {
      localStorage.setItem("rehearsio-lang", next);
    } catch {
      // choice just won't persist
    }
  }

  function scrollToHero() {
    document.getElementById("hero")?.scrollIntoView({
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      block: "start",
    });
  }

  async function handleStart() {
    const text = vacancy.trim();
    if (!text) {
      scrollToHero();
      setTimeout(() => vacancyGrow.ref.current?.focus(), 380);
      setFlash(true);
      setTimeout(() => setFlash(false), 1000);
      return;
    }

    // Claim the run before starting. The server decides — a client-side check
    // would be trivially bypassed, and this endpoint is also what mints the
    // anonymous visitor cookie.
    setStarting(true);
    try {
      const res = await fetch("/api/usage", { method: "POST" });
      if (res.status === 402) {
        const usage = await res.json().catch(() => null);
        setLimitHit(usage?.tier === "anonymous" ? "anonymous" : "free");
        setStarting(false);
        return;
      }
      if (!res.ok) throw new Error("usage check failed");
    } catch {
      // Usage service unreachable: let the interview through rather than
      // blocking a legitimate user over our own outage. The paid voice is
      // still gated server-side, so this can't leak the premium feature.
    }
    setStarting(false);
    onStart(buildInterviewSystemPrompt(text, resume.trim(), lang), lang);
  }

  function toggleResume() {
    setResumeOpen((prev) => {
      const next = !prev;
      if (next) requestAnimationFrame(() => resumeGrow.ref.current?.focus());
      return next;
    });
  }

  // Exactly one violet CTA fill on screen at a time (DESIGN.md): the nav CTA
  // is mounted only while neither the hero nor the footer CTA is visible.
  //
  // Measured from scroll position rather than IntersectionObserver on purpose.
  // The nav button's existence depends on this, not just its colour, so an
  // observer that silently never fires (which happens in some embedded and
  // headless browsers) would mean no header CTA at all, anywhere on the page.
  // Rect maths on scroll always runs.
  useEffect(() => {
    // innerHeight can report 0 in embedded/headless viewports, which would
    // make every element measure as off screen and pin the header CTA on.
    // clientHeight is the layout viewport and is the more dependable of the
    // two; if both are 0 there is nothing meaningful to measure against.
    const viewportHeight = () =>
      document.documentElement.clientHeight || window.innerHeight || 0;

    const isOnScreen = (el: HTMLElement | null, vh: number) => {
      if (!el) return false;
      const r = el.getBoundingClientRect();
      return r.bottom > 0 && r.top < vh;
    };

    const update = () => {
      const vh = viewportHeight();
      if (!vh) return; // Can't measure yet — keep whatever state we had.
      setNavAccent(
        !isOnScreen(heroCtaRef.current, vh) && !isOnScreen(footerCtaRef.current, vh)
      );
    };

    update();
    // On mount the web font usually hasn't landed yet, so the hero CTA can
    // still measure as a zero-height box — which reads as "off screen" and
    // would leave the header CTA showing at the top of the page until the
    // first scroll. Re-measure whenever the layout actually changes.
    const ro =
      typeof ResizeObserver !== "undefined"
        ? new ResizeObserver(update)
        : null;
    if (ro) {
      ro.observe(document.body);
      if (heroCtaRef.current) ro.observe(heroCtaRef.current);
    }
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    window.addEventListener("load", update);
    return () => {
      ro?.disconnect();
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      window.removeEventListener("load", update);
    };
  }, []);

  // Decorative call timer, purely for the marketing mock.
  useEffect(() => {
    const id = setInterval(() => setCallTimer((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Live call mock: cycles a shuffled pool of real interview questions with
  // their answers, so the preview shows the kind of thing that actually gets
  // asked. Rebuilt on every language switch so the demo speaks the page's
  // language; DOM text is written directly via refs (not React state) so the
  // per-character typing effect doesn't re-render the whole tree 24ms.
  useEffect(() => {
    const mock = mockRef.current;
    const chipEl = chipRef.current;
    const labelEl = labelRef.current;
    const lineEl = transcriptRef.current;
    if (!mock || !chipEl || !labelEl || !lineEl) return;

    const pool = t.call.pool;
    const order = shuffle(pool.length);
    let cursor = 0;
    let step = 0;
    let running = false;
    let typeTimer: ReturnType<typeof setInterval> | null = null;
    let holdTimer: ReturnType<typeof setTimeout> | null = null;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function currentBeat() {
      const pair = pool[order[cursor] % pool.length];
      if (step === 0) return { state: "speaking", chip: t.call.chipSpeaking, label: t.call.labelQ, text: pair.q, hold: 3800 };
      if (step === 1) return { state: "listening", chip: t.call.chipListening, label: t.call.labelA, text: pair.a, hold: 3000 };
      return { state: "thinking", chip: t.call.chipThinking, label: t.call.labelQ, text: "", hold: 1100 };
    }

    function clearTimers() {
      if (typeTimer) { clearInterval(typeTimer); typeTimer = null; }
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    }

    function paint(b: ReturnType<typeof currentBeat>) {
      mock!.setAttribute("data-state", b.state);
      chipEl!.textContent = b.chip;
      labelEl!.textContent = b.label;
    }

    function typeOut(text: string, done: () => void) {
      lineEl!.textContent = "";
      if (reduced || !text) {
        lineEl!.textContent = text;
        done();
        return;
      }
      let i = 0;
      const caret = document.createElement("span");
      caret.className = styles.caret;
      lineEl!.appendChild(caret);
      typeTimer = setInterval(() => {
        i += 1;
        caret.remove();
        lineEl!.textContent = text.slice(0, i);
        if (i < text.length) {
          lineEl!.appendChild(caret);
        } else {
          if (typeTimer) clearInterval(typeTimer);
          typeTimer = null;
          done();
        }
      }, 24);
    }

    function playBeat() {
      const b = currentBeat();
      paint(b);
      clearTimers();
      typeOut(b.text, () => {
        holdTimer = setTimeout(() => {
          step += 1;
          if (step > 2) {
            step = 0;
            cursor = (cursor + 1) % order.length;
          }
          playBeat();
        }, b.hold);
      });
    }

    function paintStatic() {
      const b = currentBeat();
      paint(b);
      lineEl!.textContent = b.text;
    }

    function start() {
      if (running) return;
      running = true;
      playBeat();
    }

    paintStatic();

    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window) {
      io = new IntersectionObserver(
        (entries) => {
          if (entries[0].isIntersecting) start();
        },
        { threshold: 0.25 }
      );
      io.observe(mock);
    } else {
      start();
    }

    // IntersectionObserver never fires while the document is hidden (page
    // opened in a background tab), so re-check once it actually becomes
    // visible instead of leaving the demo frozen on its first frame.
    function onVisible() {
      if (document.visibilityState !== "visible") return;
      const r = mock!.getBoundingClientRect();
      if (r.top < window.innerHeight && r.bottom > 0) start();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimers();
      io?.disconnect();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [lang, t.call]);

  const timerLabel = `${String(Math.floor(callTimer / 60)).padStart(2, "0")}:${String(callTimer % 60).padStart(2, "0")}`;

  return (
    <div className={styles.page}>
      {limitHit && (
        <LimitDialog
          lang={lang}
          tier={limitHit}
          onClose={() => setLimitHit(null)}
          onSignUp={() => {
            setLimitHit(null);
            setAuthOpen(true);
          }}
          onSubscribe={async () => {
            setLimitHit(null);
            try {
              const res = await fetch("/api/stripe/checkout", { method: "POST" });
              if (res.status === 401) {
                // Not signed in yet: a subscription needs an account to
                // attach to, so collect that first.
                setAuthOpen(true);
                return;
              }
              const { url } = await res.json();
              window.location.href = url;
            } catch {
              setAuthOpen(true);
            }
          }}
        />
      )}
      {authOpen && <AuthDialog lang={lang} initialMode="signup" onClose={() => setAuthOpen(false)} />}

      <header className={styles.navWrap}>
        <div className={styles.shell}>
          <nav className={styles.nav}>
            <span className={styles.wordmark}>
              <span className={styles.dot} />
              Rehearsio
            </span>
            {/* No "call" link any more — the call preview lives in the hero
                rather than in a section of its own. */}
            <div className={styles.navLinks}>
              <a href="#how">{t.nav.how}</a>
              <a href="#report">{t.nav.report}</a>
              <a href="#faq">{t.nav.faq}</a>
            </div>
            <div className={styles.lang}>
              <button type="button" aria-pressed={lang === "ru"} onClick={() => changeLang("ru")}>
                RU
              </button>
              <span className={styles.sep}>·</span>
              <button type="button" aria-pressed={lang === "en"} onClick={() => changeLang("en")}>
                EN
              </button>
            </div>
            <AccountBar lang={lang} />
            {navAccent && (
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSm} ${styles.btnAccent} ${styles.navCta}`}
                onClick={handleStart}
                disabled={starting}
              >
                {t.nav.cta}
              </button>
            )}
          </nav>
        </div>
      </header>

      <main>
        {/* ===================== HERO =====================
            Copy left, live call preview right. Showing the product beside the
            pitch replaces what used to be a separate full-height section. */}
        <section id="hero" className={`${styles.shell} ${styles.hero}`}>
          <div className={styles.heroCopy}>
            <div className={styles.badgeRow}>
              <span className={styles.freeBadge}>{t.hero.badge}</span>
            </div>
            <h1
              className={styles.hDisplay}
              dangerouslySetInnerHTML={{ __html: withAccent(t.hero.h1, styles.accentWord) }}
            />
            <p className={styles.lede}>{t.hero.sub}</p>

            <div className={styles.paste}>
              <div
                className={[
                  styles.pasteField,
                  vacancyGrow.open ? styles.open : "",
                  vacancyGrow.full ? styles.full : "",
                  flash ? styles.flash : "",
                ].join(" ").trim()}
              >
                <textarea
                  ref={vacancyGrow.ref}
                  rows={1}
                  // Mirrors the server-side ceiling in app/api/chat/route.ts, so
                  // an oversized paste is stopped here rather than coming back as
                  // an opaque error mid-call.
                  maxLength={10000}
                  value={vacancy}
                  onChange={(e) => setVacancy(e.target.value)}
                  placeholder={t.hero.placeholder}
                  aria-label={t.hero.placeholder}
                />
              </div>

              {resumeOpen && (
                <div
                  className={[
                    styles.pasteField,
                    resumeGrow.open ? styles.open : "",
                    resumeGrow.full ? styles.full : "",
                  ].join(" ").trim()}
                >
                  <textarea
                    ref={resumeGrow.ref}
                    rows={1}
                    maxLength={10000}
                    value={resume}
                    onChange={(e) => setResume(e.target.value)}
                    placeholder={t.hero.resumePlaceholder}
                    aria-label={t.hero.resumePlaceholder}
                  />
                </div>
              )}

              <div className={styles.pasteActions}>
                <button
                  ref={heroCtaRef}
                  type="button"
                  className={`${styles.btn} ${styles.btnAccent}`}
                  onClick={handleStart}
                  disabled={starting}
                >
                  {t.hero.cta}
                </button>
                <button type="button" className={`${styles.btn} ${styles.btnGhost}`} onClick={toggleResume}>
                  {resumeOpen ? t.hero.resumeRemove : t.hero.resumeAdd}
                </button>
              </div>
              <p className={styles.heroNote}>{t.hero.note}</p>
            </div>
          </div>

          <div className={styles.heroDemo}>
            <span className={styles.demoLabel}>{t.call.h2}</span>
            <div ref={mockRef} className={styles.callMock} data-state="speaking">
              <div className={styles.callTop}>
                <div className={styles.orbHolder}>
                  <span className={styles.orbRing} />
                  <span className={styles.orbRing} />
                  <span className={styles.orb}>
                    <span className={styles.wave} aria-hidden="true">
                      <span /><span /><span /><span /><span />
                    </span>
                  </span>
                </div>
                <div className={styles.callMeta}>
                  <span className={styles.callTimer}>{timerLabel}</span>
                  <span ref={chipRef} className={styles.stateChip} />
                </div>
              </div>

              <div>
                <span ref={labelRef} className={styles.transcriptLabel} />
                <p ref={transcriptRef} className={styles.transcript} />
              </div>

              <div className={styles.callInputRow}>
                <span className={styles.callInput}>{t.call.input}</span>
                <span className={styles.endCall} aria-hidden="true">✕</span>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== HOW ===================== */}
        <section id="how" className={`${styles.shell} ${styles.section} ${styles.ruled}`}>
          <div className={styles.sectionHead}>
            <span className={styles.eyebrow}>{t.how.eyebrow}</span>
            <h2 className={styles.hSection}>{t.how.h2}</h2>
          </div>

          <ol className={styles.steps}>
            <li className={styles.step}>
              <span className={styles.stepNum}>1</span>
              <h3 className={styles.hCard}>{t.how.s1t}</h3>
              <p>{t.how.s1b}</p>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>2</span>
              <h3 className={styles.hCard}>{t.how.s2t}</h3>
              <p>{t.how.s2b}</p>
            </li>
            <li className={styles.step}>
              <span className={styles.stepNum}>3</span>
              <h3 className={styles.hCard}>{t.how.s3t}</h3>
              <p>{t.how.s3b}</p>
            </li>
          </ol>
        </section>

        {/* ===================== REPORT (decorative preview) ===================== */}
        <section id="report" className={`${styles.shell} ${styles.section} ${styles.ruled}`}>
          <div className={styles.splitReport}>
            <div>
              <span className={styles.eyebrow}>{t.report.eyebrow}</span>
              <h2 className={styles.hSection} style={{ marginTop: "var(--gap-sm)" }}>
                {t.report.h2}
              </h2>
              <div className={styles.reportPoints}>
                <div className={styles.reportPoint}><span className={styles.pointDot} /><p>{t.report.p1}</p></div>
                <div className={styles.reportPoint}><span className={styles.pointDot} /><p>{t.report.p2}</p></div>
                <div className={styles.reportPoint}><span className={styles.pointDot} /><p>{t.report.p3}</p></div>
              </div>
            </div>

            <div className={`${styles.card} ${styles.reportCard}`}>
              <div className={styles.reportHead}>
                <div>
                  <span className={styles.eyebrow}>{t.report.cardTitle}</span>
                  <p className={`${styles.bodySm} ${styles.muted}`}>{t.report.cardMeta}</p>
                </div>
                <span className={styles.scoreTotal}>6,5 / 10</span>
              </div>

              <div className={styles.qRows}>
                <div className={styles.qRow}>
                  <p>{t.report.q1}</p>
                  <div className={styles.qMeter}>
                    <span className={styles.meterTrack}><span className={styles.meterFill} style={{ width: "80%" }} /></span>
                    <span className={styles.qScore}>8/10</span>
                  </div>
                </div>
                <div className={styles.qRow}>
                  <p>{t.report.q2}</p>
                  <div className={styles.qMeter}>
                    <span className={styles.meterTrack}><span className={styles.meterFill} style={{ width: "70%" }} /></span>
                    <span className={styles.qScore}>7/10</span>
                  </div>
                </div>
                <div className={styles.qRow}>
                  <p>{t.report.q3}</p>
                  <div className={styles.qMeter}>
                    <span className={styles.meterTrack}><span className={styles.meterFill} style={{ width: "40%" }} /></span>
                    <span className={styles.qScore}>4/10</span>
                  </div>
                </div>
                <div className={styles.qRow}>
                  <p>{t.report.q4}</p>
                  <div className={styles.qMeter}>
                    <span className={styles.meterTrack}><span className={styles.meterFill} style={{ width: "50%" }} /></span>
                    <span className={styles.qScore}>5/10</span>
                  </div>
                </div>
              </div>

              <div className={styles.verdicts}>
                <div className={styles.verdict}>
                  <h4>{t.report.v1t}</h4>
                  <p>{t.report.v1b}</p>
                </div>
                <div className={styles.verdict}>
                  <h4>{t.report.v2t}</h4>
                  <p>{t.report.v2b}</p>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ===================== FAQ ===================== */}
        <section id="faq" className={`${styles.shell} ${styles.section} ${styles.ruled}`}>
          <div className={styles.faqHead}>
            <span className={styles.eyebrow}>{t.faq.eyebrow}</span>
            <h2 className={styles.hSection}>{t.faq.h2}</h2>
          </div>

          <div className={styles.faqList}>
            {[1, 2, 3, 4, 5, 6].map((n) => {
              const qKey = `q${n}` as keyof Copy["faq"];
              const aKey = `a${n}` as keyof Copy["faq"];
              return (
                <details key={n} className={styles.faqItem} open={n === 1}>
                  <summary className={styles.faqQ}>
                    <span>{t.faq[qKey]}</span>
                    <span className={styles.faqSign} />
                  </summary>
                  <p className={styles.faqA}>{t.faq[aKey]}</p>
                </details>
              );
            })}
          </div>
        </section>
      </main>

      <footer className={`${styles.shell} ${styles.footer}`}>
        <div className={styles.footerCta}>
          <div>
            <span className={styles.eyebrow}>{t.footer.eyebrow}</span>
            <h2
              className={styles.hSection}
              style={{ marginTop: "8px" }}
              dangerouslySetInnerHTML={{ __html: withAccent(t.footer.h2, styles.accentWord) }}
            />
          </div>
          <div className={styles.footerRight}>
            <button
              ref={footerCtaRef}
              type="button"
              className={`${styles.btn} ${styles.btnAccent}`}
              onClick={handleStart}
              disabled={starting}
            >
              {t.footer.cta}
            </button>
            <p className={styles.heroNote}>{t.footer.note}</p>
          </div>
        </div>

        <div className={styles.footerBar}>
          <div className={styles.footerLockup}>
            <span className={styles.wordmark}>
              <span className={styles.dot} />
              Rehearsio
            </span>
            <span className={styles.tagline}>Your interview. Rehearsed.</span>
          </div>
          <nav>
            <a href="#how">{t.nav.how}</a>
            <a href="#report">{t.nav.report}</a>
            <a href="#faq">{t.nav.faq}</a>
          </nav>
        </div>
      </footer>
    </div>
  );
}
