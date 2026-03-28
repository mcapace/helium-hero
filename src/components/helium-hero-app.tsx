"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readAnthropicMessageStream,
  takeFirstCompleteSentence,
} from "@/lib/anthropic-stream";
import { playMp3FromReadableStream } from "@/lib/play-mp3-mse";

const HERO_IDLE_VIDEO =
  "/video/duplexnyc_Helium_Hero_full_body_superhero_standing_heroic_pos_a50e06aa-8550-4525-82a3-32a1887d542f_0.mp4";

type ChatMessage = { role: "user" | "assistant"; content: string };

type VoiceStatus = "Ready" | "Thinking..." | "Speaking...";

const QUICK_PROMPTS: { label: string; text: string }[] = [
  { label: "Superpowers", text: "What superpowers do you have as helium?" },
  { label: "Where found", text: "Where is helium found in nature?" },
  { label: "Why balloons float", text: "Why do helium balloons float?" },
  { label: "Discovery", text: "How was helium discovered?" },
  {
    label: "Surprise me",
    text: "Surprise me with a helium fact I don't know.",
  },
];

const HERO_STATS: { label: string; value: string }[] = [
  { label: "Symbol", value: "He" },
  { label: "Atomic No.", value: "2" },
  { label: "Atomic Mass", value: "4.003" },
  { label: "Group", value: "Noble Gas" },
  { label: "Period", value: "1" },
  { label: "State", value: "Gas" },
  { label: "Boiling Pt.", value: "−269°C" },
  { label: "Discovered", value: "1868" },
];

const ABILITY_BARS: {
  label: string;
  pct: number;
  definition: string;
  meaning: string;
}[] = [
  {
    label: "Buoyancy",
    pct: 95,
    definition:
      "Upward push a fluid gives an object inside it (displaces heavier surroundings).",
    meaning:
      "Helium is far less dense than air, so it floats up — balloons rise because helium lifts against gravity.",
  },
  {
    label: "Inertness",
    pct: 100,
    definition:
      "Chemical calmness: almost no bonding or reactions under everyday conditions.",
    meaning:
      "As a noble gas, helium won’t burn or react like hydrogen — it’s safe for lifts and labs.",
  },
  {
    label: "Thermal resistance",
    pct: 88,
    definition:
      "How a substance behaves across huge hot-to-cold swings and heat flow.",
    meaning:
      "Helium can be the coldest liquid we use (−269 °C) yet also behaves as a reliable gas in tech.",
  },
  {
    label: "Cosmic origin",
    pct: 100,
    definition:
      "Where an element’s atoms were forged — Big Bang, stars, or decay underground.",
    meaning:
      "Most helium was made in the Big Bang and stars; on Earth we trap tiny amounts gathered from underground decay.",
  },
];

const ATMOSPHERE_ROWS: {
  name: string;
  pct: number;
  fill: string;
  highlight?: boolean;
}[] = [
  { name: "Nitrogen (N₂)", pct: 78.09, fill: "rgba(100,160,220,0.5)" },
  { name: "Oxygen (O₂)", pct: 20.95, fill: "rgba(80,200,160,0.5)" },
  { name: "Argon (Ar)", pct: 0.93, fill: "rgba(150,130,200,0.5)" },
  {
    name: "Helium (He) ★",
    pct: 0.0005,
    fill: "var(--blue)",
    highlight: true,
  },
];

const FACT_CARDS = [
  {
    emoji: "❄️",
    title: "Coldest Liquid",
    body: "−269°C boiling point",
  },
  {
    emoji: "⭐",
    title: "Star Power",
    body: "Forged in the Big Bang",
  },
  {
    emoji: "☀️",
    title: "Sun Discovery",
    body: "Found in Sun before Earth (1868)",
  },
  {
    emoji: "🎈",
    title: "Lighter Than Air",
    body: "7× lighter, why balloons float",
  },
  {
    emoji: "🏥",
    title: "MRI Cooling",
    body: "Superconducting magnet cooling",
  },
  {
    emoji: "🚀",
    title: "Rocket Science",
    body: "NASA fuel tank pressurization",
  },
  {
    emoji: "🌍",
    title: "Storm Spotters",
    body: "Helium lifts weather balloons so meteorologists can track storms and help keep communities safer.",
  },
  {
    emoji: "🔬",
    title: "Greener Science",
    body: "Ultra-cold helium helps researchers study materials and quantum systems—work that can lead to better batteries and cleaner tech.",
  },
  {
    emoji: "🛰️",
    title: "Eyes on Earth",
    body: "Helium helps pressurize rocket fuel so we can launch satellites that monitor climate, oceans, and forests.",
  },
  {
    emoji: "♻️",
    title: "Recycle the Lift",
    body: "Hospitals and labs recover helium from MRI and industry, cutting waste and protecting future supply.",
  },
  {
    emoji: "📡",
    title: "Connected World",
    body: "Fiber optics and advanced chips are made with helium in the process—underpinning global internet and phones.",
  },
  {
    emoji: "🧪",
    title: "Breath of Discovery",
    body: "From particle physics to medicine, helium’s extreme cold lets us invent tools that benefit life on Earth.",
  },
];

const GAS_PRESETS = Array.from({ length: 18 }, (_, i) => ({
  left: `${((i * 53) % 94) + 3}%`,
  size: 2 + (i % 5),
  duration: 14 + (i % 9),
  delay: ((i * 0.41) % 5) + ((i * 0.13) % 10) * 0.03,
  op: 0.3 + (i % 4) * 0.06,
  drift: `${(i % 7) - 3}px`,
}));

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Hey, sixth-grade legend — I'm Helium Hero. Ask me wild questions about helium and space (I might go on a silly tangent first). Keep it respectful or Mr. Cotter hears about it. What's your first question? 🎈",
};

