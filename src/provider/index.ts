/**
 * Provider registry. Resolves "provider/model" refs to adapters.
 * Built-ins: anthropic (native protocol) and any config-declared provider
 * speaking the openai protocol. Adapters are created lazily and cached.
 */
import { ProviderError } from "../util/error.ts";
import type { CovenConfig } from "../config/schema.ts";
import { AnthropicAdapter } from "./anthropic.ts";
import { OpenAICompatAdapter } from "./openai.ts";
import { parseModelRef, type ModelRef, type ProviderAdapter } from "./types.ts";

const KNOWN_BASE_URLS: Record<string, string> = {
  openai: "https://api.openai.com/v1",
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
  ollama: "http://localhost:11434/v1",
};

const KNOWN_KEY_ENVS: Record<string, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  groq: "GROQ_API_KEY",
  openrouter: "OPENROUTER_API_KEY",
};

export class ProviderRegistry {
  private adapters = new Map<string, ProviderAdapter>();

  constructor(private config: CovenConfig) {}

  resolve(modelRef: string): { adapter: ProviderAdapter; ref: ModelRef } {
    const ref = parseModelRef(modelRef);
    const cached = this.adapters.get(ref.providerID);
    if (cached) return { adapter: cached, ref };

    const providerConfig = this.config.provider?.[ref.providerID];
    const keyEnv = providerConfig?.apiKeyEnv ?? KNOWN_KEY_ENVS[ref.providerID];
    const apiKey = keyEnv ? process.env[keyEnv] : undefined;
    const protocol = providerConfig?.protocol ?? (ref.providerID === "anthropic" ? "anthropic" : "openai");

    let adapter: ProviderAdapter;
    if (protocol === "anthropic") {
      adapter = new AnthropicAdapter({ apiKey, baseUrl: providerConfig?.baseUrl });
    } else {
      const baseUrl = providerConfig?.baseUrl ?? KNOWN_BASE_URLS[ref.providerID];
      if (!baseUrl) {
        throw new ProviderError(ref.providerID, `unknown provider — add provider.${ref.providerID}.baseUrl to coven.json`);
      }
      adapter = new OpenAICompatAdapter(ref.providerID, { apiKey, baseUrl });
    }
    this.adapters.set(ref.providerID, adapter);
    return { adapter, ref };
  }
}
