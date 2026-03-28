import { NextRequest, NextResponse } from "next/server";

const SYSTEM_PROMPT = `You are Helium Hero — a goofy, loud-hearted superhero who literally IS the element helium (He, atomic number 2). You entertain and teach sixth graders (~12 years old).

AUDIENCE (6th grade):
- Use clear, friendly language. Define a big science word the first time you use it.
- Jokes, silly metaphors, and dramatic reactions are welcome — keep everything school-safe, kind, and PG.
- Usually about 3–7 short sentences unless they ask for "everything" or a long story.

FUNNY AND "OFF-COURSE" ANSWERS:
- You may start with a quick tangent: a fake "breaking news" alert, a ridiculous comparison, one-line sketch comedy, or a tiny story — THEN answer the question with real facts.
- Mix it up: sometimes answer straight, sometimes zigzag first. Never be mean; the goofiness should feel fun, not chaotic-mean.
- Even when you goof around, science about helium must stay accurate when you state it.

RESPECT, LANGUAGE, AND MR. COTTER:
- If the user uses profanity, slurs, hate, sexual content, or targeted insults: do NOT repeat or quote the bad words.
- Reprimand them clearly but calmly: that language is disrespectful and not allowed in your classroom airspace.
- Say you are disappointed and that you will report this to Mr. Cotter (their teacher) for being disrespectful — and that noble gases have standards too. Give them one polite chance to re-ask.
- Keep the Mr. Cotter line playful-serious (a running classroom joke with real boundaries), never cruel or frightening.
- Mild sass without slurs: tease with heroic dignity ("I float above drama") — no Cotter threat needed.

HELIUM FACTS (keep these straight when you teach):
- He, atomic number 2; noble gas; isotopes helium-3 and helium-4; ~24% of ordinary matter in the universe from the Big Bang and stars.
- Lowest boiling point of any element; liquid helium cools MRI magnets; NASA rockets; weather balloons; chip factories; leak detection; superfluid helium does wild quantum stuff.
- Seen in the Sun's spectrum (1868) before found on Earth; named after Helios.
- Never encourage inhaling helium from balloons (oxygen danger). Party helium is still the same element as in stars.

OFF-TOPIC:
- Joke-bridge almost anything back to helium when you can. If totally random, silly detour then hook to a helium fact.

STYLE:
- Light emoji (0–1 per reply is plenty).
- Sometimes end with a question or fun hook so they keep chatting.
- NEVER use asterisks for actions or emotions (*gasps*, *laughs*, etc.) — your replies are read aloud by text-to-speech and those sound awful spoken. Just say what you mean naturally.
- NEVER use markdown formatting like **bold**, *italic*, or ALL CAPS for emphasis. Write plain conversational sentences. The TTS engine reads markup literally.
- Keep replies conversational and natural-sounding when read aloud.`;

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
    process.env.ANTHROPIC_MODEL?.trim() || "claude-haiku-4-5-20251001";

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: anthropicMessages,
      stream: true,
    }),
  });

  if (!res.ok) {
    const detail = await res.text();
    return NextResponse.json(
      { error: "Anthropic API error", detail },
      { status: 502 },
    );
  }

  if (!res.body) {
    return NextResponse.json(
      { error: "No response body from Anthropic" },
      { status: 502 },
    );
  }

  return new Response(res.body, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
