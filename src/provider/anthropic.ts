import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam, ContentBlockParam, ToolUnion } from "@anthropic-ai/sdk/resources/messages";
import { ProviderError } from "../util/error.ts";
import type { LLMEvent, ModelMessage, ProviderAdapter, StreamInput } from "./types.ts";

function toAnthropicMessages(messages: ModelMessage[]): MessageParam[] {
  return messages.map((message) => {
    const content: ContentBlockParam[] = message.content.map((part): ContentBlockParam => {
      switch (part.type) {
        case "text":
          return { type: "text", text: part.text };
        case "tool-call":
          return { type: "tool_use", id: part.callID, name: part.tool, input: part.args ?? {} };
        case "tool-result":
          return { type: "tool_result", tool_use_id: part.callID, content: part.output, is_error: part.isError ?? false };
      }
    });
    return { role: message.role, content };
  });
}

export class AnthropicAdapter implements ProviderAdapter {
  readonly id = "anthropic";
  private client: Anthropic;

  constructor(options: { apiKey?: string; baseUrl?: string } = {}) {
    const apiKey = options.apiKey ?? process.env["ANTHROPIC_API_KEY"];
    if (!apiKey) {
      throw new ProviderError("anthropic", "no API key — set ANTHROPIC_API_KEY or provider.anthropic.apiKeyEnv");
    }
    this.client = new Anthropic({ apiKey, ...(options.baseUrl ? { baseURL: options.baseUrl } : {}) });
  }

  async *stream(input: StreamInput): AsyncGenerator<LLMEvent, void, void> {
    const tools: ToolUnion[] = input.tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: { type: "object" as const, ...tool.parameters },
    }));

    const stream = this.client.messages.stream(
      {
        model: input.model,
        max_tokens: input.maxTokens ?? 32_000,
        system: [{ type: "text", text: input.system, cache_control: { type: "ephemeral" } }],
        messages: toAnthropicMessages(input.messages),
        ...(tools.length > 0 ? { tools } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      },
      { signal: input.abort },
    );

    // Track open blocks so we can emit clean start/delta/end triples.
    const open = new Map<number, { kind: "text" | "reasoning" | "tool"; id: string; tool?: string; json?: string }>();
    let sawToolCall = false;

    for await (const event of stream) {
      switch (event.type) {
        case "content_block_start": {
          const index = event.index;
          const block = event.content_block;
          if (block.type === "text") {
            open.set(index, { kind: "text", id: `t${index}` });
            yield { type: "text-start", id: `t${index}` };
          } else if (block.type === "thinking") {
            open.set(index, { kind: "reasoning", id: `r${index}` });
            yield { type: "reasoning-start", id: `r${index}` };
          } else if (block.type === "tool_use") {
            open.set(index, { kind: "tool", id: block.id, tool: block.name, json: "" });
          }
          break;
        }
        case "content_block_delta": {
          const entry = open.get(event.index);
          if (!entry) break;
          if (event.delta.type === "text_delta" && entry.kind === "text") {
            yield { type: "text-delta", id: entry.id, text: event.delta.text };
          } else if (event.delta.type === "thinking_delta" && entry.kind === "reasoning") {
            yield { type: "reasoning-delta", id: entry.id, text: event.delta.thinking };
          } else if (event.delta.type === "input_json_delta" && entry.kind === "tool") {
            entry.json = (entry.json ?? "") + event.delta.partial_json;
          }
          break;
        }
        case "content_block_stop": {
          const entry = open.get(event.index);
          if (!entry) break;
          open.delete(event.index);
          if (entry.kind === "text") {
            yield { type: "text-end", id: entry.id };
          } else if (entry.kind === "reasoning") {
            yield { type: "reasoning-end", id: entry.id };
          } else if (entry.kind === "tool") {
            sawToolCall = true;
            let args: unknown = {};
            try {
              args = entry.json ? JSON.parse(entry.json) : {};
            } catch {
              args = { _raw: entry.json };
            }
            yield { type: "tool-call", callID: entry.id, tool: entry.tool!, args };
          }
          break;
        }
        case "message_delta": {
          if (event.delta.stop_reason) {
            const usage = event.usage;
            const reason =
              event.delta.stop_reason === "tool_use" ? "tool-calls" : event.delta.stop_reason === "max_tokens" ? "length" : "stop";
            yield {
              type: "finish",
              reason: sawToolCall && reason === "stop" ? "tool-calls" : reason,
              usage: {
                inputTokens: (await stream.finalMessage()).usage.input_tokens ?? 0,
                outputTokens: usage.output_tokens ?? 0,
                cacheReadTokens: (await stream.finalMessage()).usage.cache_read_input_tokens ?? 0,
                cacheWriteTokens: (await stream.finalMessage()).usage.cache_creation_input_tokens ?? 0,
              },
            };
          }
          break;
        }
        default:
          break;
      }
    }
  }
}
