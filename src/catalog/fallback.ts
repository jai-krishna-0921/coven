/**
 * Built-in fallback catalog, used when models.dev is unreachable and no disk
 * cache exists. Numbers are taken verbatim from the models.dev snapshot
 * (see research: opencode fixture models-api.json). Cost is USD per 1M tokens.
 *
 * The ollama provider is local-only (not on models.dev): all costs are 0 and
 * no env var is required; context/output limits mirror the ollama-cloud
 * entries for the same model families.
 */
import type { CatalogModel, CatalogProvider } from "./types.ts";

/** [modelID, name, contextLimit, outputLimit, input, output, cacheRead?, cacheWrite?, reasoning?] */
type Row = [string, string, number, number, number, number, number?, number?, boolean?];

function provider(id: string, name: string, env: string[], rows: Row[]): [string, CatalogProvider] {
  const models = new Map<string, CatalogModel>();
  for (const [modelID, displayName, contextLimit, outputLimit, input, output, cacheRead = 0, cacheWrite = 0, reasoning = false] of rows) {
    const model: CatalogModel = {
      providerID: id,
      modelID,
      name: displayName,
      contextLimit,
      outputLimit,
      cost: { input, output, cacheRead, cacheWrite },
    };
    if (reasoning) model.reasoning = true;
    models.set(modelID, model);
  }
  return [id, { id, name, env, models }];
}

