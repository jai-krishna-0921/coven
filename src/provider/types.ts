import type { Usage } from "../session/types.ts";

/** Normalized stream events — every provider adapter emits exactly these. */
export type LLMEvent =
  | { type: "text-start"; id: string }
  | { type: "text-delta"; id: string; text: string }
  | { type: "text-end"; id: string }
  | { type: "reasoning-start"; id: string }
  | { type: "reasoning-delta"; id: string; text: string }
  | { type: "reasoning-end"; id: string }
  | { type: "tool-call"; callID: string; tool: string; args: unknown }
  | { type: "finish"; reason: "stop" | "tool-calls" | "length"; usage: Usage };

/** Provider-agnostic message shape fed INTO adapters (adapters translate to wire format). */
export type ModelContent =
  | { type: "text"; text: string }
  | { type: "tool-call"; callID: string; tool: string; args: unknown }
  | { type: "tool-result"; callID: string; output: string; isError?: boolean };

export interface ModelMessage {
  role: "user" | "assistant";
  content: ModelContent[];
}

export interface ToolSchema {
  name: string;
  description: string;
  /** JSON Schema for the tool's parameters. */
  parameters: Record<string, unknown>;
}

export interface StreamInput {
  model: string;
  system: string;
  messages: ModelMessage[];
  tools: ToolSchema[];
  maxTokens?: number;
  temperature?: number;
  abort: AbortSignal;
}

export interface ProviderAdapter {
  readonly id: string;
  stream(input: StreamInput): AsyncGenerator<LLMEvent, void, void>;
}

export interface ModelRef {
  providerID: string;
  modelID: string;
}

/** What the session engine needs from a provider source — lets tests inject fakes. */
export interface ProviderResolver {
  resolve(modelRef: string): { adapter: ProviderAdapter; ref: ModelRef };
}

export function parseModelRef(ref: string): ModelRef {
  const slash = ref.indexOf("/");
  if (slash === -1) return { providerID: "anthropic", modelID: ref };
  return { providerID: ref.slice(0, slash), modelID: ref.slice(slash + 1) };
}
