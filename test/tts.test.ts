import { describe, expect, test } from "bun:test";
import { Tts, chunkSentences, detectBackend, stripForSpeech } from "../src/tts/index.ts";
import type { TtsDeps } from "../src/tts/index.ts";

// All deps are injected with an explicit empty env so the host machine's
// OPENAI_API_KEY / COVEN_TTS / PATH never leak into detection results.

describe("stripForSpeech", () => {
  test("removes fenced code blocks entirely, including their content", () => {
    const input = "Before.\n```ts\nconst x = 1;\nconsole.log(x);\n```\nAfter.";
    const output = stripForSpeech(input);
    expect(output).toBe("Before. After.");
    expect(output).not.toContain("const");
  });

  test("removes an unclosed trailing fence to the end of input", () => {
    expect(stripForSpeech("Talk.\n```\nsecret code")).toBe("Talk.");
  });

  test("removes inline code backticks but keeps the text", () => {
    expect(stripForSpeech("run `bun test` now")).toBe("run bun test now");
  });

  test("removes header markers", () => {
    expect(stripForSpeech("# Title\n## Sub\nBody")).toBe("Title Sub Body");
  });

  test("converts links and images to their text", () => {
    expect(stripForSpeech("see [the docs](https://example.com) here")).toBe("see the docs here");
    expect(stripForSpeech("![alt text](img.png) done")).toBe("alt text done");
  });

  test("removes emphasis symbols and list bullets", () => {
    expect(stripForSpeech("**bold** and _italic_ and *starred*")).toBe("bold and italic and starred");
    expect(stripForSpeech("- one\n- two")).toBe("one two");
  });

  test("collapses whitespace", () => {
    expect(stripForSpeech("a\n\n\n   b\t\tc")).toBe("a b c");
  });
});

describe("chunkSentences", () => {
  test("returns empty array for empty or whitespace-only input", () => {
    expect(chunkSentences("")).toEqual([]);
    expect(chunkSentences("   \n\t ")).toEqual([]);
  });

  test("merges short fragments into their neighbors", () => {
    expect(chunkSentences("Hi. Ok. Sure thing.")).toEqual(["Hi. Ok. Sure thing."]);
  });

  test("splits long text and caps every chunk at 400 chars", () => {
    const long = "This sentence has a reasonable number of words and ends with a period, as sentences do. ".repeat(30);
    const chunks = chunkSentences(long);
    expect(chunks.length).toBeGreaterThan(1);
    for (const chunk of chunks) {
      expect(chunk.length).toBeLessThanOrEqual(400);
      expect(chunk.length).toBeGreaterThan(0);
    }
    // No words lost
    expect(chunks.join(" ").split(" ").length).toBe(long.trim().split(/\s+/).length);
  });

  test("hard-slices a single word longer than 400 chars", () => {
    const chunks = chunkSentences("a".repeat(1000));
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(400);
    expect(chunks.join("")).toBe("a".repeat(1000));
  });

  test("keeps a lone short fragment as its own chunk", () => {
    expect(chunkSentences("Hi.")).toEqual(["Hi."]);
  });
});

describe("detectBackend", () => {
  test("darwin with all binaries available picks say", () => {
    const deps: TtsDeps = { platform: "darwin", env: {}, hasBin: () => true };
    expect(detectBackend({}, deps)).toBe("say");
  });

  test("linux with only espeak-ng picks espeak", () => {
    const deps: TtsDeps = { platform: "linux", env: {}, hasBin: (name) => name === "espeak-ng" };
    expect(detectBackend({}, deps)).toBe("espeak");
  });

  test("linux with only spd-say picks spd", () => {
    const deps: TtsDeps = { platform: "linux", env: {}, hasBin: (name) => name === "spd-say" };
    expect(detectBackend({}, deps)).toBe("spd");
  });

  test("COVEN_TTS=off disables even when binaries exist", () => {
    const deps: TtsDeps = { platform: "darwin", env: { COVEN_TTS: "off" }, hasBin: () => true };
    expect(detectBackend({}, deps)).toBeNull();
  });

  test("config backend off disables detection", () => {
    const deps: TtsDeps = { platform: "darwin", env: {}, hasBin: () => true };
    expect(detectBackend({ backend: "off" }, deps)).toBeNull();
  });

  test("OPENAI_API_KEY plus a player picks openai", () => {
    const deps: TtsDeps = {
      platform: "linux",
      env: { OPENAI_API_KEY: "sk-test" },
      hasBin: (name) => name === "ffplay",
    };
    expect(detectBackend({}, deps)).toBe("openai");
  });

  test("OPENAI_API_KEY without any player falls through", () => {
    const deps: TtsDeps = {
      platform: "linux",
      env: { OPENAI_API_KEY: "sk-test" },
      hasBin: (name) => name === "espeak",
    };
    expect(detectBackend({}, deps)).toBe("espeak");
  });

  test("linux with no binaries returns null", () => {
    const deps: TtsDeps = { platform: "linux", env: {}, hasBin: () => false };
    expect(detectBackend({}, deps)).toBeNull();
  });

  test("win32 falls back to powershell", () => {
    const deps: TtsDeps = { platform: "win32", env: {}, hasBin: () => false };
    expect(detectBackend({}, deps)).toBe("powershell");
  });

  test("COVEN_TTS env override selects a specific available backend", () => {
    const deps: TtsDeps = {
      platform: "linux",
      env: { COVEN_TTS: "espeak" },
      hasBin: (name) => name === "espeak-ng" || name === "spd-say",
    };
    expect(detectBackend({}, deps)).toBe("espeak");
  });

  test("override naming an unavailable backend falls through to auto-detection", () => {
    const deps: TtsDeps = {
      platform: "linux",
      env: { COVEN_TTS: "say" },
      hasBin: (name) => name === "espeak",
    };
    expect(detectBackend({}, deps)).toBe("espeak");
  });
});

describe("Tts", () => {
  test("backend off makes speak a safe no-op", () => {
    const tts = new Tts({ backend: "off" }, { platform: "linux", env: {}, hasBin: () => true });
    expect(tts.backend).toBeNull();
    expect(tts.enabled).toBe(false);
    expect(() => tts.speak("hello there")).not.toThrow();
    expect(() => tts.stop()).not.toThrow();
  });

  test("speak while disabled does not throw even with a backend", () => {
    const tts = new Tts({}, { platform: "darwin", env: {}, hasBin: () => true });
    expect(tts.backend).toBe("say");
    expect(tts.enabled).toBe(false);
    expect(() => tts.speak("hello")).not.toThrow();
  });

  test("status reflects on, off, and unavailable states", () => {
    const available = new Tts({}, { platform: "darwin", env: {}, hasBin: () => true });
    expect(available.status()).toBe("off (backend: say available)");
    available.enabled = true;
    expect(available.status()).toBe("on (say)");

    const none = new Tts({}, { platform: "linux", env: {}, hasBin: () => false });
    expect(none.status()).toBe("unavailable — no TTS backend found");
  });

  test("stop is safe when nothing is playing", () => {
    const tts = new Tts({}, { platform: "linux", env: {}, hasBin: () => false });
    expect(() => tts.stop()).not.toThrow();
  });
});
