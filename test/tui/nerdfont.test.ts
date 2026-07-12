import { describe, expect, test } from "bun:test";
import { detectNerdFont } from "../../src/tui/onboarding/nerdfont.ts";

describe("detectNerdFont", () => {
  test("WezTerm terminal program → likely", () => {
    expect(detectNerdFont({ TERM_PROGRAM: "WezTerm" })).toBe("likely");
  });

  test("an explicit NERD marker env var → likely", () => {
    expect(detectNerdFont({ MYTERM_NERD_FONT: "1" })).toBe("likely");
  });

  test("empty env → unknown", () => {
    expect(detectNerdFont({})).toBe("unknown");
  });

  test("TERM=dumb → unlikely", () => {
    expect(detectNerdFont({ TERM: "dumb" })).toBe("unlikely");
  });

  test("Linux virtual console (TERM=linux) → unlikely", () => {
    expect(detectNerdFont({ TERM: "linux" })).toBe("unlikely");
  });

  test("iTerm2 via LC_TERMINAL → likely", () => {
    expect(detectNerdFont({ LC_TERMINAL: "iTerm2" })).toBe("likely");
  });

  test("kitty via TERM → likely", () => {
    expect(detectNerdFont({ TERM: "xterm-kitty" })).toBe("likely");
  });

  test("an unremarkable terminal → unknown", () => {
    expect(detectNerdFont({ TERM: "xterm-256color" })).toBe("unknown");
  });

  test("never throws when reading the real process.env (no arg)", () => {
    expect(() => detectNerdFont()).not.toThrow();
  });
});
