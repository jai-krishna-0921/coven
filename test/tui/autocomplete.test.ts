import { describe, expect, test } from "bun:test";
import { completionsFor } from "../../src/tui/autocomplete.ts";
import type { PaletteItem } from "../../src/tui/types.ts";
const mk = (slash: string): PaletteItem => ({ id: slash, title: slash, slash, category: "System", run() {} });
const items = ["review","rename","resume","new","models"].map(mk);
describe("completionsFor", () => {
  test("bare slash → all commands", () => {
    expect(completionsFor("/", 1, items, () => []).map(c => c.value)).toContain("/review");
    expect(completionsFor("/", 1, items, () => []).length).toBe(items.length);
  });
  test("prefix r narrows", () => {
    const v = completionsFor("/r", 2, items, () => []).map(c => c.value);
    expect(v).toEqual(expect.arrayContaining(["/review","/rename","/resume"]));
    expect(v).not.toContain("/new");
  });
  test("prefix re narrows further, prefix before fuzzy", () => {
    const v = completionsFor("/re", 3, items, () => []).map(c => c.value);
    expect(v.slice(0,3).sort()).toEqual(["/rename","/resume","/review"]);
  });
  test("@ triggers file completions", () => {
    const v = completionsFor("look @src/i", 11, items, () => ["src/index.ts","src/app.ts"]).map(c => c.value);
    expect(v).toContain("src/index.ts");
  });
  test("non-command text → no command completions", () => {
    expect(completionsFor("hello world", 11, items, () => [])).toEqual([]);
  });
});