export const BUILTIN_CATALOG: ReadonlyMap<string, CatalogProvider> = new Map<string, CatalogProvider>([
  provider("anthropic", "Anthropic", ["ANTHROPIC_API_KEY"], [
    ["claude-opus-4-8", "Claude Opus 4.8", 1_000_000, 128_000, 5, 25, 0.5, 6.25, true],
    ["claude-opus-4-7", "Claude Opus 4.7", 1_000_000, 128_000, 5, 25, 0.5, 6.25, true],
    ["claude-opus-4-6", "Claude Opus 4.6", 1_000_000, 128_000, 5, 25, 0.5, 6.25, true],
    ["claude-sonnet-4-6", "Claude Sonnet 4.6", 1_000_000, 64_000, 3, 15, 0.3, 3.75, true],
    ["claude-sonnet-4-5", "Claude Sonnet 4.5", 200_000, 64_000, 3, 15, 0.3, 3.75],
    ["claude-haiku-4-5", "Claude Haiku 4.5", 200_000, 64_000, 1, 5, 0.1, 1.25],
    ["claude-haiku-4-5-20251001", "Claude Haiku 4.5 (2025-10-01)", 200_000, 64_000, 1, 5, 0.1, 1.25],
  ]),
  provider("openai", "OpenAI", ["OPENAI_API_KEY"], [
    ["gpt-5.5", "GPT-5.5", 1_050_000, 128_000, 5, 30, 0.5, 0, true],
    ["gpt-5.4", "GPT-5.4", 1_050_000, 128_000, 2.5, 15, 0.25],
    ["gpt-5.3-codex", "GPT-5.3 Codex", 400_000, 128_000, 1.75, 14, 0.175],
    ["gpt-5.4-mini", "GPT-5.4 Mini", 400_000, 128_000, 0.75, 4.5, 0.075],
    ["gpt-5.4-nano", "GPT-5.4 Nano", 400_000, 128_000, 0.2, 1.25, 0.02],
  ]),
  provider("groq", "Groq", ["GROQ_API_KEY"], [
    ["moonshotai/kimi-k2-instruct-0905", "Kimi K2 Instruct 0905", 262_144, 16_384, 1, 3],
    ["openai/gpt-oss-120b", "GPT-OSS 120B", 131_072, 65_536, 0.15, 0.6, 0, 0, true],
    ["openai/gpt-oss-20b", "GPT-OSS 20B", 131_072, 65_536, 0.075, 0.3, 0, 0, true],
    ["llama-3.3-70b-versatile", "Llama 3.3 70B Versatile", 131_072, 32_768, 0.59, 0.79],
    ["qwen/qwen3-32b", "Qwen3 32B", 131_072, 40_960, 0.29, 0.59, 0, 0, true],
  ]),
  provider("openrouter", "OpenRouter", ["OPENROUTER_API_KEY"], [
    ["anthropic/claude-opus-4.6", "Claude Opus 4.6", 1_000_000, 128_000, 5, 25, 0.5, 6.25],
    ["anthropic/claude-sonnet-4.6", "Claude Sonnet 4.6", 1_000_000, 128_000, 3, 15, 0.3, 3.75],
    ["openai/gpt-5.2", "GPT-5.2", 400_000, 128_000, 1.75, 14, 0.175],
    ["google/gemini-3-pro-preview", "Gemini 3 Pro Preview", 1_050_000, 66_000, 2, 12],
    ["deepseek/deepseek-v4-flash", "DeepSeek V4 Flash", 1_048_576, 393_216, 0.14, 0.28, 0.028],
    ["moonshotai/kimi-k2.6", "Kimi K2.6", 262_144, 262_144, 0.95, 4, 0.16],
    ["z-ai/glm-4.7", "GLM 4.7", 204_800, 131_072, 0.6, 2.2, 0.11],
    ["minimax/minimax-m2.5", "MiniMax M2.5", 204_800, 131_072, 0.3, 1.2, 0.03],
    ["qwen/qwen3-coder", "Qwen3 Coder", 262_144, 66_536, 0.3, 1.2],
  ]),
  provider("ollama", "Ollama", [], [
    ["qwen3-coder", "Qwen3 Coder (local)", 262_144, 65_536, 0, 0],
    ["gpt-oss:120b", "GPT-OSS 120B (local)", 131_072, 32_768, 0, 0, 0, 0, true],
    ["gpt-oss:20b", "GPT-OSS 20B (local)", 131_072, 32_768, 0, 0, 0, 0, true],
    ["llama3.3", "Llama 3.3 (local)", 131_072, 32_768, 0, 0],
  ]),
  provider("gemini", "Google Gemini", ["GEMINI_API_KEY"], [
    ["gemini-2.5-pro", "Gemini 2.5 Pro", 2_000_000, 65_536, 1.25, 10, 0.31, 0, true],
    ["gemini-2.5-flash", "Gemini 2.5 Flash", 1_048_576, 65_536, 0.3, 2.5, 0.075, 0, true],
    ["gemini-2.5-flash-lite", "Gemini 2.5 Flash Lite", 1_048_576, 65_536, 0.1, 0.4, 0.025],
    ["gemini-2.0-flash", "Gemini 2.0 Flash", 1_048_576, 8_192, 0.1, 0.4, 0.025],
    ["gemini-2.0-flash-lite", "Gemini 2.0 Flash Lite", 1_048_576, 8_192, 0.075, 0.3, 0],
  ]),
  provider("xai", "xAI Grok", ["XAI_API_KEY"], [
    ["grok-4", "Grok 4", 256_000, 32_000, 3, 15, 0.3],
    ["grok-4-fast-reasoning", "Grok 4 Fast Reasoning", 2_000_000, 32_000, 0.2, 0.5, 0.05, 0, true],
    ["grok-4-fast-non-reasoning", "Grok 4 Fast", 2_000_000, 32_000, 0.2, 0.5, 0.05],
    ["grok-code-fast-1", "Grok Code Fast 1", 256_000, 32_000, 0.2, 1.5, 0.02],
  ]),
  provider("mistral", "Mistral", ["MISTRAL_API_KEY"], [
    ["mistral-large-latest", "Mistral Large", 131_072, 32_768, 2, 6],
    ["mistral-medium-latest", "Mistral Medium", 131_072, 32_768, 0.4, 2],
    ["mistral-small-latest", "Mistral Small", 131_072, 32_768, 0.15, 0.3],
    ["codestral-latest", "Codestral", 262_144, 32_768, 0.3, 0.9],
  ]),
  provider("perplexity", "Perplexity", ["PERPLEXITY_API_KEY"], [
    ["sonar", "Sonar", 128_000, 8_000, 1, 1],
    ["sonar-pro", "Sonar Pro", 200_000, 8_000, 3, 15],
    ["sonar-reasoning", "Sonar Reasoning", 128_000, 8_000, 1, 5, 0, 0, true],
    ["sonar-deep-research", "Sonar Deep Research", 200_000, 8_000, 2, 8, 0, 0, true],
  ]),
  provider("cerebras", "Cerebras", ["CEREBRAS_API_KEY"], [
    ["llama-3.3-70b", "Llama 3.3 70B", 131_072, 32_768, 0.85, 1.2],
    ["llama-4-scout-17b-16e-instruct", "Llama 4 Scout 17B", 131_072, 32_768, 0.65, 0.85],
    ["qwen-3-coder-480b", "Qwen3 Coder 480B", 131_072, 40_960, 2, 2, 0, 0, true],
  ]),
  provider("deepinfra", "DeepInfra", ["DEEPINFRA_API_KEY"], [
    ["meta-llama/Meta-Llama-3.1-70B-Instruct", "Llama 3.1 70B Instruct", 131_072, 32_768, 0.35, 0.4],
    ["Qwen/Qwen3-Coder-480B-A35B-Instruct-Turbo", "Qwen3 Coder 480B Turbo", 262_144, 65_536, 0.4, 1.6],
  ]),
  provider("together", "Together AI", ["TOGETHER_API_KEY"], [
    ["meta-llama/Llama-3.3-70B-Instruct-Turbo", "Llama 3.3 70B Turbo", 131_072, 32_768, 0.88, 0.88],
    ["Qwen/Qwen2.5-Coder-32B-Instruct", "Qwen 2.5 Coder 32B", 32_768, 8_192, 0.8, 0.8],
    ["deepseek-ai/DeepSeek-V3", "DeepSeek V3", 131_072, 8_192, 1.25, 1.25],
  ]),
  provider("fireworks", "Fireworks AI", ["FIREWORKS_API_KEY"], [
    ["accounts/fireworks/models/llama-v3p3-70b-instruct", "Llama 3.3 70B Instruct", 131_072, 32_768, 0.9, 0.9],
    ["accounts/fireworks/models/deepseek-v3", "DeepSeek V3", 131_072, 8_192, 0.9, 0.9],
  ]),
  provider("deepseek", "DeepSeek", ["DEEPSEEK_API_KEY"], [
    ["deepseek-chat", "DeepSeek Chat", 65_536, 8_192, 0.27, 1.1, 0.07],
    ["deepseek-reasoner", "DeepSeek Reasoner", 65_536, 8_192, 0.55, 2.19, 0.14, 0, true],
  ]),
  provider("moonshot", "Moonshot Kimi", ["MOONSHOT_API_KEY"], [
    ["moonshot-v1-128k", "Moonshot v1 128k", 131_072, 8_192, 3, 3],
    ["kimi-k2-0905-preview", "Kimi K2 0905", 262_144, 16_384, 1, 3],
  ]),
  provider("alibaba", "Alibaba DashScope", ["DASHSCOPE_API_KEY"], [
    ["qwen-max", "Qwen Max", 32_768, 8_192, 1.6, 6.4],
    ["qwen-plus", "Qwen Plus", 131_072, 8_192, 0.4, 1.2],
    ["qwen3-coder-plus", "Qwen3 Coder Plus", 131_072, 8_192, 0.4, 1.6],
  ]),
  provider("venice", "Venice AI", ["VENICE_API_KEY"], [
    ["llama-3.3-70b", "Llama 3.3 70B", 65_536, 8_192, 0.7, 2.8],
    ["qwen-2.5-coder-32b", "Qwen 2.5 Coder 32B", 32_768, 8_192, 0.5, 2],
  ]),
]);
