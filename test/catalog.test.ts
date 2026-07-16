import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BUILTIN_CATALOG, ModelCatalog, parseModelsDev, type CatalogFetch } from "../src/catalog/index.ts";

function freshCacheDir(): string {
  return mkdtempSync(join(tmpdir(), "coven-catalog-"));
}

/** Inline blob shaped like models.dev api.json. */
const FIXTURE = {
  anthropic: {
    id: "anthropic",
    name: "Anthropic",
    env: ["ANTHROPIC_API_KEY"],
    npm: "@ai-sdk/anthropic",
    models: {
      "claude-opus-4-7": {
        id: "claude-opus-4-7",
        name: "Claude Opus 4.7",
        reasoning: true,
        release_date: "2026-02-05",
        limit: { context: 1_000_000, output: 128_000 },
        cost: { input: 5, output: 25, cache_read: 0.5, cache_write: 6.25 },
      },
      "claude-test-nolimits": {
        id: "claude-test-nolimits",
        // name, limit, cost all missing → defaults
      },
    },
  },
  testprov: {
    id: "testprov",
    name: "Test Provider",
    env: ["TESTPROV_API_KEY"],
    models: {
      "test-model": {
        name: "Test Model",
        limit: { context: 42_000, output: 4_200 },
        cost: { input: 1.5, output: 7.5 },
      },
    },
  },
};

function fixtureFetch(calls?: { count: number }): CatalogFetch {
  return (async () => {
    if (calls) calls.count++;
    return new Response(JSON.stringify(FIXTURE), { status: 200 });
  });
}

function failingFetch(calls?: { count: number }): CatalogFetch {
  return (async () => {
    if (calls) calls.count++;
    throw new Error("network down");
  });
}

describe("BUILTIN_CATALOG", () => {
  test("builtin fallback returns claude-opus-4-8 with the real numbers", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), offline: true });
    const model = catalog.get("anthropic", "claude-opus-4-8");
    expect(model.contextLimit).toBe(1_000_000);
    expect(model.outputLimit).toBe(128_000);
    expect(model.cost).toEqual({ input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 });
    expect(model.reasoning).toBe(true);
  });

  test("claude-haiku-4-5-20251001 carries the same numbers as claude-haiku-4-5", () => {
    const anthropic = BUILTIN_CATALOG.get("anthropic");
    expect(anthropic).toBeDefined();
    const dated = anthropic!.models.get("claude-haiku-4-5-20251001");
    const plain = anthropic!.models.get("claude-haiku-4-5");
    expect(dated).toBeDefined();
    expect(plain).toBeDefined();
    expect(dated!.contextLimit).toBe(plain!.contextLimit);
    expect(dated!.outputLimit).toBe(plain!.outputLimit);
    expect(dated!.cost).toEqual(plain!.cost);
  });

  test("ollama local models cost zero and need no env var", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), offline: true });
    const model = catalog.get("ollama", "qwen3-coder");
    expect(model.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    const ollama = catalog.providers().find((p) => p.id === "ollama");
    expect(ollama).toBeDefined();
    expect(ollama!.env).toEqual([]);
  });
});

describe("ModelCatalog.get", () => {
  test("unknown model synthesizes conservative defaults, never undefined", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), offline: true });
    const model = catalog.get("anthropic", "claude-does-not-exist");
    expect(model.providerID).toBe("anthropic");
    expect(model.modelID).toBe("claude-does-not-exist");
    expect(model.name).toBe("claude-does-not-exist");
    expect(model.contextLimit).toBe(200_000);
    expect(model.outputLimit).toBe(32_000);
    expect(model.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  });

  test("unknown provider also synthesizes defaults", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), offline: true });
    const model = catalog.get("no-such-provider", "some-model");
    expect(model.contextLimit).toBe(200_000);
    expect(model.cost.input).toBe(0);
  });

  test("date-suffixed request resolves to the undated catalog entry", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), offline: true });
    const model = catalog.get("anthropic", "claude-opus-4-7-20260205");
    expect(model.modelID).toBe("claude-opus-4-7");
    expect(model.contextLimit).toBe(1_000_000);
  });

  test("undated request matches a date-suffixed catalog entry", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), offline: true });
    // Only a dated variant exists for this lookup direction once we ask with
    // a *different* date: catalog has claude-haiku-4-5-20251001.
    const model = catalog.get("anthropic", "claude-haiku-4-5-20990101");
    expect(model.cost.input).toBe(1);
    expect(model.contextLimit).toBe(200_000);
  });
});

