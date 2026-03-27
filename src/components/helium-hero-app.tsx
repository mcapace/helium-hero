"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HERO_IDLE_VIDEO = "/video/helium-hero-idle.mp4";

type ChatMessage = { role: "user" | "assistant"; content: string };

type VoiceStatus = "Ready" | "Thinking..." | "Speaking...";

const QUICK_PROMPTS: { label: string; text: string }[] = [
  { label: "⚡ Superpowers", text: "What superpowers do you have as helium?" },
  { label: "🌍 Where found", text: "Where is helium found in nature?" },
  { label: "🎈 Why balloons float", text: "Why do helium balloons float?" },
  { label: "🔬 Discovery", text: "How was helium discovered?" },
  { label: "🏆 Noble gas", text: "What makes helium a noble gas?" },
];

const FAST_FACTS = [
  {
    title: "🌡️ Boiling point",
    body: "−269°C — coldest liquid on Earth",
  },
  {
    title: "⭐ Abundance",
    body: "Second most abundant element in the universe",
  },
  {
    title: "🔬 Discovery",
    body: "Discovered in 1868 by observing the Sun",
  },
  {
    title: "🎈 Lightness",
    body: "7× lighter than air — why balloons float",
  },
  {
    title: "🏥 MRI machines",
    body: "Used to cool superconducting magnets",
  },
  {
    title: "🚀 NASA",
    body: "Used as rocket fuel coolant by NASA",
  },
];

const BALLOONS = ["🎈", "🎈", "🎈", "🎈", "🎈", "🎈", "🎈", "🎈"];

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Hey there, science star! I’m Helium Hero — ask me anything about helium, the universe, or why balloons love floating. 🎈",
};

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[85%] rounded-2xl bg-gradient-to-br from-[#f472b6] via-[#22d3ee] to-[#a78bfa] p-[1px] shadow-[0_0_24px_rgba(34,211,238,0.15)]">
      <div className="rounded-[0.9rem] bg-[#0c0c18]/95 px-4 py-2.5 text-sm text-zinc-100">
        {children}
      </div>
    </div>
  );
}

