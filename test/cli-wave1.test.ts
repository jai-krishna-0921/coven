import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Wave-1 CLI shape tests: every new subcommand/flag must be reachable through
 * src/index.ts. We source-inspect rather than shelling out because a real
 * `bun src/index.ts …` invocation would touch the user's real ~/.local/share
 * store; the intent here is to catch wiring regressions, not to run the CLI.
 */
const SRC = readFileSync(join(import.meta.dir, "..", "src", "index.ts"), "utf8");

describe("Wave 1 — session subcommand", () => {
  test("session subcommand dispatched from main()", () => {
    expect(SRC).toMatch(/command === ["']session["']/);
    expect(SRC).toMatch(/sessionCommand\(/);
  });

  test("session sub-verbs implemented: list, delete, export, import", () => {
    for (const verb of ["list", "delete", "export", "import"]) {
      expect(SRC).toContain(`"${verb}"`);
    }
  });

  test("session serialize module is imported by index.ts", () => {
    expect(SRC).toMatch(/from ["']\.\/session\/serialize\.ts["']/);
  });
});

describe("Wave 1 — run subcommand extensions", () => {
  test("parseFlags recognises --continue/-c, --session/-s, --fork, --model, --format", () => {
    // Each flag literal must appear in the parser branch of index.ts.
    expect(SRC).toContain("--continue");
    expect(SRC).toContain("--session");
    expect(SRC).toContain("--fork");
    expect(SRC).toContain("--model");
    expect(SRC).toContain("--format");
  });

  test("runPrintMode is wired to accept resume/fork/format options", () => {
    // The signature was extended — a plain-object opts param is used now.
    expect(SRC).toMatch(/runPrintMode\([^)]*\{[\s\S]*?\}\s*\)/);
  });
});

describe("Wave 1 — TUI resume flags", () => {
  test("main() detects --continue/--session and passes an initialSessionID to runTui", () => {
    expect(SRC).toMatch(/initialSessionID/);
    expect(SRC).toMatch(/runTui\(\s*app\s*,\s*\{/);
  });
});

describe("Wave 1 — upgrade + completion subcommands", () => {
  test("upgrade subcommand dispatched", () => {
    expect(SRC).toMatch(/command === ["']upgrade["']/);
  });

  test("completion subcommand dispatched and prints for bash/zsh/fish", () => {
    expect(SRC).toMatch(/command === ["']completion["']/);
    // The completion script content must handle the three common shells.
    expect(SRC).toMatch(/bash|zsh|fish/);
  });
});
