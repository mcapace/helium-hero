"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const HERO_IDLE_VIDEO = "/video/helium-hero-idle.mp4";
const ELEVEN_VOICE_STORAGE_KEY = "helium-hero-elevenlabs-voice-id";

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

function elevenLabsVoiceHint(
  err: { error?: string; detail?: string },
  status: number,
): string {
  if (err.error?.includes("Missing ELEVENLABS_API_KEY") || status === 500) {
    return "Voice offline: set ELEVENLABS_API_KEY in Vercel → Env, then redeploy.";
  }
  if (err.error?.includes("No voice ID")) {
    return "Set an ElevenLabs voice ID with Change voice below, or set ELEVENLABS_VOICE_ID on the server.";
  }
  const detail = typeof err.detail === "string" ? err.detail : "";
  if (
    detail.includes("missing_permissions") ||
    detail.includes("text_to_speech")
  ) {
    return "Your ElevenLabs API key can’t run Text-to-speech. In elevenlabs.io go to Developers → API keys, open your key (or create one), enable Text to speech, save, then replace ELEVENLABS_API_KEY in Vercel and .env.local and redeploy.";
  }
  const short = detail.slice(0, 200);
  return `Voice synth failed (${err.error ?? status})${short ? ` — ${short}` : ""}`;
}

