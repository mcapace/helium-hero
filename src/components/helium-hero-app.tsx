"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";

type ChatMessage = { role: "user" | "assistant"; content: string };

type VoiceStatus = "Ready" | "Speaking..." | "Thinking...";

const QUICK_PROMPTS: { label: string; text: string }[] = [
  { label: "⚡ Superpowers", text: "What superpowers do you have as helium?" },
  { label: "🌍 Where found", text: "Where is helium found in nature?" },
  { label: "🎈 Why balloons float", text: "Why do helium balloons float?" },
  { label: "🔬 Discovery", text: "How was helium discovered?" },
  { label: "🏆 Noble gas", text: "What makes helium a noble gas?" },
];

const FAST_FACTS = [
  {
    title: "Boiling point",
    body: "Helium stays a liquid only under pressure — at normal pressure it boils at about −268.9 °C (−452 °F), the coldest of any element.",
  },
  {
    title: "Universe abundance",
    body: "After hydrogen, helium is the second most common element in the universe, forged in the Big Bang and in stars.",
  },
  {
    title: "Discovery year",
    body: "Astronomers saw its fingerprint in sunlight during an eclipse in 1868; it was later named after Helios, the Greek sun god.",
  },
  {
    title: "Why balloons float",
    body: "Helium is lighter than air, so a balloon filled with it gets pushed upward by buoyancy — like a cork in water.",
  },
  {
    title: "MRI machines",
    body: "Super‑cold liquid helium cools superconducting magnets in MRI scanners, helping doctors peek inside the body safely.",
  },
  {
    title: "NASA & rockets",
    body: "Liquid helium helps keep rocket fuel tanks cold and pressurized so spacecraft can launch and explore.",
  },
];

const BALLOONS = ["🎈", "🎈", "🎈", "🎈", "🎈", "🎈", "🎈", "🎈"];

function speakText(
  text: string,
  onStart: () => void,
  onEnd: () => void,
) {
  if (typeof window === "undefined" || !window.speechSynthesis) {
    onEnd();
    return;
  }
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = 1;
  utterance.pitch = 1.05;
  utterance.onstart = onStart;
  utterance.onend = onEnd;
  utterance.onerror = onEnd;
  window.speechSynthesis.speak(utterance);
}

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Hey there, science star! I’m Helium Hero — ask me anything about helium, the universe, or why balloons love floating. 🎈",
};

