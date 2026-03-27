import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT =
  "You are Helium Hero, a superhero who embodies the element Helium (He, atomic number 2). You are an educational guide for school students. Speak with enthusiasm and wonder. Use simple language for middle school students. Keep answers to 2-4 sentences. Use occasional emojis.";

export async function POST(req: NextRequest) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    return NextResponse.json(
      { error: "Server missing ANTHROPIC_API_KEY" },
      { status: 500 },
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json(
      { error: "Expected non-empty messages array" },
      { status: 400 },
    );
  }

  const anthropicMessages: { role: "user" | "assistant"; content: string }[] =
    [];
  for (const m of messages) {
    if (
      !m ||
      typeof m !== "object" ||
      !("role" in m) ||
      !("content" in m) ||
      (m.role !== "user" && m.role !== "assistant") ||
      typeof m.content !== "string"
    ) {
      return NextResponse.json(
        { error: "Each message must be { role, content }" },
        { status: 400 },
      );
    }
    anthropicMessages.push({ role: m.role, content: m.content });
  }

  if (anthropicMessages[0]?.role !== "user") {
    return NextResponse.json(
      { error: "First message must be from the user" },
      { status: 400 },
    );
  }

  const model =
    process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-20250514";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: anthropicMessages,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Anthropic API error", detail },
      { status: 502 },
    );
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
  };
  const textBlock = data.content?.find((c) => c.type === "text");
  const reply = textBlock?.text?.trim() ?? "";

  return NextResponse.json({ reply } satisfies { reply: string });
}
