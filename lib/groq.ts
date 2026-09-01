const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
// llama-3.3-70b-versatile has been retired from Groq; gpt-oss-20b streams a clean
// `content` delta (its reasoning arrives in a separate `reasoning` field that we
// don't forward), which keeps latency low and nothing but the spoken reply gets voiced.
const MODEL = "openai/gpt-oss-20b";

// Without these, a stalled connection to Groq (dropped packet, dead keep-alive)
// leaves the request hanging until the OS's own TCP timeout gives up — which can
// take several minutes and leaves the candidate staring at "thinking..." the
// whole time. CONNECT_TIMEOUT_MS bounds getting a response at all; IDLE_TIMEOUT_MS
// bounds each individual chunk once streaming has started.
const CONNECT_TIMEOUT_MS = 15000;
const IDLE_TIMEOUT_MS = 20000;

function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  timeoutMs: number
): Promise<ReadableStreamReadResult<Uint8Array>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Groq stream stalled: no data for ${timeoutMs}ms`)),
      timeoutMs
    );
    reader.read().then(
      (result) => {
        clearTimeout(timer);
        resolve(result);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

interface GroqMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

/**
 * Calls Groq's chat completion endpoint with streaming enabled and returns a
 * ReadableStream of plain-text token deltas (SSE framing stripped) so the
 * client can start speaking before the full reply has arrived.
 */
export async function streamGroqCompletion(
  messages: GroqMessage[],
  temperature = 0.7,
  maxTokens = 500
): Promise<ReadableStream<Uint8Array>> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set on the server");
  }

  const upstream = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: MODEL,
      messages,
      stream: true,
      temperature,
      max_tokens: maxTokens,
      // gpt-oss's reasoning tokens count against max_tokens too. At the default
      // "medium" effort, reasoning can occasionally eat the entire budget before
      // any final content is produced — the turn streams back completely empty
      // (no text, no audio). Low effort keeps reasoning short, which is also all
      // this app needs: a short conversational reply, not deep analysis.
      reasoning_effort: "low",
    }),
    signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS),
  });

  if (!upstream.ok || !upstream.body) {
    const errText = await upstream.text().catch(() => "");
    throw new Error(`Groq API error ${upstream.status}: ${errText}`);
  }

  const reader = upstream.body.getReader();
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Set when the consumer stops caring about this response — the client cancels
  // its reader as soon as it has the one question it's allowed to ask per turn,
  // which happens on roughly half of all turns. Without propagating that upward,
  // the loop below keeps draining Groq to completion and Groq keeps generating
  // (and billing for) tokens nobody will ever see. Measured at ~40% of all
  // generated output on a five-interview run, so this is real money, not a nit.
  let cancelled = false;

  return new ReadableStream<Uint8Array>({
    async start(controller) {
      let buffer = "";
      try {
        while (!cancelled) {
          const { done, value } = await readWithTimeout(reader, IDLE_TIMEOUT_MS);
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (cancelled) break;
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const data = trimmed.slice(5).trim();
            if (data === "[DONE]") {
              controller.close();
              return;
            }
            try {
              const json = JSON.parse(data);
              const delta: string | undefined = json.choices?.[0]?.delta?.content;
              if (delta) controller.enqueue(encoder.encode(delta));
            } catch {
              // ignore partial/malformed SSE fragments
            }
          }
        }
        if (!cancelled) controller.close();
      } catch (err) {
        // A cancelled stream makes the pending read reject; that's expected
        // teardown, not a failure worth surfacing.
        if (!cancelled) controller.error(err);
      }
    },

    async cancel(reason) {
      cancelled = true;
      try {
        await reader.cancel(reason);
      } catch {
        // upstream already gone
      }
    },
  });
}

