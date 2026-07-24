import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AuthStore, ENV_KEYS } from "../src/auth/index.ts";

const isWindows = process.platform === "win32";

function tempDataDir(): string {
  return mkdtempSync(join(tmpdir(), "coven-auth-"));
}

describe("AuthStore", () => {
  describe("set/get/remove roundtrip", () => {
    test("stores and retrieves a key", () => {
      const store = new AuthStore(tempDataDir());
      store.set("anthropic", "sk-ant-test-key");
      expect(store.get("anthropic")).toBe("sk-ant-test-key");
    });

    test("normalizes provider names (lowercase, trailing slash stripped)", () => {
      const store = new AuthStore(tempDataDir());
      store.set("Anthropic/", "sk-ant-test-key");
      expect(store.get("anthropic")).toBe("sk-ant-test-key");
      expect(store.get("ANTHROPIC/")).toBe("sk-ant-test-key");
    });

    test("remove returns true when present, false when absent", () => {
      const store = new AuthStore(tempDataDir());
      store.set("openai", "sk-openai-test");
      expect(store.remove("openai")).toBe(true);
      expect(store.get("openai")).toBeUndefined();
      expect(store.remove("openai")).toBe(false);
    });

    test("get on missing file returns undefined", () => {
      const store = new AuthStore(tempDataDir());
      expect(store.get("anthropic")).toBeUndefined();
    });

    test("file format keeps the { type: 'api' } discriminator", () => {
      const dir = tempDataDir();
      const store = new AuthStore(dir);
      store.set("groq", "gsk-test-key");
      const raw: unknown = JSON.parse(readFileSync(join(dir, "auth.json"), "utf8"));
      expect(raw).toEqual({ groq: { type: "api", key: "gsk-test-key" } });
    });

    test("set preserves unrecognized (future oauth) entries", () => {
      const dir = tempDataDir();
      writeFileSync(
        join(dir, "auth.json"),
        JSON.stringify({ github: { type: "oauth", refresh: "r", access: "a", expires: 1 } }),
      );
      const store = new AuthStore(dir);
      store.set("anthropic", "sk-ant-test");
      const raw = JSON.parse(readFileSync(join(dir, "auth.json"), "utf8")) as Record<string, unknown>;
      expect(raw["github"]).toEqual({ type: "oauth", refresh: "r", access: "a", expires: 1 });
      // oauth entries are not api keys: get() must not surface them
      expect(store.get("github")).toBeUndefined();
    });
  });

  describe("file permissions", () => {
    test.skipIf(isWindows)("auth.json is written with mode 0600", () => {
      const dir = tempDataDir();
      const store = new AuthStore(dir);
      store.set("anthropic", "sk-ant-test-key");
      const mode = statSync(join(dir, "auth.json")).mode & 0o777;
      expect(mode).toBe(0o600);
    });
  });

  describe("resolveKey", () => {
    const envName = ENV_KEYS["anthropic"] as string;
    let savedEnv: string | undefined;

    beforeEach(() => {
      savedEnv = process.env[envName];
    });

    afterEach(() => {
      if (savedEnv === undefined) delete process.env[envName];
      else process.env[envName] = savedEnv;
    });

    test("env var wins over auth.json entry", () => {
      const store = new AuthStore(tempDataDir());
      store.set("anthropic", "sk-from-auth-json");
      process.env[envName] = "sk-from-env";
      expect(store.resolveKey("anthropic")).toEqual({ key: "sk-from-env", source: "env", kind: "api" });
    });

    test("falls back to auth.json when env var is unset", () => {
      const store = new AuthStore(tempDataDir());
      store.set("anthropic", "sk-from-auth-json");
      delete process.env[envName];
      expect(store.resolveKey("anthropic")).toEqual({ key: "sk-from-auth-json", source: "auth.json", kind: "api" });
    });

    test("returns undefined when neither env nor auth.json has the provider", () => {
      const store = new AuthStore(tempDataDir());
      delete process.env[envName];
      expect(store.resolveKey("anthropic")).toBeUndefined();
      expect(store.resolveKey("some-unknown-provider")).toBeUndefined();
    });
  });

  describe("corrupt auth.json", () => {
    test("is treated as empty and never throws", () => {
      const dir = tempDataDir();
      writeFileSync(join(dir, "auth.json"), "{ not valid json !!!");
      const store = new AuthStore(dir);
      expect(store.get("anthropic")).toBeUndefined();
      expect(store.remove("anthropic")).toBe(false);
      expect(store.entries().filter((e) => e.source === "auth.json")).toEqual([]);
      // and it can be written over
      store.set("anthropic", "sk-recovered");
      expect(store.get("anthropic")).toBe("sk-recovered");
    });

    test("non-object json (array) is treated as empty", () => {
      const dir = tempDataDir();
      writeFileSync(join(dir, "auth.json"), JSON.stringify(["nope"]));
      const store = new AuthStore(dir);
      expect(store.get("anthropic")).toBeUndefined();
      expect(store.entries().filter((e) => e.source === "auth.json")).toEqual([]);
    });
  });

  describe("entries and masking", () => {
    test("lists auth.json entries with masked keys", () => {
      const store = new AuthStore(tempDataDir());
      const key = "sk-ant-api03-verylongsecretmiddlepartABCD";
      store.set("anthropic", key);
      const entry = store.entries().find((e) => e.provider === "anthropic" && e.source === "auth.json");
      expect(entry).toBeDefined();
      expect(entry?.masked).toBe(key.slice(0, 8) + "…" + key.slice(-4));
    });

    test("masking never reveals the middle of the key", () => {
      const store = new AuthStore(tempDataDir());
      const key = "sk-ant-api03-SUPERSECRETMIDDLE-tail";
      store.set("anthropic", key);
      const entry = store.entries().find((e) => e.provider === "anthropic" && e.source === "auth.json");
      expect(entry?.masked).not.toContain("SUPERSECRETMIDDLE");
      expect(entry?.masked).not.toBe(key);
      expect(entry?.masked).toContain("…");
    });

    test("short keys are fully masked", () => {
      const store = new AuthStore(tempDataDir());
      store.set("groq", "shortkey");
      const entry = store.entries().find((e) => e.provider === "groq");
      expect(entry?.masked).toBe("…");
      expect(entry?.masked).not.toContain("short");
    });

    test("boundary-length key (12 chars) is fully masked", () => {
      const store = new AuthStore(tempDataDir());
      const key = "abcdefgh1234"; // slice(0,8)+slice(-4) would reveal all 12 chars
      store.set("openai", key);
      const entry = store.entries().find((e) => e.provider === "openai");
      expect(entry?.masked).toBe("…");
    });

    test("detects env-provided keys", () => {
      const envName = ENV_KEYS["groq"] as string;
      const saved = process.env[envName];
      try {
        process.env[envName] = "gsk-env-detected-key-value";
        const store = new AuthStore(tempDataDir());
        const entry = store.entries().find((e) => e.provider === "groq" && e.source === "env");
        expect(entry).toBeDefined();
        expect(entry?.masked).toBe("gsk-env-" + "…" + "alue");
      } finally {
        if (saved === undefined) delete process.env[envName];
        else process.env[envName] = saved;
      }
    });
  });
});
