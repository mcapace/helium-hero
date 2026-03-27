function waitSourceBuffer(sb: SourceBuffer): Promise<void> {
  return new Promise((resolve) => {
    if (!sb.updating) {
      resolve();
      return;
    }
    sb.addEventListener("updateend", () => resolve(), { once: true });
  });
}

export type PlayMp3StreamOpts = {
  signal: AbortSignal;
  cancelled: () => boolean;
  /** Called once MediaSource is wired; set audio/src refs here. */
  attach: (audio: HTMLAudioElement, objectUrl: string) => void;
  onPlaying: () => void;
  onSpeakingStop: () => void;
  onNotAllowed: (tryPlay: () => Promise<void>) => void;
  onDecodeError: () => void;
};

/**
 * Stream MP3 chunks into MediaSource so playback can start before the full file downloads.
 */
export function playMp3FromReadableStream(
  stream: ReadableStream<Uint8Array>,
  opts: PlayMp3StreamOpts,
): Promise<void> {
  const {
    signal,
    cancelled,
    attach,
    onPlaying,
    onSpeakingStop,
    onNotAllowed,
    onDecodeError,
  } = opts;

  const ms = new MediaSource();
  const objectUrl = URL.createObjectURL(ms);
  const audio = new Audio();
  audio.src = objectUrl;
  attach(audio, objectUrl);

  return new Promise((resolve) => {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      try {
        audio.pause();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(objectUrl);
      resolve();
    };

    signal.addEventListener("abort", () => settle(), { once: true });

    audio.addEventListener(
      "ended",
      () => {
        onSpeakingStop();
        settle();
      },
      { once: true },
    );

    audio.addEventListener(
      "error",
      () => {
        onDecodeError();
        settle();
      },
      { once: true },
    );

    ms.addEventListener(
      "sourceopen",
      () => {
        void (async () => {
          let sb: SourceBuffer;
          try {
            sb = ms.addSourceBuffer("audio/mpeg");
          } catch {
            settle();
            return;
          }

          let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
          let started = false;

          const tryStartPlayback = async () => {
            if (started || cancelled() || signal.aborted) return;
            started = true;
            try {
              await audio.play();
              onPlaying();
            } catch (e) {
              if (
                e instanceof DOMException &&
                (e.name === "NotAllowedError" || e.name === "AbortError")
              ) {
                onNotAllowed(async () => {
                  try {
                    await audio.play();
                    onPlaying();
                  } catch {
                    /* ignore */
                  }
                });
              }
            }
          };

          try {
            reader = stream.getReader();
            while (!signal.aborted && !cancelled()) {
              const { done, value } = await reader.read();
              if (done) {
                await waitSourceBuffer(sb);
                if (ms.readyState === "open") {
                  try {
                    ms.endOfStream();
                  } catch {
                    /* ignore */
                  }
                }
                break;
              }
              if (cancelled() || signal.aborted) break;
              if (!value?.byteLength) continue;

              await waitSourceBuffer(sb);
              await new Promise<void>((res, rej) => {
                const ok = () => {
                  sb.removeEventListener("updateend", ok);
                  sb.removeEventListener("error", bad);
                  res();
                };
                const bad = () => {
                  sb.removeEventListener("updateend", ok);
                  sb.removeEventListener("error", bad);
                  rej(new Error("appendBuffer failed"));
                };
                sb.addEventListener("updateend", ok, { once: true });
                sb.addEventListener("error", bad, { once: true });
                try {
                  const ab = new ArrayBuffer(value.byteLength);
                  new Uint8Array(ab).set(value);
                  sb.appendBuffer(ab);
                } catch (err) {
                  sb.removeEventListener("updateend", ok);
                  sb.removeEventListener("error", bad);
                  rej(err);
                }
              });
              await tryStartPlayback();
            }
          } catch {
            try {
              if (ms.readyState === "open") ms.endOfStream("decode");
            } catch {
              /* ignore */
            }
            settle();
          } finally {
            try {
              reader?.releaseLock();
            } catch {
              /* ignore */
            }
          }

          if (signal.aborted || cancelled()) {
            settle();
            return;
          }

          if (!started) await tryStartPlayback();
        })();
      },
      { once: true },
    );
  });
}

