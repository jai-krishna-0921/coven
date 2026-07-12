import { describe, expect, test } from "bun:test";
import { THEMES } from "../../src/tui/theme.ts";

const TOKENS = ["bg","bgPanel","bgOverlay","fg","fgMuted","fgSubtle","border","borderFocus",
  "accent","accentAlt","success","warning","error","info","roleUser","roleAssistant",
  "agent","tool","toolOk","toolErr","diffAdd","diffDel","selectionBg","selectionFg"];

describe("themes", () => {
  test("all 7 present", () => {
    expect(Object.keys(THEMES).sort()).toEqual(
      ["catppuccin-mocha","coven-dark","coven-light","dracula","gruvbox-dark","nord","tokyo-night"]);
  });
  test("every theme defines every token as a hex string", () => {
    for (const [name, t] of Object.entries(THEMES))
      for (const k of TOKENS)
        expect(t[k as keyof typeof t], `${name}.${k}`).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  test("coven dark/light are siblings", () => {
    expect(THEMES["coven-dark"].light).toBe("coven-light");
    expect(THEMES["coven-light"].dark).toBe("coven-dark");
  });
});