export function HeliumHeroApp() {
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("Ready");
  const [speaking, setSpeaking] = useState(false);
  const [heroBroken, setHeroBroken] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const threadRef = useRef<ChatMessage[]>([]);

  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      listRef.current?.scrollTo({
        top: listRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [thread, loading, scrollToBottom]);

  useEffect(() => {
    setVoiceStatus(loading ? "Thinking..." : speaking ? "Speaking..." : "Ready");
  }, [loading, speaking]);

  const sendChat = useCallback(async (userText: string) => {
    const trimmed = userText.trim();
    if (!trimmed || inFlightRef.current) return;
    inFlightRef.current = true;

    const nextMessages: ChatMessage[] = [
      ...threadRef.current,
      { role: "user", content: trimmed },
    ];
    setThread(nextMessages);

    setLoading(true);
    setSpeaking(false);
    if (typeof window !== "undefined" && window.speechSynthesis) {
      window.speechSynthesis.cancel();
    }

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: nextMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
        }),
      });
      const data = (await res.json()) as {
        reply?: string;
        error?: string;
        detail?: string;
      };
      if (!res.ok) {
        const errDetail =
          typeof data.detail === "string"
            ? data.detail
            : (data.error ?? "Chat request failed");
        throw new Error(errDetail);
      }
      const reply = data.reply ?? "";
      setThread((prev) => [...prev, { role: "assistant", content: reply }]);
      speakText(
        reply,
        () => setSpeaking(true),
        () => setSpeaking(false),
      );
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Something went wrong. Try again!";
      setThread((prev) => [
        ...prev,
        {
          role: "assistant",
          content: `Oops — I hit a snag: ${msg}. Check your API key on the server and try again. ⚡`,
        },
      ]);
    } finally {
      inFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input;
    setInput("");
    void sendChat(t);
  };

  return (
    <div className="relative min-h-screen overflow-x-hidden text-zinc-100">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[#0a0a1a]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -left-32 top-1/4 -z-10 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(244,114,182,0.45),transparent_60%)] blur-3xl animate-orb-a"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -right-40 bottom-1/4 -z-10 h-[480px] w-[480px] rounded-full bg-[radial-gradient(circle_at_40%_40%,rgba(34,211,238,0.4),transparent_55%)] blur-[80px] animate-orb-b"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed left-1/3 top-10 -z-10 h-[320px] w-[320px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.35),transparent_65%)] blur-[72px] animate-orb-a"
        aria-hidden
      />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[45vh] overflow-hidden">
        {BALLOONS.map((b, i) => (
          <span
            key={i}
            className="absolute bottom-0 text-3xl sm:text-4xl opacity-70 animate-float-balloon drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]"
            style={{
              left: `${8 + i * 11}%`,
              animationDuration: `${14 + (i % 5) * 3}s`,
              animationDelay: `${i * 1.2}s`,
            }}
            aria-hidden
          >
            {b}
          </span>
        ))}
      </div>

      <main className="relative z-10 mx-auto flex min-h-screen max-w-3xl flex-col px-4 pb-52 pt-8 sm:px-6 sm:pb-56 sm:pt-12">
        <header className="mb-8 text-center">
          <p className="mb-2 text-xs uppercase tracking-[0.35em] text-[#22d3ee]/90">
            School science project
          </p>
          <h1 className="font-heading bg-gradient-to-r from-[#f472b6] via-[#22d3ee] to-[#a78bfa] bg-clip-text text-4xl font-bold tracking-tight text-transparent sm:text-5xl">
            Helium Hero
          </h1>
          <p className="mt-3 max-w-xl mx-auto text-sm leading-relaxed text-zinc-400">
            Meet the noble‑gas guardian of party balloons and rocket science —
            tap a quick question or type your own.
          </p>
        </header>

        <section className="flex flex-col items-center">
          <div
            className={`relative mx-auto h-[min(52vh,380px)] w-full max-w-[280px] rounded-3xl p-[3px] sm:max-w-[320px] ${
              speaking ? "animate-hero-ring-speaking" : "shadow-[0_0_0_1px_rgba(167,139,250,0.25)]"
            }`}
          >
            <div className="relative h-full w-full overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-[#1a1a2e] to-[#0a0a1a]">
              {!heroBroken ? (
                <Image
                  src="/images/helium-hero.png"
                  alt="Helium Hero character"
                  fill
                  priority
                  sizes="(max-width: 640px) 280px, 320px"
                  className="object-cover object-top"
                  onError={() => setHeroBroken(true)}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#2e1064]/40 to-[#0a0a1a] px-6 text-center">
                  <span className="font-heading text-5xl font-bold text-[#fbbf24]">
                    He
                  </span>
                  <p className="text-xs text-zinc-400">
                    Add your artwork to{" "}
                    <code className="text-[#22d3ee]">public/images/helium-hero.png</code>
                  </p>
                </div>
              )}
            </div>
          </div>

          <div className="mt-6 grid w-full max-w-2xl grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { k: "Symbol", v: "He" },
              { k: "Atomic No.", v: "2" },
              { k: "State", v: "Gas" },
              { k: "Group", v: "Noble Gas" },
            ].map((s) => (
              <div
                key={s.k}
                className="rounded-2xl border border-white/10 bg-black/35 px-4 py-3 text-center shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md"
              >
                <p className="text-[10px] font-medium uppercase tracking-wider text-zinc-500">
                  {s.k}
                </p>
                <p className="mt-1 font-heading text-lg text-[#fbbf24]">{s.v}</p>
              </div>
            ))}
          </div>

          <p className="mt-4 text-xs text-zinc-500">
            Voice:{" "}
            <span className="text-[#22d3ee]">{voiceStatus}</span>
          </p>
        </section>

        <section className="mt-10 space-y-3">
          <h2 className="font-heading text-center text-sm uppercase tracking-[0.2em] text-zinc-500">
            Quick questions
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q.label}
                type="button"
                disabled={loading}
                onClick={() => void sendChat(q.text)}
                className="rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm text-zinc-200 backdrop-blur transition hover:border-[#f472b6]/50 hover:bg-[#f472b6]/10 disabled:opacity-50"
              >
                {q.label}
              </button>
            ))}
          </div>
        </section>

        <section
          ref={listRef}
          className="mt-8 flex max-h-[min(40vh,360px)] flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md sm:max-h-[420px]"
        >
          <div className="animate-slide-in-msg flex justify-start">
            <div className="max-w-[85%] rounded-2xl rounded-bl-md bg-gradient-to-br from-[#f472b6]/35 via-[#22d3ee]/25 to-[#a78bfa]/30 px-4 py-2.5 text-sm text-zinc-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]">
              {WELCOME_MESSAGE.content}
            </div>
          </div>
          {thread.map((m, i) => (
            <div
              key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
              className={`animate-slide-in-msg flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={
                  m.role === "user"
                    ? "max-w-[85%] rounded-2xl rounded-br-md border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white shadow-lg"
                    : "max-w-[85%] rounded-2xl rounded-bl-md bg-gradient-to-br from-[#f472b6]/35 via-[#22d3ee]/25 to-[#a78bfa]/30 px-4 py-2.5 text-sm text-zinc-100 shadow-[0_0_24px_rgba(34,211,238,0.12)]"
                }
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start animate-slide-in-msg">
              <div className="flex items-center gap-1 rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
                <span className="h-2 w-2 rounded-full bg-[#f472b6] animate-typing-dot" />
                <span
                  className="h-2 w-2 rounded-full bg-[#22d3ee] animate-typing-dot"
                  style={{ animationDelay: "0.15s" }}
                />
                <span
                  className="h-2 w-2 rounded-full bg-[#a78bfa] animate-typing-dot"
                  style={{ animationDelay: "0.3s" }}
                />
              </div>
            </div>
          )}
        </section>

        <section className="mt-12">
          <h2 className="font-heading text-center text-lg text-[#fbbf24]">
            Fast facts
          </h2>
          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            {FAST_FACTS.map((f) => (
              <article
                key={f.title}
                className="rounded-2xl border border-white/10 bg-black/40 p-5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]"
              >
                <h3 className="font-heading text-sm font-semibold text-[#fbbf24]">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>

      <footer className="fixed bottom-0 left-0 right-0 z-20 border-t border-white/10 bg-[#0a0a1a]/85 px-4 py-3 backdrop-blur-xl sm:px-6">
        <form
          onSubmit={onSubmit}
          className="mx-auto flex max-w-3xl gap-2"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask Helium Hero anything..."
            className="min-w-0 flex-1 rounded-full border border-white/15 bg-black/50 px-5 py-3 text-sm text-white outline-none ring-[#22d3ee]/0 transition placeholder:text-zinc-500 focus:border-[#22d3ee]/50 focus:ring-2 focus:ring-[#22d3ee]/30"
            disabled={loading}
            aria-label="Message to Helium Hero"
          />
          <button
            type="submit"
            disabled={loading || !input.trim()}
            className="shrink-0 rounded-full bg-gradient-to-r from-[#f472b6] to-[#22d3ee] px-6 py-3 text-sm font-semibold text-[#0a0a1a] shadow-lg transition hover:brightness-110 disabled:opacity-40"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  );
}
