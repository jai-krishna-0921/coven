/**
 * OpenAI-compatible adapter (chat/completions + SSE). Works with OpenAI, Ollama,
 * vLLM, Groq, OpenRouter, LM Studio — anything speaking the /v1/chat/completions
 * wire protocol. Implemented over fetch to avoid another SDK dependency.
 */
import { ProviderError } from "../util/error.ts";
import type { LLMEvent, ModelMessage, ProviderAdapter, StreamInput } from "./types.ts";

interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: { id: string; type: "function"; function: { name: string; arguments: string } }[];
  tool_call_id?: string;
}

function toWireMessages(system: string, messages: ModelMessage[]): WireMessage[] {
  const wire: WireMessage[] = [{ role: "system", content: system }];
  for (const message of messages) {
    if (message.role === "assistant") {
      const text = message.content
        .filter((p) => p.type === "text")
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("");
      const calls = message.content.filter((p) => p.type === "tool-call");
      wire.push({
        role: "assistant",
        content: text || null,
        ...(calls.length > 0
          ? {
              tool_calls: calls.map((c) =>
                c.type === "tool-call"
                  ? { id: c.callID, type: "function" as const, function: { name: c.tool, arguments: JSON.stringify(c.args ?? {}) } }
                  : (undefined as never),
              ),
            }
          : {}),
      });
    } else {
      // Tool results ride on role:"tool" messages in the OpenAI protocol.
      const results = message.content.filter((p) => p.type === "tool-result");
      for (const result of results) {
        if (result.type === "tool-result") {
          wire.push({ role: "tool", content: result.output, tool_call_id: result.callID });
        }
      }
      const text = message.content
        .filter((p) => p.type === "text")
        .map((p) => (p.type === "text" ? p.text : ""))
        .join("");
      if (text) wire.push({ role: "user", content: text });
    }
  }
  return wire;
}

/** Transient HTTP statuses worth retrying (overload / gateway / rate-limit). */
const RETRYABLE_STATUS = new Set([408, 409, 425, 429, 500, 502, 503, 504, 529]);
const MAX_RETRIES = 3;
/** No bytes for this long (connect or between chunks) → abort the request. */
const IDLE_TIMEOUT_MS = 120_000;
const CONNECT_TIMEOUT_MS = 60_000;

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Pull a short human message out of a provider error body — OpenAI-style
 * `{"error":{"message":...}}`, Google-style array-wrapped equivalent, or the
 * first non-empty line. Keeps fatal logs to a single readable line instead of
 * dumping the whole JSON blob.
 */
function extractErrorSummary(text: string): string {
  if (!text) return "(no body)";
  try {
    const j = JSON.parse(text) as unknown;
    const walk = (v: unknown): string | undefined => {
      if (!v) return undefined;
      if (Array.isArray(v)) {
        for (const x of v) {
          const found = walk(x);
          if (found) return found;
        }
        return undefined;
      }
      if (typeof v === "object") {
        const o = v as Record<string, unknown>;
        if (typeof o.message === "string" && o.message) return o.message;
        for (const k of Object.keys(o)) {
          const found = walk(o[k]);
          if (found) return found;
        }
      }
      return undefined;
    };
    const msg = walk(j);
    if (msg) return msg.split("\n")[0]!.slice(0, 240);
  } catch {
    /* fall through */
  }
  const line = text.split("\n").find((l) => l.trim().length > 0) ?? text;
  return line.slice(0, 240);
}

export class OpenAICompatAdapter implements ProviderAdapter {
  constructor(
    readonly id: string,
    private options: { apiKey?: string; baseUrl: string; fetchImpl?: typeof fetch; retryBaseMs?: number },
  ) {}

  /** Exponential backoff with jitter, capped at 8s. */
  private backoff(attempt: number): number {
    const base = this.options.retryBaseMs ?? 500;
    return Math.min(base * 2 ** attempt, 8_000) + Math.floor(Math.random() * 100);
  }

