import { describe, expect, test } from "bun:test";
import { ProviderRegistry } from "../../src/provider/index.ts";
import { OpenAICompatAdapter } from "../../src/provider/openai.ts";
import { AnthropicAdapter } from "../../src/provider/anthropic.ts";
import type { CovenConfig } from "../../src/config/schema.ts";

const emptyConfig = {} as CovenConfig;

describe("ProviderRegistry.resolve", () => {
  test("ollama-cloud resolves to an OpenAI-compat adapter (was 'unknown provider')", () => {
    const reg = new ProviderRegistry(emptyConfig, () => undefined);
    const { adapter, ref } = reg.resolve("ollama-cloud/glm-5.1:cloud");
    expect(adapter).toBeInstanceOf(OpenAICompatAdapter);
    expect(ref.providerID).toBe("ollama-cloud");
    expect(ref.modelID).toBe("glm-5.1:cloud");
  });

  test("local ollama resolves keyless via the OpenAI-compat adapter", () => {
    const reg = new ProviderRegistry(emptyConfig, () => undefined);
    expect(reg.resolve("ollama/qwen2.5:7b").adapter).toBeInstanceOf(OpenAICompatAdapter);
  });

  test("anthropic uses the native adapter (given a key)", () => {
    const reg = new ProviderRegistry(emptyConfig, (id) => (id === "anthropic" ? "sk-test" : undefined));
    expect(reg.resolve("anthropic/claude-x").adapter).toBeInstanceOf(AnthropicAdapter);
  });

  test("gemini resolves via Google's OpenAI-compat endpoint", () => {
    const reg = new ProviderRegistry(emptyConfig, (id) => (id === "gemini" ? "AI-test" : undefined));
    const { adapter, ref } = reg.resolve("gemini/gemini-2.5-flash");
    expect(adapter).toBeInstanceOf(OpenAICompatAdapter);
    expect(ref.providerID).toBe("gemini");
    expect(ref.modelID).toBe("gemini-2.5-flash");
  });

  test("a genuinely unknown provider with no baseUrl still throws", () => {
    const reg = new ProviderRegistry(emptyConfig, () => undefined);
    expect(() => reg.resolve("nosuchprovider/model")).toThrow();
  });
});
