import { describe, expect, test } from "bun:test";
import { ICONS, BORDERS, LOGO } from "../../src/tui/glyphs.ts";

const KEYS = ["ok","err","warn","info","tool","agent","bullet","arrow","prompt","spinner","sidebar","context"];
describe("glyphs", () => {
  test("both icon sets define every key", () => {
    for (const set of ["nerd","ascii"] as const)
      for (const k of KEYS) expect(ICONS[set][k as keyof typeof ICONS.nerd], `${set}.${k}`).toBeDefined();
  });
  test("spinner frames are non-empty arrays", () => {
    expect(ICONS.ascii.spinner.length).toBeGreaterThan(0);
    expect(ICONS.nerd.spinner.length).toBeGreaterThan(0);
  });
  test("borders + logos exist", () => {
    expect(BORDERS.unicode).toBeDefined(); expect(BORDERS.ascii).toBeDefined();
    expect(LOGO.block).toContain("\n"); expect(LOGO.ascii.length).toBeGreaterThan(0);
  });
});
