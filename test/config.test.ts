import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { deepMerge, loadConfig } from "../src/config/index.ts";

describe("deepMerge", () => {
  test("scalars override", () => {
    expect(deepMerge({ a: 1 }, { a: 2 })).toEqual({ a: 2 });
  });

  test("nested objects merge recursively", () => {
    expect(deepMerge({ a: { x: 1, y: 2 } }, { a: { y: 3 } })).toEqual({ a: { x: 1, y: 3 } });
  });

  test("arrays union without duplicates", () => {
    expect(deepMerge({ a: ["x", "y"] }, { a: ["y", "z"] })).toEqual({ a: ["x", "y", "z"] });
  });
});

describe("loadConfig", () => {
  test("finds coven.json walking up from a nested cwd", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-test-"));
    writeFileSync(join(dir, "coven.json"), JSON.stringify({ model: "anthropic/test-model" }));
    const nested = join(dir, "src", "deep");
    mkdirSync(nested, { recursive: true });
    const loaded = loadConfig(nested);
    expect(loaded.config.model).toBe("anthropic/test-model");
    expect(loaded.root).toBe(dir);
  });

  test("tolerates jsonc comments", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-test-"));
    writeFileSync(
      join(dir, "coven.jsonc"),
      `{
  // the model to use
  "model": "anthropic/commented", /* inline */
  "permission": { "bash": "ask" }
}`,
    );
    expect(loadConfig(dir).config.model).toBe("anthropic/commented");
  });

  test("rejects invalid config with a useful error", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-test-"));
    writeFileSync(join(dir, "coven.json"), JSON.stringify({ max_steps: -5 }));
    expect(() => loadConfig(dir)).toThrow(/max_steps/);
  });

  test("comment stripping leaves URLs in strings intact", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-test-"));
    writeFileSync(join(dir, "coven.json"), JSON.stringify({ provider: { custom: { baseUrl: "https://x.dev/v1" } } }));
    expect(loadConfig(dir).config.provider?.["custom"]?.baseUrl).toBe("https://x.dev/v1");
  });
});