function AssistantBubble({ children }: { children: React.ReactNode }) {
  return (
    <div className="max-w-[88%] rounded-2xl bg-gradient-to-br from-[#f472b6]/90 via-[#22d3ee]/80 to-[#a78bfa]/90 p-[1px] shadow-[0_0_40px_rgba(34,211,238,0.12),0_0_1px_rgba(255,255,255,0.15)_inset]">
      <div className="rounded-[0.9rem] bg-[#080812]/95 px-4 py-3 text-sm leading-relaxed text-zinc-100 backdrop-blur-md sm:text-[15px]">
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
  const [voiceHint, setVoiceHint] = useState<string | null>(null);
  const [showSoundUnlock, setShowSoundUnlock] = useState(false);
  const [elevenVoiceId, setElevenVoiceId] = useState("");
  const [voicePanelOpen, setVoicePanelOpen] = useState(false);
  const [voiceIdDraft, setVoiceIdDraft] = useState("");

  const listRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const threadRef = useRef<ChatMessage[]>([]);
  const playbackGenRef = useRef(0);
  const elevenAudioRef = useRef<HTMLAudioElement | null>(null);
  const elevenObjectUrlRef = useRef<string | null>(null);
  const supplantedByVideoRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const soundUnlockRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  useEffect(() => {
    try {
      const stored = localStorage
        .getItem(ELEVEN_VOICE_STORAGE_KEY)
        ?.trim();
      if (stored) setElevenVoiceId(stored);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (voicePanelOpen) setVoiceIdDraft(elevenVoiceId);
  }, [voicePanelOpen, elevenVoiceId]);

  const persistVoiceId = useCallback(() => {
    const t = voiceIdDraft.trim();
    try {
      if (t) {
        localStorage.setItem(ELEVEN_VOICE_STORAGE_KEY, t);
        setElevenVoiceId(t);
      } else {
        localStorage.removeItem(ELEVEN_VOICE_STORAGE_KEY);
        setElevenVoiceId("");
      }
    } catch {
      /* ignore */
    }
    setVoicePanelOpen(false);
  }, [voiceIdDraft]);

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

    const run = async () => {
      v.muted = false;
      try {
        await v.play();
        setShowSoundUnlock(false);
        setVoiceHint(null);
        soundUnlockRef.current = null;
      } catch {
        v.muted = true;
        try {
          await v.play();
          soundUnlockRef.current = async () => {
            v.muted = false;
            try {
              await v.play();
            } catch {
              /* ignore */
            }
            setShowSoundUnlock(false);
            setVoiceHint(null);
            soundUnlockRef.current = null;
          };
          setShowSoundUnlock(true);
          setVoiceHint(
            "Tap Enable sound — your browser blocked audio until you interact.",
          );
        } catch {
          setSpeaking(false);
          setVideoLayerVisible(false);
        }
      }
    };

    void run();
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
    setVoiceHint(null);
    setShowSoundUnlock(false);
    soundUnlockRef.current = null;
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
          body: JSON.stringify({
            text,
            ...(elevenVoiceId.trim()
              ? { voiceId: elevenVoiceId.trim() }
              : {}),
          }),
        });
        if (gen !== playbackGenRef.current) return;

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
            detail?: string;
          };
          setVoiceHint(elevenLabsVoiceHint(err, res.status));
          console.warn("ElevenLabs TTS failed:", err);
          return;
        }

        const blob = await res.blob();
        if (blob.size < 400 || blob.type.includes("json")) {
          const snippet = await blob.text().catch(() => "");
          if (
            snippet.includes("missing_permissions") ||
            snippet.includes("text_to_speech")
          ) {
            setVoiceHint(elevenLabsVoiceHint({ detail: snippet }, res.status));
          } else {
            setVoiceHint(
              snippet
                ? `Voice API: ${snippet.slice(0, 140)}`
                : "Voice response was empty — check ELEVENLABS_API_KEY and model.",
            );
          }
          return;
        }

        if (gen !== playbackGenRef.current) return;
        if (supplantedByVideoRef.current) return;

        const url = URL.createObjectURL(blob);
        stopElevenLabs();
        elevenObjectUrlRef.current = url;

        const audio = new Audio(url);
        elevenAudioRef.current = audio;
        audio.addEventListener("play", () => {
          if (gen === playbackGenRef.current) {
            setSpeaking(true);
            setVoiceHint(null);
            setShowSoundUnlock(false);
          }
        });
        audio.addEventListener("ended", () => {
          if (gen !== playbackGenRef.current) return;
          if (!supplantedByVideoRef.current) setSpeaking(false);
        });
        audio.addEventListener("error", () => {
          if (gen === playbackGenRef.current && !supplantedByVideoRef.current) {
            setSpeaking(false);
            setVoiceHint("Could not decode audio — try another browser.");
          }
        });

        try {
          await audio.play();
        } catch (e) {
          const name = e instanceof DOMException ? e.name : "";
          if (name === "NotAllowedError" || name === "AbortError") {
            soundUnlockRef.current = async () => {
              try {
                await audio.play();
                setShowSoundUnlock(false);
                setVoiceHint(null);
                soundUnlockRef.current = null;
              } catch {
                /* ignore */
              }
            };
            setShowSoundUnlock(true);
            setVoiceHint(
              "Tap Enable sound — playback was blocked until you interact.",
            );
          } else if (gen === playbackGenRef.current && !supplantedByVideoRef.current) {
            setSpeaking(false);
            setVoiceHint("Could not start voice playback.");
          }
        }
      } catch (e) {
        setVoiceHint("Could not reach /api/speak.");
        console.warn("ElevenLabs playback error:", e);
      }
    },
    [stopElevenLabs, elevenVoiceId],
  );

  const requestDidTalk = useCallback(
    async (text: string, gen: number) => {
      try {
        const res = await fetch("/api/d-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "talk",
            text,
            ...(elevenVoiceId.trim()
              ? { voiceId: elevenVoiceId.trim() }
              : {}),
          }),
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
    [stopElevenLabs, elevenVoiceId],
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
        className="pointer-events-none fixed inset-0 -z-10 bg-[#050510]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 tech-bg-grid opacity-70"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 tech-vignette"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden
      >
        <div className="tech-sweep absolute inset-x-0 top-0 w-full" />
      </div>
      <div
        className="pointer-events-none fixed inset-0 z-0 tech-scanlines opacity-30"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -left-40 top-1/4 -z-10 h-[min(80vw,560px)] w-[min(80vw,560px)] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(244,114,182,0.38),transparent_58%)] blur-3xl animate-orb-a"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -right-48 bottom-1/4 -z-10 h-[min(90vw,620px)] w-[min(90vw,620px)] rounded-full bg-[radial-gradient(circle_at_40%_40%,rgba(34,211,238,0.32),transparent_52%)] blur-[90px] animate-orb-b"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed left-1/2 top-0 -z-10 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.28),transparent_62%)] blur-[80px] animate-orb-a"
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

      <main className="relative z-10 mx-auto flex min-h-screen max-w-7xl flex-col px-4 pb-10 pt-6 sm:px-6 lg:px-10">
        <header className="mb-6 text-center lg:mb-8">
          <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between gap-4 border-b border-white/[0.08] pb-3 font-mono-tech text-[10px] text-zinc-500 sm:text-xs">
            <span className="flex min-w-0 flex-1 items-center gap-2 text-left tracking-wide">
              <span
                className="h-2 w-2 shrink-0 rounded-full bg-[#22d3ee] shadow-[0_0_10px_#22d3ee]"
                aria-hidden
              />
              <span className="truncate">
                HE_SPECIES // INTERFACE · He · ATOMIC&nbsp;2
              </span>
            </span>
            <span className="shrink-0 tabular-nums tracking-wider text-[#fbbf24]/85">
              UPLINK · NOMINAL
            </span>
          </div>
          <p className="font-mono-tech text-[10px] uppercase tracking-[0.5em] text-[#22d3ee]/75 sm:text-xs">
            Educational neural link
          </p>
          <h1 className="font-heading mt-2 bg-gradient-to-r from-[#f472b6] via-[#22d3ee] to-[#a78bfa] bg-clip-text text-3xl font-bold tracking-tight text-transparent sm:text-5xl md:text-6xl">
            Helium Hero
          </h1>
          <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-zinc-400 sm:text-base">
            Chat with the noble gas — explore helium through conversation.
          </p>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-6 lg:min-h-[min(85vh,920px)] lg:flex-row lg:items-stretch lg:gap-8">
          {/* Hero column ~40% desktop */}
          <aside className="flex w-full shrink-0 flex-col gap-3 lg:w-[40%] lg:max-w-[40%] lg:min-w-0">
            <div
              className={`relative mx-auto h-[40vh] max-h-[40vh] w-full overflow-hidden rounded-2xl p-[2px] lg:mx-0 lg:h-full lg:max-h-none lg:min-h-[min(72vh,820px)] lg:flex-1 lg:rounded-3xl lg:p-[3px] ${
                heroRing
                  ? "animate-hero-ring-speaking"
                  : "shadow-[0_0_0_1px_rgba(34,211,238,0.15),0_24px_80px_rgba(0,0,0,0.45)]"
              }`}
            >
              <div className="relative isolate h-full min-h-0 w-full overflow-hidden rounded-[0.9rem] bg-gradient-to-br from-[#12122a] via-[#0a0a14] to-[#050510] lg:rounded-[1.4rem]">
                <div
                  className="pointer-events-none absolute inset-0 z-[1] bg-gradient-to-t from-[#050510]/80 via-transparent to-[#22d3ee]/[0.07]"
                  aria-hidden
                />
                {!heroBroken ? (
                  <video
                    ref={idleVideoRef}
                    className="absolute inset-0 z-0 h-full w-full object-cover [object-position:center_12%]"
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
                  className={`absolute inset-0 z-10 h-full w-full object-cover [object-position:center_12%] transition-opacity duration-500 ease-out ${
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

            <div className="flex flex-col gap-2 px-0.5">
              <p className="font-mono-tech flex flex-wrap items-center gap-2 text-[10px] tracking-wide text-zinc-500 sm:text-xs">
                <span className="text-zinc-600">VOICE</span>
                <span className="rounded bg-white/5 px-2 py-0.5 text-[#22d3ee]">
                  {voiceStatus}
                </span>
                <button
                  type="button"
                  className="text-[#22d3ee]/80 underline-offset-2 hover:text-[#22d3ee] hover:underline"
                  onClick={() => setVoicePanelOpen((o) => !o)}
                >
                  {voicePanelOpen ? "Close" : "Change voice"}
                </button>
              </p>
              {voiceHint ? (
                <p className="font-mono-tech text-[10px] leading-relaxed text-amber-200/90 sm:text-xs">
                  {voiceHint}
                </p>
              ) : null}
              {voicePanelOpen ? (
                <div className="glass-panel rounded-xl p-3 text-left">
                  <label
                    htmlFor="eleven-voice-id"
                    className="font-mono-tech text-[10px] uppercase tracking-wider text-zinc-400"
                  >
                    ElevenLabs voice ID
                  </label>
                  <input
                    id="eleven-voice-id"
                    value={voiceIdDraft}
                    onChange={(e) => setVoiceIdDraft(e.target.value)}
                    placeholder="Paste voice ID"
                    className="mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono-tech text-xs text-white outline-none placeholder:text-zinc-600 focus:border-[#22d3ee]/45"
                    autoComplete="off"
                  />
                  <p className="mt-2 text-[10px] leading-snug text-zinc-500">
                    Empty + Save uses server{" "}
                    <code className="text-zinc-400">ELEVENLABS_VOICE_ID</code>.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={persistVoiceId}
                      className="rounded-lg bg-gradient-to-r from-[#f472b6] to-[#22d3ee] px-3 py-1.5 font-mono-tech text-xs font-semibold text-[#050510]"
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoicePanelOpen(false)}
                      className="rounded-lg border border-white/15 px-3 py-1.5 font-mono-tech text-xs text-zinc-300"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <p className="font-mono-tech text-[9px] text-zinc-600 sm:text-[10px]">
                {elevenVoiceId.trim()
                  ? `Saved: ${elevenVoiceId.slice(0, 10)}…`
                  : "Voice ID: server default"}
              </p>
            </div>
          </aside>

          {/* Chat ~60% desktop */}
          <div className="flex min-h-0 w-full flex-1 flex-col lg:w-[60%] lg:min-w-0">
            <div className="glass-panel flex min-h-[min(52vh,480px)] flex-1 flex-col overflow-hidden rounded-2xl lg:min-h-[min(72vh,820px)]">
              <div
                ref={listRef}
                className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5"
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
                      <div className="max-w-[85%] rounded-2xl rounded-br-md border border-white/[0.12] bg-white/[0.07] px-4 py-3 text-sm text-white shadow-lg backdrop-blur-sm sm:text-[15px]">
                        {m.content}
                      </div>
                    ) : (
                      <AssistantBubble>{m.content}</AssistantBubble>
                    )}
                  </div>
                ))}
                {loading && (
                  <div className="flex justify-start animate-slide-in-msg">
                    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-sm">
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
              </div>

              <div className="shrink-0 border-t border-white/[0.08] bg-black/25">
                <div className="flex gap-2 overflow-x-auto px-3 py-2.5 [scrollbar-width:thin]">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      disabled={loading}
                      onClick={() => void sendChat(q.text)}
                      className="shrink-0 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-zinc-200 transition hover:border-[#22d3ee]/40 hover:bg-[#22d3ee]/10 disabled:opacity-50 sm:text-sm"
                    >
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>

              {showSoundUnlock ? (
                <div className="shrink-0 border-t border-white/[0.08] px-3 py-2">
                  <button
                    type="button"
                    className="w-full rounded-xl border border-[#22d3ee]/50 bg-[#050510]/90 py-2.5 font-mono-tech text-xs font-semibold text-[#22d3ee] shadow-[0_0_24px_rgba(34,211,238,0.15)] transition hover:bg-[#22d3ee]/10"
                    onClick={() => void soundUnlockRef.current?.()}
                  >
                    Enable sound
                  </button>
                </div>
              ) : null}

              <form
                className="shrink-0 border-t border-white/[0.08] bg-black/30 p-3 sm:p-4"
                onSubmit={onSubmit}
              >
                <div className="flex gap-2 sm:gap-3">
                  <input
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Helium Hero…"
                    className="font-mono-tech min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-[#22d3ee]/45 focus:ring-2 focus:ring-[#22d3ee]/20 sm:text-[15px]"
                    disabled={loading}
                    aria-label="Message to Helium Hero"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className="shrink-0 rounded-xl bg-gradient-to-r from-[#f472b6] via-[#a78bfa] to-[#22d3ee] px-5 py-3 text-sm font-bold tracking-wide text-[#050510] shadow-[0_0_28px_rgba(34,211,238,0.25)] transition hover:brightness-110 disabled:opacity-40 sm:px-7"
                  >
                    Send
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>

        <section className="mt-12 sm:mt-16">
          <h2 className="font-mono-tech text-center text-[10px] uppercase tracking-[0.4em] text-zinc-500 sm:text-xs">
            Knowledge matrix
          </h2>
          <p className="font-heading mt-2 text-center text-lg text-[#fbbf24] sm:text-xl">
            Fast facts
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:gap-5">
            {FAST_FACTS.map((f) => (
              <article
                key={f.title}
                className="glass-panel group rounded-2xl p-5 transition hover:border-[#a78bfa]/30 sm:p-6"
              >
                <h3 className="font-heading text-sm font-semibold text-[#fbbf24] sm:text-base">
                  {f.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-400 sm:text-[15px]">
                  {f.body}
                </p>
              </article>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