const FOCUS_VISIBLE_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]";

const TYPEWRITER_CHARS_PER_FRAME = 30;

function elevenLabsVoiceHint(
  err: { error?: string; detail?: string },
  status: number,
): string {
  if (err.error?.includes("Missing ELEVENLABS_API_KEY") || status === 500) {
    return "Voice offline: set ELEVENLABS_API_KEY in Vercel → Env, then redeploy.";
  }
  if (err.error?.includes("No voice ID")) {
    return "Server needs ELEVENLABS_VOICE_ID or a valid default voice in code — check Vercel env and redeploy.";
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
    <div className="max-w-[88%] rounded-2xl rounded-tl-[0.2rem] border border-[rgba(168,216,240,0.2)] bg-[rgba(168,216,240,0.09)] px-4 py-3 text-[0.92rem] font-normal leading-[1.55] text-[var(--white)] sm:text-[0.98rem]">
      {children}
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

  const listRef = useRef<HTMLDivElement>(null);
  const inFlightRef = useRef(false);
  const threadRef = useRef<ChatMessage[]>([]);
  const playbackGenRef = useRef(0);
  const chatAbortRef = useRef<AbortController | null>(null);
  const elevenAudioRef = useRef<HTMLAudioElement | null>(null);
  const elevenObjectUrlRef = useRef<string | null>(null);
  const supplantedByVideoRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const idleVideoRef = useRef<HTMLVideoElement | null>(null);
  const soundUnlockRef = useRef<(() => Promise<void>) | null>(null);
  const ttsChainRef = useRef(Promise.resolve());
  const typeRevealLenRef = useRef(0);
  const typeTargetRef = useRef("");
  const typeRafRef = useRef<number | null>(null);

  const [typeRevealLen, setTypeRevealLen] = useState(0);
  const [isTypingAssistant, setIsTypingAssistant] = useState(false);

  useEffect(() => {
    threadRef.current = thread;
  }, [thread]);

  /** Drop legacy override so TTS always uses server ELEVENLABS_VOICE_ID / default. */
  useEffect(() => {
    try {
      localStorage.removeItem("helium-hero-elevenlabs-voice-id");
    } catch {
      /* ignore */
    }
  }, []);

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
  }, [thread, loading, typeRevealLen, scrollToBottom]);

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

  const abortInFlightRequests = useCallback(() => {
    chatAbortRef.current?.abort();
    chatAbortRef.current = null;
  }, []);

  const stopActiveChat = useCallback(() => {
    if (typeRafRef.current != null) {
      cancelAnimationFrame(typeRafRef.current);
      typeRafRef.current = null;
    }
    const t = threadRef.current;
    if (t.length > 0 && t[t.length - 1].role === "assistant") {
      const fullLen = t[t.length - 1].content.length;
      typeRevealLenRef.current = fullLen;
      setTypeRevealLen(fullLen);
    }
    setIsTypingAssistant(false);
    abortInFlightRequests();
    playbackGenRef.current += 1;
    resetPlayback();
    inFlightRef.current = false;
    setLoading(false);
  }, [abortInFlightRequests, resetPlayback]);

  const clearChat = useCallback(() => {
    if (typeRafRef.current != null) {
      cancelAnimationFrame(typeRafRef.current);
      typeRafRef.current = null;
    }
    stopActiveChat();
    setThread([]);
    typeRevealLenRef.current = 0;
    setTypeRevealLen(0);
    setIsTypingAssistant(false);
  }, [stopActiveChat]);

  const flushAssistantTyping = useCallback(() => {
    if (typeRafRef.current != null) {
      cancelAnimationFrame(typeRafRef.current);
      typeRafRef.current = null;
    }
    const t = threadRef.current;
    if (t.length > 0 && t[t.length - 1].role === "assistant") {
      const fullLen = t[t.length - 1].content.length;
      typeRevealLenRef.current = fullLen;
      setTypeRevealLen(fullLen);
    }
    setIsTypingAssistant(false);
  }, []);

  const queueAssistantTypewriter = useCallback(
    (fullText: string, typeGen: number) => {
      if (typeRafRef.current != null) {
        cancelAnimationFrame(typeRafRef.current);
        typeRafRef.current = null;
      }
      typeTargetRef.current = fullText;
      typeRevealLenRef.current = 0;
      setTypeRevealLen(0);
      setIsTypingAssistant(true);

      const step = () => {
        if (typeGen !== playbackGenRef.current) {
          typeRafRef.current = null;
          setIsTypingAssistant(false);
          const target = typeTargetRef.current;
          typeRevealLenRef.current = target.length;
          setTypeRevealLen(target.length);
          return;
        }
        const target = typeTargetRef.current;
        const next = Math.min(
          target.length,
          typeRevealLenRef.current + TYPEWRITER_CHARS_PER_FRAME,
        );
        typeRevealLenRef.current = next;
        setTypeRevealLen(next);
        if (next < target.length) {
          typeRafRef.current = requestAnimationFrame(step);
        } else {
          typeRafRef.current = null;
          setIsTypingAssistant(false);
        }
      };

      typeRafRef.current = requestAnimationFrame(step);
    },
    [],
  );

  useEffect(() => {
    return () => {
      chatAbortRef.current?.abort();
      chatAbortRef.current = null;
      if (elevenAudioRef.current) {
        elevenAudioRef.current.pause();
        elevenAudioRef.current.src = "";
        elevenAudioRef.current = null;
      }
      if (elevenObjectUrlRef.current) {
        URL.revokeObjectURL(elevenObjectUrlRef.current);
        elevenObjectUrlRef.current = null;
      }
      if (typeRafRef.current != null) {
        cancelAnimationFrame(typeRafRef.current);
        typeRafRef.current = null;
      }
    };
  }, []);

  const playElevenLabsThenMaybeWaitForVideo = useCallback(
    async (text: string, gen: number, signal: AbortSignal): Promise<void> => {
      supplantedByVideoRef.current = false;

      const playBlobAsAudio = async (blob: Blob): Promise<void> => {
        if (signal.aborted || gen !== playbackGenRef.current) return;
        if (blob.size < 400 || blob.type.includes("json")) {
          const snippet = await blob.text().catch(() => "");
          if (
            snippet.includes("missing_permissions") ||
            snippet.includes("text_to_speech")
          ) {
            setVoiceHint(elevenLabsVoiceHint({ detail: snippet }, 502));
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

        await new Promise<void>((resolve) => {
          audio.addEventListener("play", () => {
            if (gen === playbackGenRef.current) {
              setSpeaking(true);
              setVoiceHint(null);
              setShowSoundUnlock(false);
            }
          });
          audio.addEventListener(
            "ended",
            () => {
              if (gen !== playbackGenRef.current) return;
              if (!supplantedByVideoRef.current) setSpeaking(false);
              resolve();
            },
            { once: true },
          );
          audio.addEventListener(
            "error",
            () => {
              if (gen === playbackGenRef.current && !supplantedByVideoRef.current) {
                setSpeaking(false);
                setVoiceHint("Could not decode audio — try another browser.");
              }
              resolve();
            },
            { once: true },
          );

          void audio.play().catch((e) => {
            if (signal.aborted) {
              resolve();
              return;
            }
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
            } else if (
              gen === playbackGenRef.current &&
              !supplantedByVideoRef.current
            ) {
              setSpeaking(false);
              setVoiceHint("Could not start voice playback.");
            }
            resolve();
          });
        });
      };

      try {
        const res = await fetch("/api/speak", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({ text }),
        });
        if (gen !== playbackGenRef.current) return;
        if (signal.aborted) return;

        if (!res.ok) {
          const err = (await res.json().catch(() => ({}))) as {
            error?: string;
            detail?: string;
          };
          setVoiceHint(elevenLabsVoiceHint(err, res.status));
          console.warn("ElevenLabs TTS failed:", err);
          return;
        }

        if (!res.body) {
          const blob = await res.blob();
          await playBlobAsAudio(blob);
          return;
        }

        const canMse =
          typeof MediaSource !== "undefined" &&
          MediaSource.isTypeSupported("audio/mpeg");

        if (canMse) {
          const cloned = res.clone();
          try {
            stopElevenLabs();
            await playMp3FromReadableStream(res.body, {
              signal,
              cancelled: () => gen !== playbackGenRef.current,
              attach: (a, url) => {
                elevenAudioRef.current = a;
                elevenObjectUrlRef.current = url;
              },
              onPlaying: () => {
                if (gen === playbackGenRef.current) {
                  setSpeaking(true);
                  setVoiceHint(null);
                  setShowSoundUnlock(false);
                }
              },
              onSpeakingStop: () => {
                if (gen !== playbackGenRef.current) return;
                if (!supplantedByVideoRef.current) setSpeaking(false);
              },
              onNotAllowed: (tryPlay) => {
                soundUnlockRef.current = async () => {
                  try {
                    await tryPlay();
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
              },
              onDecodeError: () => {
                if (
                  gen === playbackGenRef.current &&
                  !supplantedByVideoRef.current
                ) {
                  setSpeaking(false);
                  setVoiceHint("Could not decode audio — try another browser.");
                }
              },
            });
            return;
          } catch (e) {
            console.warn("Streaming MP3 failed, falling back to buffer:", e);
            stopElevenLabs();
            const buf = await cloned.arrayBuffer();
            if (signal.aborted || gen !== playbackGenRef.current) return;
            await playBlobAsAudio(new Blob([buf], { type: "audio/mpeg" }));
            return;
          }
        }

        const blob = await res.blob();
        if (signal.aborted) return;
        await playBlobAsAudio(blob);
      } catch (e) {
        if (signal.aborted) return;
        setVoiceHint("Could not reach /api/speak.");
        console.warn("ElevenLabs playback error:", e);
      }
    },
    [stopElevenLabs],
  );

  const requestDidTalk = useCallback(
    async (text: string, gen: number, signal: AbortSignal) => {
      try {
        const res = await fetch("/api/d-id", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            action: "talk",
            text,
          }),
        });
        if (signal.aborted) return;
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
        if (signal.aborted) return;
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
      flushAssistantTyping();
      ttsChainRef.current = Promise.resolve();

      inFlightRef.current = true;
      playbackGenRef.current += 1;
      const gen = playbackGenRef.current;
      resetPlayback();

      chatAbortRef.current?.abort();
      const ac = new AbortController();
      chatAbortRef.current = ac;
      const { signal } = ac;

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
          signal,
          body: JSON.stringify({
            messages: nextMessages.map((m) => ({
              role: m.role,
              content: m.content,
            })),
          }),
        });
        if (signal.aborted) return;

        const ct = res.headers.get("content-type") ?? "";
        if (!res.ok || !ct.includes("text/event-stream")) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: string;
            detail?: string;
          };
          const errDetail =
            typeof data.detail === "string"
              ? data.detail
              : (data.error ?? "Chat request failed");
          throw new Error(errDetail);
        }

        if (!res.body) throw new Error("No response body");

        setThread((prev) => [...prev, { role: "assistant", content: "" }]);

        let acc = "";
        let firstTtsQueued = false;
        let firstSentenceEnd = 0;
        let sawToken = false;

        const enqueueTts = (chunk: string) => {
          const t = chunk.trim();
          if (!t) return;
          ttsChainRef.current = ttsChainRef.current.then(() =>
            playElevenLabsThenMaybeWaitForVideo(t, gen, signal),
          );
        };

        for await (const delta of readAnthropicMessageStream(
          res.body,
          signal,
        )) {
          if (signal.aborted) return;
          if (gen !== playbackGenRef.current) return;
          if (!sawToken) {
            sawToken = true;
            setLoading(false);
          }
          acc += delta;
          setThread((prev) => {
            const next = [...prev];
            const last = next[next.length - 1];
            if (last?.role !== "assistant") return prev;
            next[next.length - 1] = { ...last, content: acc };
            return next;
          });

          if (!firstTtsQueued) {
            const hit = takeFirstCompleteSentence(acc);
            if (hit) {
              firstTtsQueued = true;
              firstSentenceEnd = hit.endIndex;
              enqueueTts(hit.sentence);
            }
          }
        }

        if (signal.aborted) return;
        setLoading(false);

        if (!acc.trim()) {
          throw new Error("Empty reply from model");
        }

        if (!firstTtsQueued) {
          enqueueTts(acc.trim());
        } else {
          const rest = acc.slice(firstSentenceEnd).trim();
          if (rest) enqueueTts(rest);
        }

        if (gen !== playbackGenRef.current) return;
        void requestDidTalk(acc, gen, signal);
      } catch (e) {
        if (
          signal.aborted ||
          (e instanceof DOMException && e.name === "AbortError")
        ) {
          return;
        }
        const msg =
          e instanceof Error ? e.message : "Something went wrong. Try again!";
        const errReply = `Oops — I hit a snag: ${msg}. Check your API keys and try again. ⚡`;
        setLoading(false);
        setThread((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { role: "assistant", content: errReply };
          } else {
            next.push({ role: "assistant", content: errReply });
          }
          return next;
        });
        queueAssistantTypewriter(errReply, gen);
      } finally {
        inFlightRef.current = false;
        setLoading(false);
      }
    },
    [
      flushAssistantTyping,
      playElevenLabsThenMaybeWaitForVideo,
      queueAssistantTypewriter,
      requestDidTalk,
      resetPlayback,
    ],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const t = input;
    setInput("");
    void sendChat(t);
  };

  const heroRing = speaking || videoLayerVisible;
  const voiceUiLabel = heroRing
    ? "SPEAKING"
    : voiceStatus === "Thinking..."
      ? "THINKING"
      : voiceStatus === "Speaking..."
        ? "SPEAKING"
        : "READY";

  const typingDotsRow = (
    <div className="flex items-center gap-1" aria-hidden>
      <span className="h-1.5 w-1.5 rounded-full bg-[var(--steel)] animate-typing-dot" />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--steel)] animate-typing-dot"
        style={{ animationDelay: "0.15s" }}
      />
      <span
        className="h-1.5 w-1.5 rounded-full bg-[var(--steel)] animate-typing-dot"
        style={{ animationDelay: "0.3s" }}
      />
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden text-[var(--white)]">
      <a
        href="#helium-chat"
        className={`absolute left-4 top-0 z-[100] -translate-y-full rounded-lg border border-[var(--border)] bg-[var(--bg)] px-4 py-2.5 text-sm font-medium text-[var(--blue)] shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform duration-200 focus:translate-y-4 focus-visible:translate-y-4 ${FOCUS_VISIBLE_RING}`}
      >
        Skip to chat with Helium Hero
      </a>

      {/* ── Background layers ── */}
      <div className="page-bg pointer-events-none fixed inset-0 z-0" aria-hidden />

      {/* Hex grid */}
      <div className="hex-grid pointer-events-none fixed inset-0 z-0" aria-hidden />

      {/* Noise texture */}
      <div className="noise-overlay pointer-events-none fixed inset-0 z-0 opacity-60" aria-hidden />

      {/* Aurora blobs */}
      <div
        className="aurora-blob z-0"
        style={{ top: "5%", left: "10%", width: 500, height: 500, background: "radial-gradient(circle, rgba(100,180,255,0.4), transparent 70%)", animationDuration: "18s" }}
        aria-hidden
      />
      <div
        className="aurora-blob z-0"
        style={{ top: "40%", right: "-5%", width: 450, height: 450, background: "radial-gradient(circle, rgba(80,220,200,0.3), transparent 70%)", animationDuration: "22s", animationDelay: "4s" }}
        aria-hidden
      />
      <div
        className="aurora-blob z-0"
        style={{ bottom: "10%", left: "30%", width: 400, height: 400, background: "radial-gradient(circle, rgba(120,140,220,0.25), transparent 70%)", animationDuration: "26s", animationDelay: "8s" }}
        aria-hidden
      />

      {/* Floating orbs */}
      <div
        className="float-orb z-0"
        style={{ top: "15%", left: "85%", width: 6, height: 6, borderRadius: "50%", background: "var(--blue)", opacity: 0.5, animationDuration: "7s" }}
        aria-hidden
      />
      <div
        className="float-orb z-0"
        style={{ top: "60%", left: "8%", width: 4, height: 4, borderRadius: "50%", background: "var(--steel)", opacity: 0.4, animationDuration: "9s", animationDelay: "2s" }}
        aria-hidden
      />
      <div
        className="float-orb z-0"
        style={{ top: "35%", left: "55%", width: 5, height: 5, borderRadius: "50%", background: "var(--ice)", opacity: 0.35, animationDuration: "11s", animationDelay: "5s" }}
        aria-hidden
      />
      <div
        className="float-orb z-0"
        style={{ top: "75%", left: "70%", width: 3, height: 3, borderRadius: "50%", background: "var(--blue)", opacity: 0.45, animationDuration: "8s", animationDelay: "1s" }}
        aria-hidden
      />


      {/* Gas particles */}
      <div
        className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
        aria-hidden
      >
        {GAS_PRESETS.map((p, i) => (
          <span
            key={i}
            className="gas-particle"
            style={
              {
                left: p.left,
                width: p.size,
                height: p.size,
                animationDuration: `${p.duration}s`,
                animationDelay: `${p.delay}s`,
                "--gas-op": p.op,
                "--gas-drift": p.drift,
              } as React.CSSProperties
            }
          />
        ))}
      </div>

      <nav
        className="relative z-10 w-full border-b border-[var(--border)] py-[1.1rem] max-[640px]:px-4 sm:px-6 lg:px-10"
        aria-label="Site"
      >
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-3 sm:gap-4">
          <p className="font-label min-w-0 text-[0.68rem] leading-snug tracking-wide text-[var(--steel)] sm:text-[0.7rem]">
            ELEMENT DATABASE // NOBLE GAS SERIES
          </p>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <a
              href="#helium-chat"
              className={`font-heading rounded-md border border-[rgba(168,216,240,0.28)] bg-[rgba(168,216,240,0.08)] px-2.5 py-1.5 text-[0.72rem] font-semibold uppercase tracking-wide text-[var(--blue)] transition hover:border-[var(--blue)]/50 hover:bg-[rgba(168,216,240,0.14)] sm:px-3 sm:text-[0.75rem] ${FOCUS_VISIBLE_RING}`}
            >
              Chat
            </a>
            <span className="font-heading rounded-md border border-[var(--border)] bg-[rgba(168,216,240,0.08)] px-2.5 py-1 text-[0.7rem] font-semibold tabular-nums text-[var(--blue)] sm:text-[0.78rem]">
              He · 2
            </span>
          </div>
        </div>
      </nav>

      <main className="relative z-10 mx-auto max-w-7xl space-y-8 px-4 pb-12 pt-6 sm:px-6 sm:pt-8 lg:px-10 max-[640px]:space-y-6 max-[640px]:px-4">
            {/* ── Top section: hero info + chat side-by-side on lg ── */}
            <section
              aria-labelledby="hero-name"
              className="grid gap-6 lg:grid-cols-[minmax(320px,2fr)_minmax(400px,3fr)] lg:items-start lg:gap-8"
            >
              {/* Left column: portrait + info */}
              <div className="space-y-6">
              <div className="flex flex-col items-center gap-6 lg:items-start">
              <div className="flex flex-col items-center gap-4 md:items-start">
                <div
                  role="region"
                  aria-label={
                    heroRing
                      ? "Helium Hero is speaking — glowing portrait frame"
                      : "Helium Hero video frame"
                  }
                  className={`relative w-full max-w-[min(92vw,400px)] rounded-[0.875rem] border border-[var(--border)] ${heroRing ? "hero-portrait-speaking" : "hero-glow-idle"}`}
                >
                  <span
                    className="pointer-events-none absolute left-2 top-2 z-20 h-3.5 w-3.5 border-l-2 border-t-2 border-[var(--blue)]"
                    aria-hidden
                  />
                  <span
                    className="pointer-events-none absolute right-2 top-2 z-20 h-3.5 w-3.5 border-r-2 border-t-2 border-[var(--blue)]"
                    aria-hidden
                  />
                  <span
                    className="pointer-events-none absolute bottom-2 left-2 z-20 h-3.5 w-3.5 border-b-2 border-l-2 border-[var(--blue)]"
                    aria-hidden
                  />
                  <span
                    className="pointer-events-none absolute bottom-2 right-2 z-20 h-3.5 w-3.5 border-b-2 border-r-2 border-[var(--blue)]"
                    aria-hidden
                  />

                  <div className="relative isolate aspect-[3/4] min-h-[260px] w-full overflow-hidden bg-[#0a1218]">
                    {!heroBroken ? (
                      <video
                        ref={idleVideoRef}
                        className="absolute inset-0 z-0 h-full w-full object-cover object-[center_20%] sm:object-[center_15%]"
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
                      <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-4 text-center">
                        <span className="font-heading text-4xl font-bold text-[var(--blue)]">
                          He
                        </span>
                        <p className="font-body text-xs font-normal leading-relaxed text-[var(--muted)]">
                          Add{" "}
                          <code className="text-[var(--steel)]">
                            public/video/duplexnyc_Helium_Hero_full_body_superhero_standing_heroic_pos_a50e06aa-8550-4525-82a3-32a1887d542f_0.mp4
                          </code>{" "}
                          and{" "}
                          <code className="text-[var(--steel)]">
                            public/images/helium-hero.png
                          </code>{" "}
                          (poster).
                        </p>
                      </div>
                    )}
                    <video
                      key={dIdVideoUrl ?? "none"}
                      ref={videoRef}
                      src={dIdVideoUrl ?? undefined}
                      playsInline
                      className={`absolute inset-0 z-10 h-full w-full object-cover object-[center_20%] transition-opacity duration-500 ease-out ${
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

                <div className="flex w-full max-w-[280px] flex-col gap-3 md:max-w-[300px]">
                  <div className="font-label flex items-center gap-2 text-[0.6rem] text-[var(--steel)]">
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                        heroRing
                          ? "bg-[var(--blue)] animate-status-blink"
                          : "bg-[#33aa99]"
                      }`}
                      aria-hidden
                    />
                    <span
                      role="status"
                      aria-live="polite"
                      aria-label={`Voice status: ${voiceStatus}`}
                      className="tracking-wide text-[var(--muted)]"
                    >
                      {voiceUiLabel}
                    </span>
                  </div>

                  {loading || speaking ? (
                    <div className="font-label flex flex-wrap items-center gap-2 text-[0.68rem] text-[var(--muted)]">
                      <button
                        type="button"
                        aria-label="Stop response and voice"
                        onClick={stopActiveChat}
                        className={`inline-flex items-center gap-1.5 rounded-full border border-[rgba(168,216,240,0.28)] bg-[rgba(168,216,240,0.08)] px-2 py-1 font-semibold uppercase tracking-wide text-[var(--blue)] transition hover:border-[var(--blue)]/50 ${FOCUS_VISIBLE_RING}`}
                      >
                        Stop
                      </button>
                    </div>
                  ) : null}
                  {voiceHint ? (
                    <p className="font-label text-[0.65rem] leading-relaxed text-amber-200/90">
                      {voiceHint}
                    </p>
                  ) : null}
                </div>
              </div>

              {/* Left column: title, stats, ability bars */}
              <div className="min-w-0 space-y-5 text-center md:text-left">
                <p className="font-label text-[0.6rem] tracking-[0.2em] text-[var(--steel)]">
                  GUARDIAN OF THE NOBLE GASES
                </p>
                <h1
                  id="hero-name"
                  className="font-heading text-[clamp(2.6rem,6vw,4.2rem)] max-[640px]:text-[2.6rem] font-bold leading-[0.9] text-[var(--blue)]"
                >
                  <span className="block">HELIUM</span>
                  <span className="block">HERO</span>
                </h1>
                <p className="font-body mx-auto max-w-xl text-[0.94rem] font-normal leading-[1.6] text-[var(--muted)] md:mx-0">
                  Chat with the noble gas — explore helium through conversation.
                </p>

                <div className="grid max-[640px]:grid-cols-2 grid-cols-4 gap-2 sm:gap-2">
                  {HERO_STATS.map((cell) => (
                    <div
                      key={`${cell.label}-${cell.value}`}
                      className="surface-card rounded-lg px-3 py-2.5 text-left"
                    >
                      <p className="font-label text-[0.52rem] uppercase tracking-wide text-[var(--steel)] sm:text-[0.54rem]">
                        {cell.label}
                      </p>
                      <p className="font-heading mt-1 text-[1.05rem] font-semibold leading-tight text-[var(--ice)]">
                        {cell.value}
                      </p>
                    </div>
                  ))}
                </div>

              </div>
              </div>
              </div>

              {/* Right column: Chat — sits beside hero on lg, below on mobile */}
              <div
                id="helium-chat"
                className="surface-card chat-panel-focus scroll-mt-24 overflow-hidden rounded-2xl lg:self-stretch lg:flex lg:flex-col"
                role="region"
                aria-labelledby="chat-panel-title"
            >
              <header className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3 sm:px-5">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="font-heading flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[rgba(168,216,240,0.12)] text-sm font-semibold text-[var(--blue)]">
                    He
                  </div>
                  <div className="min-w-0">
                    <h2
                      id="chat-panel-title"
                      className="font-heading text-base font-semibold leading-tight text-[var(--ice)] sm:text-lg"
                    >
                      Chat with Helium Hero
                    </h2>
                    <p className="font-label mt-0.5 text-[0.62rem] tracking-[0.12em] text-[var(--steel)] sm:text-[0.65rem]">
                      ASK HELIUM HERO ANYTHING
                    </p>
                  </div>
                </div>
                {thread.length > 0 ? (
                  <button
                    type="button"
                    aria-label="Clear chat"
                    onClick={clearChat}
                    className={`font-label inline-flex shrink-0 items-center gap-1.5 rounded-full border border-[rgba(168,216,240,0.28)] bg-[rgba(255,255,255,0.03)] px-2.5 py-1.5 text-[0.65rem] uppercase tracking-wide text-[var(--blue)] transition hover:border-[var(--blue)]/55 hover:bg-[rgba(168,216,240,0.09)] ${FOCUS_VISIBLE_RING}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="13"
                      height="13"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0"
                      aria-hidden
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" x2="10" y1="11" y2="17" />
                      <line x1="14" x2="14" y1="11" y2="17" />
                    </svg>
                    Clear
                  </button>
                ) : null}
              </header>

              <p
                id="chat-panel-hint"
                className="border-b border-[var(--border)] px-4 py-2.5 font-body text-[0.88rem] leading-snug text-[var(--muted)] sm:px-5 sm:text-[0.92rem]"
              >
                Ask about helium, Earth, or science — or pick a quick topic.
                Keyboard:&nbsp;Tab through the suggestions, then the message box and
                Send.
              </p>

              <div
                ref={listRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-label="Chat messages"
                className="h-[280px] flex-1 space-y-3 overflow-y-auto overflow-x-hidden px-4 py-4 sm:h-[320px] sm:px-5 max-[640px]:h-[260px] lg:h-auto lg:min-h-[300px]"
              >
                <div className="animate-slide-in-msg flex justify-start">
                  <AssistantBubble>{WELCOME_MESSAGE.content}</AssistantBubble>
                </div>
                {thread.map((m, i) => {
                  const isLiveTyping =
                    m.role === "assistant" &&
                    i === thread.length - 1 &&
                    isTypingAssistant;
                  const displayAssistant = isLiveTyping
                    ? m.content.slice(0, typeRevealLen)
                    : m.content;

                  return (
                    <div
                      key={`${i}-${m.role}-${m.content.slice(0, 12)}`}
                      className={`animate-slide-in-msg flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {m.role === "user" ? (
                        <div className="font-body max-w-[85%] rounded-2xl rounded-tr-[0.2rem] bg-[rgba(255,255,255,0.08)] px-4 py-3 text-[0.92rem] font-normal leading-[1.55] text-[var(--white)] sm:text-[0.98rem]">
                          {m.content}
                        </div>
                      ) : isLiveTyping ? (
                        <AssistantBubble>
                          <div className="relative min-h-[1.375rem]">
                            <div
                              className={`flex transition-opacity duration-200 ease-out ${
                                typeRevealLen > 0
                                  ? "pointer-events-none absolute inset-0 opacity-0"
                                  : "opacity-100"
                              }`}
                            >
                              {typingDotsRow}
                            </div>
                            <p
                              className={`whitespace-pre-wrap text-[0.92rem] font-normal leading-[1.55] text-[var(--white)] transition-opacity duration-200 ease-out sm:text-[0.98rem] ${
                                typeRevealLen === 0 ? "opacity-0" : "opacity-100"
                              }`}
                            >
                              {displayAssistant}
                            </p>
                          </div>
                        </AssistantBubble>
                      ) : (
                        <AssistantBubble>{m.content}</AssistantBubble>
                      )}
                    </div>
                  );
                })}
                {loading && (
                  <div className="flex justify-start animate-slide-in-msg">
                    <div className="flex items-center gap-1 rounded-2xl rounded-tl-[0.2rem] border border-[rgba(168,216,240,0.2)] bg-[rgba(168,216,240,0.09)] px-4 py-3">
                      {typingDotsRow}
                    </div>
                  </div>
                )}
              </div>

              <div className="border-t border-[var(--border)] bg-transparent">
                <div
                  className="flex flex-wrap gap-2 overflow-x-auto px-4 py-3 sm:px-5 [scrollbar-width:thin]"
                  role="toolbar"
                  aria-label="Quick questions"
                >
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      disabled={loading}
                      onClick={() => void sendChat(q.text)}
                      aria-label={q.text}
                      className={`font-body min-h-10 shrink-0 whitespace-nowrap rounded-[2rem] border border-[rgba(168,216,240,0.18)] bg-[rgba(255,255,255,0.05)] px-3 py-2 text-[0.8rem] font-normal text-[var(--white)] transition hover:border-[rgba(168,216,240,0.4)] hover:bg-[rgba(168,216,240,0.1)] disabled:opacity-50 ${FOCUS_VISIBLE_RING}`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>

                {showSoundUnlock ? (
                  <div className="border-t border-[var(--border)] px-4 py-2 sm:px-5">
                    <button
                      type="button"
                      aria-label="Enable sound: unmute Helium Hero voice and video after the browser blocked playback until you interact"
                      className={`font-label min-h-11 w-full rounded-lg border border-[rgba(168,216,240,0.35)] bg-[rgba(168,216,240,0.08)] py-2.5 text-[0.75rem] font-semibold uppercase tracking-wide text-[var(--blue)] transition hover:bg-[rgba(168,216,240,0.12)] ${FOCUS_VISIBLE_RING}`}
                      onClick={() => void soundUnlockRef.current?.()}
                    >
                      Enable sound
                    </button>
                  </div>
                ) : null}

                <form
                  className="border-t border-[var(--border)] p-4 sm:p-5"
                  onSubmit={onSubmit}
                  aria-describedby="chat-panel-hint"
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch sm:gap-3">
                    <label htmlFor="chat-message-input" className="sr-only">
                      Message to Helium Hero
                    </label>
                    <input
                      id="chat-message-input"
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Ask Helium Hero…"
                      className={`font-body min-h-12 min-w-0 flex-1 rounded-lg border border-[var(--border)] bg-[rgba(255,255,255,0.06)] px-4 py-3 text-[0.94rem] font-normal text-[var(--white)] outline-none transition placeholder:text-[var(--dim)] focus:border-[rgba(168,216,240,0.45)] ${FOCUS_VISIBLE_RING}`}
                      disabled={loading}
                      autoComplete="off"
                      aria-label="Message to Helium Hero"
                    />
                    <button
                      type="submit"
                      disabled={loading || !input.trim()}
                      className={`font-heading min-h-12 shrink-0 rounded-lg border border-[rgba(168,216,240,0.32)] bg-[rgba(168,216,240,0.12)] px-6 py-3 text-[0.94rem] font-semibold text-[var(--blue)] transition hover:border-[var(--blue)]/45 hover:bg-[rgba(168,216,240,0.16)] disabled:opacity-40 ${FOCUS_VISIBLE_RING}`}
                    >
                      Send
                    </button>
                  </div>
                </form>
              </div>
              </div>
            </section>

            {/* Ability bars — own section below the hero+chat grid */}
            <section className="surface-card rounded-2xl p-5 sm:p-6">
              <p className="font-label text-[0.58rem] uppercase tracking-[0.12em] text-[var(--steel)]">
                Ability ratings — with definitions
              </p>
              <div className="mt-4 grid gap-5 sm:grid-cols-2">
                {ABILITY_BARS.map((a, i) => (
                  <div key={a.label} className="space-y-1.5">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-heading text-[0.9rem] font-semibold capitalize text-[var(--ice)] sm:text-[0.95rem]">
                        {a.label}
                      </span>
                      <span className="font-label text-[0.65rem] tabular-nums text-[var(--steel)]">
                        {a.pct}%
                      </span>
                    </div>
                    <p className="font-body text-[0.78rem] font-normal leading-snug text-[var(--muted)] sm:text-[0.8rem]">
                      <span className="font-label text-[0.58rem] uppercase tracking-wide text-[var(--blue)]">
                        Definition —{" "}
                      </span>
                      {a.definition}
                    </p>
                    <p className="font-body text-[0.78rem] font-normal leading-snug text-[var(--muted)] sm:text-[0.8rem]">
                      <span className="font-semibold text-[var(--ice)]">
                        For helium:{" "}
                      </span>
                      {a.meaning}
                    </p>
                    <div
                      className="h-2 overflow-hidden rounded-sm bg-[rgba(255,255,255,0.07)]"
                      aria-hidden
                    >
                      <div
                        className="ability-fill h-full rounded-sm bg-gradient-to-r from-[var(--steel)] to-[var(--blue)]"
                        style={{
                          width: `${a.pct}%`,
                          animationDelay: `${0.12 + i * 0.12}s`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section
              className="surface-card flex flex-col gap-6 rounded-2xl p-5 sm:p-6 md:flex-row md:items-stretch md:gap-8 lg:p-[1.25rem_1.5rem]"
              aria-labelledby="atmosphere-heading"
            >
              <div className="min-w-0 flex-1 space-y-4">
                <h2
                  id="atmosphere-heading"
                  className="font-label text-[0.65rem] tracking-[0.15em] text-[var(--steel)] sm:text-[0.68rem]"
                >
                  EARTH&apos;S ATMOSPHERE COMPOSITION
                </h2>
                <div className="space-y-3">
                  {ATMOSPHERE_ROWS.map((row) => {
                    const barW =
                      row.pct < 0.02
                        ? Math.max(row.pct * 1200, row.highlight ? 6 : 2)
                        : row.pct;
                    return (
                      <div
                        key={row.name}
                        className="flex items-center gap-3"
                      >
                        <span
                          className={`font-body w-[120px] min-w-[120px] shrink-0 text-[0.82rem] font-normal ${row.highlight ? "font-medium text-[var(--blue)]" : "text-[var(--muted)]"}`}
                        >
                          {row.name}
                        </span>
                        <div className="relative h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[rgba(255,255,255,0.06)]">
                          <span
                            className="absolute inset-y-0 left-0 rounded-full"
                            style={{
                              width: `${Math.min(barW, 100)}%`,
                              minWidth: row.highlight ? "4px" : undefined,
                              background: row.fill,
                              boxShadow: row.highlight
                                ? "0 0 12px 2px rgba(168,216,240,0.35)"
                                : undefined,
                            }}
                          />
                        </div>
                        <span className="font-label w-14 shrink-0 text-right text-[0.6rem] tabular-nums text-[var(--steel)]">
                          {row.pct < 0.01
                            ? `${row.pct.toFixed(4)}%`
                            : `${row.pct}%`}
                        </span>
                      </div>
                    );
                  })}
                </div>
                <p className="font-body pt-1 text-[0.84rem] font-normal italic leading-relaxed text-[var(--muted)]">
                  Helium is so light it escapes Earth&apos;s gravity — constantly
                  drifting into space.
                </p>
              </div>
              <div className="flex min-w-0 flex-col items-stretch justify-center max-[640px]:w-full md:w-auto">
                <div className="surface-card flex min-w-[110px] flex-col items-center justify-center rounded-xl bg-[rgba(168,216,240,0.06)] px-6 py-8 text-center max-[640px]:w-full">
                  <p className="font-heading text-3xl font-bold text-[var(--blue)]">
                    He
                  </p>
                  <p className="font-label mt-2 text-[0.55rem] tracking-wide text-[var(--steel)]">
                    NOBLE GAS
                  </p>
                  <p className="font-body mt-4 max-w-[12rem] text-[0.78rem] font-normal leading-snug text-[var(--muted)]">
                    24% of the universe by mass
                  </p>
                </div>
              </div>
            </section>

            <section
              className="space-y-4"
              aria-labelledby="facts-heading"
            >
              <div>
                <h2
                  id="facts-heading"
                  className="font-heading text-xl font-semibold text-[var(--ice)] sm:text-2xl"
                >
                  Helium facts — for Earth and beyond
                </h2>
                <p className="font-body mt-2 max-w-2xl text-[0.92rem] font-normal leading-relaxed text-[var(--muted)]">
                  From the lab to the sky: ways helium shows up in life on Earth.
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 max-[900px]:grid-cols-2 max-[500px]:grid-cols-1 sm:gap-[0.65rem]">
                {FACT_CARDS.map((f) => (
                  <article
                    key={f.title}
                    className="surface-card rounded-xl px-[1rem] py-[0.95rem]"
                  >
                    <span className="text-lg" aria-hidden>
                      {f.emoji}
                    </span>
                    <h3 className="font-heading mt-2 text-[0.9rem] font-semibold leading-snug text-[var(--blue)]">
                      {f.title}
                    </h3>
                    <p className="font-body mt-2 text-[0.8rem] font-normal leading-relaxed text-[var(--muted)]">
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
