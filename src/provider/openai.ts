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

export class OpenAICompatAdapter implements ProviderAdapter {
  constructor(
    readonly id: string,
    private options: { apiKey?: string; baseUrl: string },
  ) {}

  async *stream(input: StreamInput): AsyncGenerator<LLMEvent, void, void> {
    const response = await fetch(`${this.options.baseUrl.replace(/\/$/, "")}/chat/completions`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(this.options.apiKey ? { authorization: `Bearer ${this.options.apiKey}` } : {}),
      },
      body: JSON.stringify({
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
      }),
      signal: input.abort,
    });

    if (!response.ok || !response.body) {
      throw new ProviderError(this.id, `HTTP ${response.status}: ${(await response.text()).slice(0, 500)}`);
    }

    const toolCalls = new Map<number, { id: string; name: string; args: string }>();
    let textOpen = false;
    let finishReason: "stop" | "tool-calls" | "length" = "stop";
    let usage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
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
