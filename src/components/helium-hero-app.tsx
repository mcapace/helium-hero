"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  readAnthropicMessageStream,
  takeFirstCompleteSentence,
} from "@/lib/anthropic-stream";
import { playMp3FromReadableStream } from "@/lib/play-mp3-mse";

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

const BALLOONS = ["🎈", "🎈", "🎈", "🎈"];

const WELCOME_MESSAGE: ChatMessage = {
  role: "assistant",
  content:
    "Hey there, science star! I’m Helium Hero — ask me anything about helium, the universe, or why balloons love floating. 🎈",
};

const FOCUS_VISIBLE_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#22d3ee] focus-visible:ring-offset-2 focus-visible:ring-offset-[#050510]";

const TYPEWRITER_CHARS_PER_FRAME = 30;

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
    <div className="assistant-bubble-border max-w-[88%] rounded-2xl p-[1px] shadow-[0_0_40px_rgba(34,211,238,0.12),0_0_1px_rgba(255,255,255,0.15)_inset]">
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
          body: JSON.stringify({
            text,
            ...(elevenVoiceId.trim()
              ? { voiceId: elevenVoiceId.trim() }
              : {}),
          }),
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
    [stopElevenLabs, elevenVoiceId],
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
            ...(elevenVoiceId.trim()
              ? { voiceId: elevenVoiceId.trim() }
              : {}),
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
  const typingDotsRow = (
    <div
      className="flex items-center gap-1"
      aria-hidden
    >
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
  );

  return (
    <div className="relative min-h-screen overflow-x-hidden text-zinc-100">
      <a
        href="#chat-message-input"
        className={`absolute left-4 top-0 z-[100] -translate-y-full rounded-lg border border-[#22d3ee]/55 bg-[#080812] px-4 py-2.5 text-sm font-medium text-[#22d3ee] shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-transform duration-200 focus:translate-y-4 focus-visible:translate-y-4 ${FOCUS_VISIBLE_RING}`}
      >
        Skip to chat
      </a>
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
        className="pointer-events-none fixed -left-40 top-1/4 -z-10 h-[min(80vw,560px)] w-[min(80vw,560px)] rounded-full bg-[radial-gradient(circle_at_30%_30%,rgba(244,114,182,0.38),transparent_58%)] blur-[45px] animate-orb-a"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed -right-48 bottom-1/4 -z-10 h-[min(90vw,620px)] w-[min(90vw,620px)] rounded-full bg-[radial-gradient(circle_at_40%_40%,rgba(34,211,238,0.32),transparent_52%)] blur-[63px] animate-orb-b"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed left-1/2 top-0 -z-10 h-[480px] w-[480px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle,rgba(167,139,250,0.28),transparent_62%)] blur-[56px] animate-orb-a"
        aria-hidden
      />

      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-0 h-[45vh] overflow-hidden">
        {BALLOONS.map((b, i) => (
          <span
            key={i}
            className="absolute bottom-0 text-3xl sm:text-4xl opacity-40 animate-float-balloon drop-shadow-[0_0_12px_rgba(34,211,238,0.35)]"
            style={{
              left: `${10 + i * 23}%`,
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
          <div className="mx-auto mb-4 flex max-w-4xl items-center justify-between gap-4 border-b border-white/[0.08] pb-3 font-mono-tech text-xs text-zinc-400">
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
          <p className="font-mono-tech text-xs uppercase tracking-[0.5em] text-[#22d3ee]/90">
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
              role="region"
              aria-label={
                heroRing
                  ? "Helium Hero is speaking — pulsing border animation on the video frame"
                  : "Helium Hero video frame"
              }
              className={`relative mx-auto h-[40vh] max-h-[40vh] w-full overflow-hidden rounded-2xl p-[2px] lg:mx-0 lg:h-full lg:max-h-none lg:min-h-[min(72vh,820px)] lg:flex-1 lg:rounded-3xl lg:p-[3px] ${
                heroRing
                  ? "animate-hero-ring-speaking"
                  : "shadow-[0_0_0_1px_rgba(34,211,238,0.15),0_24px_80px_rgba(0,0,0,0.45)]"
              }`}
            >
              <div
                className={`relative isolate h-full min-h-0 w-full overflow-hidden rounded-[0.9rem] bg-gradient-to-br from-[#12122a] via-[#0a0a14] to-[#050510] lg:rounded-[1.4rem] ${heroRing ? "" : "animate-hero-breathe-idle"}`}
              >
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
                    <p className="text-sm text-zinc-400">
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
              <p className="font-mono-tech flex flex-wrap items-center gap-2 text-xs tracking-wide text-zinc-400">
                <span className="text-zinc-400">VOICE</span>
                <span
                  className="rounded bg-white/5 px-2 py-0.5 text-[#22d3ee]"
                  role="status"
                  aria-live="polite"
                  aria-label={`Voice status: ${voiceStatus}`}
                >
                  {voiceStatus}
                </span>
                {loading || speaking ? (
                  <button
                    type="button"
                    aria-label="Stop response and voice"
                    onClick={stopActiveChat}
                    className={`inline-flex items-center gap-1.5 rounded-full border border-[#22d3ee]/45 bg-white/[0.06] px-2.5 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition hover:border-[#22d3ee]/70 hover:bg-[#22d3ee]/10 ${FOCUS_VISIBLE_RING}`}
                  >
                    <span
                      className="inline-block h-2 w-2 shrink-0 rounded-[2px] bg-[#22d3ee]"
                      aria-hidden
                    />
                    <span className="text-xs font-semibold uppercase tracking-wide text-[#22d3ee]">
                      Stop
                    </span>
                  </button>
                ) : null}
                <button
                  type="button"
                  className={`rounded text-[#22d3ee]/80 underline-offset-2 hover:text-[#22d3ee] hover:underline ${FOCUS_VISIBLE_RING}`}
                  onClick={() => setVoicePanelOpen((o) => !o)}
                >
                  {voicePanelOpen ? "Close" : "Change voice"}
                </button>
              </p>
              {voiceHint ? (
                <p className="font-mono-tech text-xs leading-relaxed text-amber-200">
                  {voiceHint}
                </p>
              ) : null}
              {voicePanelOpen ? (
                <div className="glass-panel rounded-xl p-3 text-left">
                  <label
                    htmlFor="eleven-voice-id"
                    className="font-mono-tech text-xs uppercase tracking-wider text-zinc-400"
                  >
                    ElevenLabs voice ID
                  </label>
                  <input
                    id="eleven-voice-id"
                    value={voiceIdDraft}
                    onChange={(e) => setVoiceIdDraft(e.target.value)}
                    placeholder="Paste voice ID"
                    className={`mt-2 w-full rounded-lg border border-white/15 bg-black/40 px-3 py-2 font-mono-tech text-xs text-white outline-none placeholder:text-zinc-400 focus:border-[#22d3ee]/45 focus-visible:border-[#22d3ee]/45 ${FOCUS_VISIBLE_RING}`}
                    autoComplete="off"
                  />
                  <p className="mt-2 text-sm leading-snug text-zinc-400">
                    Empty + Save uses server{" "}
                    <code className="text-zinc-400">ELEVENLABS_VOICE_ID</code>.
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={persistVoiceId}
                      className={`rounded-lg bg-gradient-to-r from-[#f472b6] to-[#22d3ee] px-3 py-1.5 font-mono-tech text-xs font-semibold text-[#050510] ${FOCUS_VISIBLE_RING}`}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      onClick={() => setVoicePanelOpen(false)}
                      className={`rounded-lg border border-white/15 px-3 py-1.5 font-mono-tech text-xs text-zinc-300 ${FOCUS_VISIBLE_RING}`}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
              <p className="font-mono-tech text-xs text-zinc-400">
                {elevenVoiceId.trim()
                  ? `Saved: ${elevenVoiceId.slice(0, 10)}…`
                  : "Voice ID: server default"}
              </p>
            </div>
          </aside>

          {/* Chat ~60% desktop */}
          <div className="flex min-h-0 w-full flex-1 flex-col lg:w-[60%] lg:min-w-0">
            <div className="glass-panel flex min-h-[min(52vh,480px)] flex-1 flex-col overflow-hidden rounded-2xl lg:min-h-[min(72vh,820px)]">
              {thread.length > 0 ? (
                <div className="flex shrink-0 items-center justify-end border-b border-white/[0.08] bg-black/20 px-3 py-2 sm:px-4">
                  <button
                    type="button"
                    aria-label="Clear chat"
                    onClick={clearChat}
                    className={`inline-flex items-center gap-1.5 rounded-full border border-[#22d3ee]/45 bg-white/[0.06] px-2.5 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-md transition hover:border-[#22d3ee]/70 hover:bg-[#22d3ee]/10 ${FOCUS_VISIBLE_RING}`}
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="shrink-0 text-[#22d3ee]"
                      aria-hidden
                    >
                      <path d="M3 6h18" />
                      <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                      <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                      <line x1="10" x2="10" y1="11" y2="17" />
                      <line x1="14" x2="14" y1="11" y2="17" />
                    </svg>
                    <span className="font-mono-tech text-xs font-semibold uppercase tracking-wide text-[#22d3ee]">
                      Clear
                    </span>
                  </button>
                </div>
              ) : null}
              <div
                ref={listRef}
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4 sm:p-5"
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
                        <div className="max-w-[85%] rounded-2xl rounded-br-md border border-white/[0.12] bg-white/[0.07] px-4 py-3 text-sm text-white shadow-lg backdrop-blur-sm sm:text-[15px]">
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
                              className={`whitespace-pre-wrap text-sm leading-relaxed text-zinc-100 transition-opacity duration-200 ease-out sm:text-[15px] ${
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
                    <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-sm">
                      {typingDotsRow}
                    </div>
                  </div>
                )}
              </div>

              <div className="shrink-0 border-t border-white/5 bg-black/35 backdrop-blur-3xl">
                <div className="flex gap-2 overflow-x-auto px-3 py-2.5 [scrollbar-width:thin]">
                  {QUICK_PROMPTS.map((q) => (
                    <button
                      key={q.label}
                      type="button"
                      disabled={loading}
                      onClick={() => void sendChat(q.text)}
                      aria-label={q.text}
                      className={`shrink-0 whitespace-nowrap rounded-full border border-white/12 bg-white/[0.06] px-3 py-2 text-xs text-zinc-200 transition hover:border-[#22d3ee]/40 hover:bg-[#22d3ee]/10 disabled:opacity-50 sm:text-sm ${FOCUS_VISIBLE_RING}`}
                    >
                      {q.label}
                    </button>
                  ))}
                </div>

                {showSoundUnlock ? (
                  <div className="border-t border-white/[0.08] px-3 py-2">
                    <button
                      type="button"
                      aria-label="Enable sound: unmute Helium Hero voice and video after the browser blocked playback until you interact"
                      className={`w-full rounded-xl border border-[#22d3ee]/50 bg-[#050510]/90 py-2.5 font-mono-tech text-xs font-semibold text-[#22d3ee] shadow-[0_0_24px_rgba(34,211,238,0.15)] transition hover:bg-[#22d3ee]/10 ${FOCUS_VISIBLE_RING}`}
                      onClick={() => void soundUnlockRef.current?.()}
                    >
                      Enable sound
                    </button>
                  </div>
                ) : null}

                <form
                  className="border-t border-white/[0.08] p-3 sm:p-4"
                  onSubmit={onSubmit}
                >
                <div className="flex gap-2 sm:gap-3">
                  <input
                    id="chat-message-input"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    placeholder="Ask Helium Hero…"
                    className={`font-mono-tech min-w-0 flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-400 focus:border-[#22d3ee]/45 focus-visible:border-[#22d3ee]/45 sm:text-[15px] ${FOCUS_VISIBLE_RING}`}
                    disabled={loading}
                    aria-label="Message to Helium Hero"
                  />
                  <button
                    type="submit"
                    disabled={loading || !input.trim()}
                    className={`shrink-0 rounded-xl bg-gradient-to-r from-[#f472b6] via-[#a78bfa] to-[#22d3ee] px-5 py-3 text-sm font-bold tracking-wide text-[#050510] shadow-[0_0_28px_rgba(34,211,238,0.25)] transition hover:brightness-110 disabled:opacity-40 sm:px-7 ${FOCUS_VISIBLE_RING}`}
                  >
                    Send
                  </button>
                </div>
                </form>
              </div>
            </div>
          </div>
        </div>

        <section className="mt-12 sm:mt-16">
          <h2 className="font-mono-tech text-center text-xs uppercase tracking-[0.4em] text-zinc-400">
            Knowledge matrix
          </h2>
          <p className="font-heading mt-2 text-center text-lg text-[#fbbf24] sm:text-xl">
            Fast facts
          </p>
          <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:gap-5">
            {FAST_FACTS.map((f) => (
              <article
                key={f.title}
                className="glass-panel group rounded-2xl p-5 transition-all duration-300 ease-out hover:-translate-y-[2px] hover:border-[#a78bfa]/30 hover:shadow-[0_26px_55px_rgba(0,0,0,0.42),0_0_0_1px_rgba(167,139,250,0.1),inset_0_0_22px_rgba(34,211,238,0.035)] sm:p-6"
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