export function HeliumHeroApp() {
  const [thread, setThread] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>("Ready");
  const [speaking, setSpeaking] = useState(false);
  const [heroBroken, setHeroBroken] = useState(false);
  const [dIdVideoUrl, setDIdVideoUrl] = useState<string | null>(null);
  const [videoLayerVisible, setVideoLayerVisible] = useState(false);

  const listRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const threadRef = useRef<ChatMessage[]>([]);
  const playbackGenRef = useRef(0);
  const elevenAudioRef = useRef<HTMLAudioElement | null>(null);
  const elevenObjectUrlRef = useRef<string | null>(null);
  const supplantedByVideoRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const idleVideoRef = useRef<HTMLVideoElement | null>(null);

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

  useEffect(() => {
    if (!dIdVideoUrl || !videoLayerVisible) return;
    const v = videoRef.current;
    if (!v) return;
    v.muted = false;
    void v.play().catch(() => {
      setSpeaking(false);
      setVideoLayerVisible(false);
    });
  }, [dIdVideoUrl, videoLayerVisible]);

  useEffect(() => {
    const idle = idleVideoRef.current;
    if (!idle || heroBroken) return;
    if (videoLayerVisible && dIdVideoUrl) {
      idle.pause();
    } else {
      void idle.play().catch(() => {});
    }
  }, [videoLayerVisible, dIdVideoUrl, heroBroken]);

  const stopElevenLabs = useCallback(() => {
    if (elevenAudioRef.current) {
      elevenAudioRef.current.pause();
      elevenAudioRef.current.src = "";
      elevenAudioRef.current = null;
    }
    if (elevenObjectUrlRef.current) {
      URL.revokeObjectURL(elevenObjectUrlRef.current);
      elevenObjectUrlRef.current = null;
    }
  }, []);

  const resetPlayback = useCallback(() => {
    supplantedByVideoRef.current = false;
    stopElevenLabs();
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.removeAttribute("src");
      videoRef.current.load();
    }
    setVideoLayerVisible(false);
    setDIdVideoUrl(null);
    setSpeaking(false);
  }, [stopElevenLabs]);

  useEffect(() => {
    return () => {
      if (elevenAudioRef.current) {
        elevenAudioRef.current.pause();
        elevenAudioRef.current.src = "";
        elevenAudioRef.current = null;
      }
      if (elevenObjectUrlRef.current) {
        URL.revokeObjectURL(elevenObjectUrlRef.current);
        elevenObjectUrlRef.current = null;
      }
    };
  }, []);

  const playElevenLabsThenMaybeWaitForVideo = useCallback(
    async (text: string, gen: number) => {
      supplantedByVideoRef.current = false;
      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text }),
        });
        if (gen !== playbackGenRef.current) return;

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as { error?: string };
          console.warn("ElevenLabs fallback failed:", err);
          return;
        }

        const blob = await res.blob();
        if (gen !== playbackGenRef.current) {
          URL.revokeObjectURL(URL.createObjectURL(blob));
          return;
        }

        const url = URL.createObjectURL(blob);
        stopElevenLabs();
        elevenObjectUrlRef.current = url;

        const audio = new Audio(url);
        elevenAudioRef.current = audio;
        audio.addEventListener("play", () => {
          if (gen === playbackGenRef.current) setSpeaking(true);
        });
        audio.addEventListener("ended", () => {
          if (gen !== playbackGenRef.current) return;
          if (!supplantedByVideoRef.current) setSpeaking(false);
        });
        audio.addEventListener("error", () => {
          if (gen === playbackGenRef.current && !supplantedByVideoRef.current) {
            setSpeaking(false);
          }
        });

        await audio.play().catch(() => {
          if (gen === playbackGenRef.current && !supplantedByVideoRef.current) {
            setSpeaking(false);
          }
        });
      } catch (e) {
        console.warn("ElevenLabs playback error:", e);
      }
    },
    [stopElevenLabs],
  );

  const requestDidTalk = useCallback(
    async (text: string, gen: number) => {
      try {
        const res = await fetch("/api/d-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "talk", text }),
        });
        const data = (await res.json()) as { videoUrl?: string; error?: string };
        if (gen !== playbackGenRef.current) return;

        if (!res.ok || !data.videoUrl) {
          console.warn("D-ID talk failed:", data.error ?? res.status);
          return;
        }

        supplantedByVideoRef.current = true;
        stopElevenLabs();

        setDIdVideoUrl(data.videoUrl);
        setVideoLayerVisible(true);
        setSpeaking(true);
      } catch (e) {
        console.warn("D-ID request error:", e);
      }
    },
    [stopElevenLabs],
  );

  const onVideoEnded = useCallback(() => {
    setVideoLayerVisible(false);
  }, []);

  const onVideoTransitionEnd = useCallback(
    (e: React.TransitionEvent<HTMLVideoElement>) => {
      if (e.propertyName !== "opacity") return;
      if (videoLayerVisible) return;
      setDIdVideoUrl(null);
      setSpeaking(false);
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.removeAttribute("src");
        videoRef.current.load();
      }
    },
    [videoLayerVisible],
  );

  const sendChat = useCallback(
    async (userText: string) => {
      const trimmed = userText.trim();
      if (!trimmed || inFlightRef.current) return;
      inFlightRef.current = true;
      playbackGenRef.current += 1;
      const gen = playbackGenRef.current;
      resetPlayback();

      const nextMessages: ChatMessage[] = [
        ...threadRef.current,
        { role: "user", content: trimmed },
      ];
      setThread(nextMessages);

      setLoading(true);

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

        if (gen !== playbackGenRef.current) return;

        void playElevenLabsThenMaybeWaitForVideo(reply, gen);
        void requestDidTalk(reply, gen);
      } catch (e) {
        const msg =
          e instanceof Error ? e.message : "Something went wrong. Try again!";
        setThread((prev) => [
          ...prev,
          {
            role: "assistant",
            content: `Oops — I hit a snag: ${msg}. Check your API keys and try again. ⚡`,
          },
        ]);
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [playElevenLabsThenMaybeWaitForVideo, requestDidTalk, resetPlayback],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input;
    setInput("");
    void sendChat(t);
  };

  const heroRing = speaking || videoLayerVisible;

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
              heroRing
                ? "animate-hero-ring-speaking"
                : "shadow-[0_0_0_1px_rgba(167,139,250,0.25)]"
            }`}
          >
            <div className="relative h-full w-full overflow-hidden rounded-[1.35rem] bg-gradient-to-br from-[#1a1a2e] to-[#0a0a1a]">
              {!heroBroken ? (
                <video
                  ref={idleVideoRef}
                  className="absolute inset-0 z-0 h-full w-full object-cover object-center rounded-[1.35rem]"
                  src={HERO_IDLE_VIDEO}
                  poster="/images/helium-hero.png"
                  autoPlay
                  loop
                  muted
                  playsInline
                  preload="auto"
                  aria-label="Helium Hero character loop"
                  onError={() => setHeroBroken(true)}
                />
              ) : (
                <div className="flex h-full w-full flex-col items-center justify-center gap-2 bg-gradient-to-b from-[#2e1064]/40 to-[#0a0a1a] px-6 text-center">
                  <span className="font-heading text-5xl font-bold text-[#fbbf24]">
                    He
                  </span>
                  <p className="text-xs text-zinc-400">
                    Add{" "}
                    <code className="text-[#22d3ee]">public/video/helium-hero-idle.mp4</code>{" "}
                    and{" "}
                    <code className="text-[#22d3ee]">public/images/helium-hero.png</code>{" "}
                    (poster).
                  </p>
                </div>
              )}
              <video
                key={dIdVideoUrl ?? "none"}
                ref={videoRef}
                src={dIdVideoUrl ?? undefined}
                playsInline
                className={`absolute inset-0 z-10 h-full w-full object-cover object-center rounded-[1.35rem] transition-opacity duration-500 ease-out ${
                  videoLayerVisible && dIdVideoUrl
                    ? "opacity-100"
                    : "pointer-events-none opacity-0"
                }`}
                onEnded={onVideoEnded}
                onTransitionEnd={onVideoTransitionEnd}
                aria-hidden={!dIdVideoUrl}
              />
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
          className="mt-8 flex h-[300px] flex-col gap-3 overflow-y-auto rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-md"
        >
          <div className="animate-slide-in-msg flex justify-start">
            <AssistantBubble>{WELCOME_MESSAGE.content}</AssistantBubble>
          </div>
          {thread.map((m, i) => (
            <div
              key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
              className={`animate-slide-in-msg flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              {m.role === "user" ? (
                <div className="max-w-[85%] rounded-2xl rounded-br-md border border-white/20 bg-white/10 px-4 py-2.5 text-sm text-white shadow-lg">
                  {m.content}
                </div>
              ) : (
                <AssistantBubble>{m.content}</AssistantBubble>
              )}
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
