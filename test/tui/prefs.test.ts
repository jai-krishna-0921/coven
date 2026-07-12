import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { loadPrefs, savePrefs, DEFAULT_PREFS } from "../../src/tui/prefs.ts";

describe("prefs", () => {
  test("returns defaults when no file", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-prefs-"));
    expect(loadPrefs(dir)).toEqual(DEFAULT_PREFS);
    rmSync(dir, { recursive: true, force: true });
  });
  test("round-trips and tolerates unknown fields", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-prefs-"));
    savePrefs({ ...DEFAULT_PREFS, theme: "dracula", onboarded: true }, dir);
    const p = loadPrefs(dir);
    expect(p.theme).toBe("dracula");
    expect(p.onboarded).toBe(true);
    expect(p.density).toBe(DEFAULT_PREFS.density);
    rmSync(dir, { recursive: true, force: true });
  });
});