  async *stream(input: StreamInput): AsyncGenerator<LLMEvent, void, void> {
    const doFetch = this.options.fetchImpl ?? fetch;
    const url = `${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const headers = {
      "content-type": "application/json",
      ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
    };
    const body = JSON.stringify({
      model: input.model,
      stream: true,
      stream_options: { include_usage: true },
      messages: toWireMessages(input.system, input.messages),
      ...(input.tools.length > 0
        ? {
            tools: input.tools.map((tool) => ({
              type: "function",
              function: { name: tool.name, description: tool.description, parameters: { type: "object", ...tool.parameters } },
            })),
          }
        : {}),
      ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
      ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
    });

    // One controller drives both the idle timeout and the caller's abort, so a
    // hung endpoint (local Ollama/vLLM that never responds) can't wedge the turn.
    const ctrl = new AbortController();
    const onOuterAbort = () => ctrl.abort();
    if (input.abort) {
      if (input.abort.aborted) ctrl.abort();
      else input.abort.addEventListener("abort", onOuterAbort, { once: true });
    }
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const armIdle = (ms: number) => {
      if (idleTimer) clearTimeout(idleTimer);
      idleTimer = setTimeout(() => ctrl.abort(), ms);
    };

    try {
      // --- connect, with bounded retry on transient failures (nothing emitted yet) ---
      let response: Response | undefined;
      for (let attempt = 0; ; attempt++) {
        armIdle(CONNECT_TIMEOUT_MS);
        let res: Response;
        try {
          res = await doFetch(url, { method: "POST", headers, body, signal: ctrl.signal });
        } catch (error) {
          if (input.abort?.aborted) throw new ProviderError(this.id, "request aborted");
          if (attempt < MAX_RETRIES) {
            await delay(this.backoff(attempt));
            continue;
          }
          throw new ProviderError(this.id, `network error after ${attempt + 1} attempts: ${String(error)}`);
        }
        if (res.ok && res.body) {
          response = res;
          break;
        }
        const text = await res.text().catch(() => "");
        // A quota-exhausted 429 (RESOURCE_EXHAUSTED, "quota exceeded", "billing")
        // is permanent — retrying only wastes seconds and looks broken. Fail fast.
        const permanentQuota =
          res.status === 429 &&
          /RESOURCE_EXHAUSTED|quota exceeded|billing|credits|depleted/i.test(text);
        if (RETRYABLE_STATUS.has(res.status) && !permanentQuota && attempt < MAX_RETRIES) {
          const retryAfter = Number(res.headers.get("retry-after"));
          await delay(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : this.backoff(attempt));
          continue;
        }
        throw new ProviderError(this.id, `HTTP ${res.status}: ${extractErrorSummary(text)}`);
      }

      yield* this.consume(response!, input, ctrl, armIdle);
    } finally {
      if (idleTimer) clearTimeout(idleTimer);
      input.abort?.removeEventListener("abort", onOuterAbort);
    }
  }

  private async *consume(
    response: Response,
    input: StreamInput,
    ctrl: AbortController,
    armIdle: (ms: number) => void,
  ): AsyncGenerator<LLMEvent, void, void> {
    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    let textOpen = false;
    let finishReason: "stop" | "tool-calls" | "length" = "stop";
    let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

    if (!response.body) throw new ProviderError(this.id, "empty response body");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      armIdle(IDLE_TIMEOUT_MS);
      let done: boolean;
      let value: Uint8Array | undefined;
      try {
        ({ done, value } = await reader.read());
      } catch (error) {
        // Distinguish a caller-driven cancel from our idle-timeout abort.
        if (input.abort?.aborted) throw new ProviderError(this.id, "request aborted");
        if (ctrl.signal.aborted) throw new ProviderError(this.id, "stream idle timeout — no data from provider");
        throw new ProviderError(this.id, `stream error: ${String(error)}`);
      }
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        let chunk: any;
        try {
          chunk = JSON.parse(payload);
        } catch {
          continue;
        }
        if (chunk.usage) {
          usage = {
            inputTokens: chunk.usage.prompt_tokens ?? 0,
            outputTokens: chunk.usage.completion_tokens ?? 0,
            cacheReadTokens: chunk.usage.prompt_tokens_details?.cached_tokens ?? 0,
            cacheWriteTokens: 0,
          };
        }
        const choice = chunk.choices?.[0];
        if (!choice) continue;
        const delta = choice.delta ?? {};
        if (typeof delta.content === "string" && delta.content.length > 0) {
          if (!textOpen) {
            textOpen = true;
            yield { type: "text-start", id: "t0" };
          }
          yield { type: "text-delta", id: "t0", text: delta.content };
        }
        for (const call of delta.tool_calls ?? []) {
          const index = call.index ?? 0;
          const existing = toolCalls.get(index) ?? { id: "", name: "", args: "" };
          if (call.id) existing.id = call.id;
          if (call.function?.name) existing.name += call.function.name;
          if (call.function?.arguments) existing.args += call.function.arguments;
          toolCalls.set(index, existing);
        }
        if (choice.finish_reason) {
          finishReason =
            choice.finish_reason === "tool_calls" ? "tool-calls" : choice.finish_reason === "length" ? "length" : "stop";
        }
      }
    }

    if (textOpen) yield { type: "text-end", id: "t0" };
    for (const [, call] of [...toolCalls.entries()].sort((a, b) => a[0] - b[0])) {
      let args: unknown = {};
      try {
        args = call.args ? JSON.parse(call.args) : {};
      } catch {
        args = { _raw: call.args };
      }
      yield { type: "tool-call", callID: call.id || `call_${Math.random().toString(36).slice(2)}`, tool: call.name, args };
    }
    yield { type: "finish", reason: toolCalls.size > 0 ? "tool-calls" : finishReason, usage };
  }
}
