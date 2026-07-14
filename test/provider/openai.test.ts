import { describe, expect, test } from "bun:test";
import { OpenAICompatAdapter } from "../../src/provider/openai.ts";
import type { StreamInput } from "../../src/provider/types.ts";

/** A minimal SSE streaming Response with one text delta + a final [DONE]. */
function streamingOk(): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const enc = new TextEncoder();
      controller.enqueue(enc.encode('data: {"choices":[{"delta":{"content":"hi"},"finish_reason":null}]}\n'));
      controller.enqueue(enc.encode('data: {"choices":[{"delta":{},"finish_reason":"stop"}]}\n'));
      controller.enqueue(enc.encode("data: [DONE]\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

function errResponse(status: number): Response {
  return new Response("upstream busy", { status, headers: {} });
}

function input(over: Partial<StreamInput> = {}): StreamInput {
  return { model: "m", system: "s", messages: [], tools: [], ...over } as StreamInput;
}

async function collect(gen: AsyncGenerator<unknown>): Promise<unknown[]> {
  const out: unknown[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe("OpenAICompatAdapter retry", () => {
  test("retries a transient 429 then streams", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return calls <= 2 ? errResponse(429) : streamingOk();
    }) as unknown as typeof fetch;
    const adapter = new OpenAICompatAdapter("groq", { baseUrl: "http://x/v1", fetchImpl, retryBaseMs: 1 });
    const events = await collect(adapter.stream(input()));
    expect(calls).toBe(3);
    expect(events.some((e: any) => e.type === "text-delta" && e.text === "hi")).toBe(true);
  });

  test("does NOT retry a non-retryable 400 — throws immediately", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return errResponse(400);
    }) as unknown as typeof fetch;
    const adapter = new OpenAICompatAdapter("groq", { baseUrl: "http://x/v1", fetchImpl, retryBaseMs: 1 });
    await expect(collect(adapter.stream(input()))).rejects.toThrow();
    expect(calls).toBe(1);
  });

  test("gives up after the retry budget and throws", async () => {
    let calls = 0;
    const fetchImpl = (async () => {
      calls++;
      return errResponse(503);
    }) as unknown as typeof fetch;
    const adapter = new OpenAICompatAdapter("groq", { baseUrl: "http://x/v1", fetchImpl, retryBaseMs: 1 });
    await expect(collect(adapter.stream(input()))).rejects.toThrow();
    expect(calls).toBe(4); // 1 initial + 3 retries
  });
});