describe("parseModelsDev", () => {
  test("parses a models.dev-shaped blob into providers and models", () => {
    const parsed = parseModelsDev(FIXTURE);
    expect([...parsed.keys()].sort()).toEqual(["anthropic", "testprov"]);
    const opus = parsed.get("anthropic")!.models.get("claude-opus-4-7")!;
    expect(opus.name).toBe("Claude Opus 4.7");
    expect(opus.contextLimit).toBe(1_000_000);
    expect(opus.outputLimit).toBe(128_000);
    expect(opus.cost).toEqual({ input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 });
    expect(opus.reasoning).toBe(true);
    expect(opus.releaseDate).toBe("2026-02-05");
    const prov = parsed.get("testprov")!;
    expect(prov.name).toBe("Test Provider");
    expect(prov.env).toEqual(["TESTPROV_API_KEY"]);
  });

  test("missing fields default to zero / model id", () => {
    const parsed = parseModelsDev(FIXTURE);
    const bare = parsed.get("anthropic")!.models.get("claude-test-nolimits")!;
    expect(bare.name).toBe("claude-test-nolimits");
    expect(bare.contextLimit).toBe(0);
    expect(bare.outputLimit).toBe(0);
    expect(bare.cost).toEqual({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
    expect(bare.reasoning).toBeUndefined();
  });

  test("cache_read without cache_write parses with cache_write 0", () => {
    const parsed = parseModelsDev(FIXTURE);
    const model = parsed.get("testprov")!.models.get("test-model")!;
    expect(model.cost).toEqual({ input: 1.5, output: 7.5, cacheRead: 0, cacheWrite: 0 });
  });

  test("non-object top level throws a typed error", () => {
    expect(() => parseModelsDev("nope")).toThrow("Failed to parse model catalog");
    expect(() => parseModelsDev([1, 2])).toThrow();
  });
});

describe("ModelCatalog.load", () => {
  test("successful fetch populates the catalog and writes the cache file", async () => {
    const cacheDir = freshCacheDir();
    const catalog = await ModelCatalog.load({ cacheDir, fetchFn: fixtureFetch() });
    // Fetched provider is available.
    const model = catalog.get("testprov", "test-model");
    expect(model.contextLimit).toBe(42_000);
    expect(model.cost.input).toBe(1.5);
    // Cache written to <cacheDir>/models.json with the raw body.
    const cacheFile = join(cacheDir, "models.json");
    expect(existsSync(cacheFile)).toBe(true);
    expect(JSON.parse(readFileSync(cacheFile, "utf8"))).toEqual(FIXTURE);
  });

  test("fetched entries merge OVER builtin while builtin fills the gaps", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), fetchFn: fixtureFetch() });
    // Builtin-only providers survive the merge (fetch has no ollama/openai).
    expect(catalog.get("ollama", "gpt-oss:20b").outputLimit).toBe(32_768);
    expect(catalog.get("openai", "gpt-5.4-nano").cost.input).toBe(0.2);
    // Builtin-only anthropic models survive; fetched opus-4-7 wins.
    expect(catalog.get("anthropic", "claude-opus-4-8").cost.output).toBe(25);
    expect(catalog.get("anthropic", "claude-opus-4-7").releaseDate).toBe("2026-02-05");
    // New provider from fetch is listed.
    expect(catalog.providers().map((p) => p.id)).toContain("testprov");
  });

  test("failing fetch falls back to the builtin catalog without throwing", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), fetchFn: failingFetch() });
    const model = catalog.get("anthropic", "claude-opus-4-7");
    expect(model.contextLimit).toBe(1_000_000);
    expect(model.cost).toEqual({ input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 });
    expect(catalog.list("openai").length).toBe(5);
  });

  test("non-ok HTTP response falls back to builtin", async () => {
    const fetchFn: CatalogFetch = async () => new Response("oops", { status: 500 });
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), fetchFn });
    expect(catalog.get("anthropic", "claude-sonnet-4-6").outputLimit).toBe(64_000);
  });

  test("offline:true never calls fetchFn", async () => {
    const calls = { count: 0 };
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), offline: true, fetchFn: fixtureFetch(calls) });
    expect(calls.count).toBe(0);
    // And still serves the builtin catalog.
    expect(catalog.get("groq", "llama-3.3-70b-versatile").cost.input).toBe(0.59);
  });

  test("fresh cache (mtime < 24h) is used without fetching", async () => {
    const cacheDir = freshCacheDir();
    writeFileSync(join(cacheDir, "models.json"), JSON.stringify(FIXTURE));
    const calls = { count: 0 };
    const catalog = await ModelCatalog.load({ cacheDir, fetchFn: fixtureFetch(calls) });
    expect(calls.count).toBe(0);
    expect(catalog.get("testprov", "test-model").contextLimit).toBe(42_000);
  });

  test("stale cache is used when the fetch fails", async () => {
    const cacheDir = freshCacheDir();
    const cacheFile = join(cacheDir, "models.json");
    writeFileSync(cacheFile, JSON.stringify(FIXTURE));
    const old = (Date.now() - 48 * 60 * 60 * 1000) / 1000; // 48h ago, in seconds
    utimesSync(cacheFile, old, old);
    const calls = { count: 0 };
    const catalog = await ModelCatalog.load({ cacheDir, fetchFn: failingFetch(calls) });
    expect(calls.count).toBe(1); // stale → fetch attempted → failed → stale cache used
    expect(catalog.get("testprov", "test-model").cost.output).toBe(7.5);
  });

  test("corrupt cache and failing fetch still land on builtin (load never throws)", async () => {
    const cacheDir = freshCacheDir();
    writeFileSync(join(cacheDir, "models.json"), "{not json");
    const catalog = await ModelCatalog.load({ cacheDir, fetchFn: failingFetch() });
    expect(catalog.get("anthropic", "claude-haiku-4-5").cost.input).toBe(1);
  });
});

describe("ModelCatalog.list / providers", () => {
  test("list(providerID) returns only that provider's models", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), offline: true });
    const anthropic = catalog.list("anthropic");
    expect(anthropic.length).toBe(7);
    expect(anthropic.every((m) => m.providerID === "anthropic")).toBe(true);
    expect(catalog.list("nope")).toEqual([]);
  });

  test("list() returns models across all providers", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), offline: true });
    const all = catalog.list();
    expect(all.length).toBe(7 + 5 + 5 + 9 + 4 + 5); // + gemini
  });

  test("providers() exposes id, name and env", async () => {
    const catalog = await ModelCatalog.load({ cacheDir: freshCacheDir(), offline: true });
    const providers = catalog.providers();
    const anthropic = providers.find((p) => p.id === "anthropic");
    expect(anthropic).toEqual({ id: "anthropic", name: "Anthropic", env: ["ANTHROPIC_API_KEY"] });
    expect(providers.map((p) => p.id)).toEqual(["anthropic", "openai", "groq", "openrouter", "ollama", "gemini"]);
  });
});
