/**
 * Parses Anthropic Messages SSE and yields text_delta chunks.
 */
export async function* readAnthropicMessageStream(
  body: ReadableStream<Uint8Array>,
  signal: AbortSignal,
): AsyncGenerator<string, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      if (signal.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      for (;;) {
        const sep = buffer.indexOf("\n\n");
        if (sep === -1) break;
        const block = buffer.slice(0, sep);
        buffer = buffer.slice(sep + 2);

        for (const rawLine of block.split("\n")) {
          const line = rawLine.replace(/\r$/, "");
          if (!line.startsWith("data: ")) continue;
          const payload = line.slice(6).trim();
          if (payload === "[DONE]") return;

          let evt: unknown;
          try {
            evt = JSON.parse(payload);
          } catch {
            continue;
          }
          if (!evt || typeof evt !== "object") continue;

          const type = (evt as { type?: string }).type;
          if (type === "error") {
            const err = (evt as { error?: { message?: string } }).error;
            throw new Error(err?.message ?? "Anthropic stream error");
          }

          if (type === "content_block_delta") {
            const delta = (evt as { delta?: { type?: string; text?: string } })
              .delta;
            if (
              delta?.type === "text_delta" &&
              typeof delta.text === "string" &&
              delta.text.length > 0
            ) {
              yield delta.text;
            }
          }
        }
      }
    }

    if (buffer.trim()) {
      for (const rawLine of buffer.split("\n")) {
        const line = rawLine.replace(/\r$/, "");
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (payload === "[DONE]") return;

        let evt: unknown;
        try {
          evt = JSON.parse(payload);
        } catch {
          continue;
        }
        if (!evt || typeof evt !== "object") continue;

        const type = (evt as { type?: string }).type;
        if (type === "error") {
          const err = (evt as { error?: { message?: string } }).error;
          throw new Error(err?.message ?? "Anthropic stream error");
        }

        if (type === "content_block_delta") {
          const delta = (evt as { delta?: { type?: string; text?: string } })
            .delta;
          if (
            delta?.type === "text_delta" &&
            typeof delta.text === "string" &&
            delta.text.length > 0
          ) {
            yield delta.text;
          }
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/** First sentence ending in . ! or ? (followed by space or EOS). */
export function takeFirstCompleteSentence(text: string): {
  sentence: string;
  endIndex: number;
} | null {
  const m = text.match(/^[\s\S]*?[.!?](?=\s|$)/);
  if (!m || m.index === undefined) return null;
  const sentence = m[0].trim();
  if (sentence.length < 2) return null;
  return { sentence, endIndex: m.index + m[0].length };
}
