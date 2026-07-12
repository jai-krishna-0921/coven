import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The default `coven` subcommand must launch the Ink UI through `runTui`; the
 * legacy `Tui` streaming class and its `render.ts`/`input.ts` helpers are gone.
 */
describe("CLI default branch", () => {
  const source = readFileSync(join(import.meta.dir, "..", "src", "index.ts"), "utf8");

  test("routes the default branch through runTui", () => {
    expect(source).toContain("runTui");
  });

  test("no longer instantiates the removed Tui class", () => {
    expect(source).not.toContain("new Tui");
  });
});
