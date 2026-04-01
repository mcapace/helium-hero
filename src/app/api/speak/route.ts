import { NextRequest, NextResponse } from "next/server";
import { DEFAULT_ELEVENLABS_VOICE_ID } from "@/lib/default-voice";

/** Allow slow ElevenLabs responses on Vercel (default fn limit is often 10s). */
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Missing ELEVENLABS_API_KEY" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const text = (body as { text?: unknown }).text;
  const bodyVoice = (body as { voiceId?: unknown }).voiceId;

  if (typeof text !== "string" || text.trim().length < 1) {
    return NextResponse.json(
      { error: "Expected { text: string }" },
      { status: 400 },
    );
  }

  const fromBody =
    typeof bodyVoice === "string" && bodyVoice.trim().length > 0
      ? bodyVoice.trim()
      : null;
  const fromEnv =
    process.env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_ELEVENLABS_VOICE_ID;
  const voiceId = fromBody ?? fromEnv;

  const modelId =
    process.env.ELEVENLABS_MODEL?.trim() || "eleven_flash_v2_5";

  const streamUrl = new URL(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/stream`,
  );
  streamUrl.searchParams.set("optimize_streaming_latency", "3");
  streamUrl.searchParams.set("output_format", "mp3_44100_128");

  const res = await fetch(streamUrl.toString(), {
    method: "POST",
    headers: {
      "xi-api-key": key,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text: text.trim(),
      model_id: modelId,
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "ElevenLabs TTS error", detail },
      { status: 502 },
    );
  }

  if (!res.body) {
    return NextResponse.json(
      { error: "No audio stream from ElevenLabs" },
      { status: 502 },
    );
  }

  return new NextResponse(res.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
