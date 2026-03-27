import { NextRequest, NextResponse } from "next/server";

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
    return NextResponse.json({ error: "Expected { text: string }" }, { status: 400 });
  }

  const fromBody =
    typeof bodyVoice === "string" && bodyVoice.trim().length > 0
      ? bodyVoice.trim()
      : null;
  const fromEnv = process.env.ELEVENLABS_VOICE_ID?.trim() || null;
  const voiceId = fromBody ?? fromEnv;

  if (!voiceId) {
    return NextResponse.json(
      {
        error:
          "No voice ID: send { voiceId } in the JSON body or set ELEVENLABS_VOICE_ID",
      },
      { status: 400 },
    );
  }

  const modelId =
    process.env.ELEVENLABS_MODEL?.trim() || "eleven_turbo_v2_5";

  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}`;
  const res = await fetch(url, {
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

  const audio = await res.arrayBuffer();
  return new NextResponse(audio, {
    headers: {
      "Content-Type": "audio/mpeg",
      "Cache-Control": "no-store",
    },
  });
}
