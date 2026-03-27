import { NextRequest, NextResponse } from "next/server";

export const maxDuration = 120;

function dIdAuthHeader(): string | null {
  const raw = process.env.D_ID_API_KEY?.trim();
  if (!raw) return null;
  const token = Buffer.from(raw, "utf8").toString("base64");
  return `Basic ${token}`;
}

export async function POST(req: NextRequest) {
  const auth = dIdAuthHeader();
  const heroUrl = process.env.NEXT_PUBLIC_HERO_IMAGE_URL?.trim();
  const elevenKey = process.env.ELEVENLABS_API_KEY;
  const voiceId = process.env.ELEVENLABS_VOICE_ID;

  if (!auth) {
    return NextResponse.json(
      { error: "Server missing D_ID_API_KEY" },
      { status: 500 },
    );
  }
  if (!heroUrl) {
    return NextResponse.json(
      { error: "Server missing NEXT_PUBLIC_HERO_IMAGE_URL" },
      { status: 500 },
    );
  }
  if (!elevenKey || !voiceId) {
    return NextResponse.json(
      { error: "Missing ELEVENLABS_API_KEY or ELEVENLABS_VOICE_ID for D-ID" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const action = (body as { action?: unknown }).action;
  const text = (body as { text?: unknown }).text;
  if (action !== "talk") {
    return NextResponse.json(
      { error: 'Expected { action: "talk", text: string }' },
      { status: 400 },
    );
  }
  if (typeof text !== "string" || text.trim().length < 3) {
    return NextResponse.json({ error: "text must be at least 3 characters" }, { status: 400 });
  }

  const external = JSON.stringify({ elevenlabs: elevenKey });

  const create = await fetch("https://api.d-id.com/talks", {
    method: "POST",
    headers: {
      Authorization: auth,
      "Content-Type": "application/json",
      "x-api-key-external": external,
    },
    body: JSON.stringify({
      source_url: heroUrl,
      script: {
        type: "text",
        input: text.trim(),
        provider: {
          type: "elevenlabs",
          voice_id: voiceId,
          voice_config: { stability: 0.5, similarity_boost: 0.75 },
        },
      },
      config: { fluent: true, pad_audio: 0.5 },
    }),
  });

  if (!create.ok) {
    const detail = await create.text();
    return NextResponse.json(
      { error: "D-ID create talk failed", detail },
      { status: 502 },
    );
  }

  const created = (await create.json()) as { id?: string };
  const id = created.id;
  if (!id) {
    return NextResponse.json(
      { error: "D-ID did not return talk id" },
      { status: 502 },
    );
  }

  const deadline = Date.now() + 110_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));

    const poll = await fetch(`https://api.d-id.com/talks/${encodeURIComponent(id)}`, {
      headers: { Authorization: auth },
    });

    if (!poll.ok) {
      const detail = await poll.text();
      return NextResponse.json(
        { error: "D-ID poll failed", detail },
        { status: 502 },
      );
    }

    const status = (await poll.json()) as {
      status?: string;
      result_url?: string;
    };

    if (status.status === "done" && status.result_url) {
      return NextResponse.json({ videoUrl: status.result_url });
    }
    if (status.status === "error" || status.status === "rejected") {
      return NextResponse.json(
        { error: "D-ID talk failed", status: status.status },
        { status: 502 },
      );
    }
  }

  return NextResponse.json(
    { error: "D-ID talk timed out while processing" },
    { status: 504 },
  );
}
