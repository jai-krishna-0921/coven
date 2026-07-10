import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { CommandRegistry, extractHints } from "../src/command/index.ts";
import { BUILTIN_COMMANDS } from "../src/command/builtin.ts";
import type { CommandDef } from "../src/command/types.ts";

function tmpRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

/** Load a registry with an isolated global config dir so ~/.config/coven never leaks in. */
async function loadIsolated(root: string, globalDir?: string): Promise<CommandRegistry> {
  return CommandRegistry.load(root, globalDir ?? tmpRoot("coven-cmd-global-"));
}

function makeDef(template: string): CommandDef {
  return { name: "t", description: "test", template, source: "project", hints: extractHints(template) };
}

describe("BUILTIN_COMMANDS", () => {
  test("init and review ship as builtins with $ARGUMENTS hints", async () => {
    const registry = await loadIsolated(tmpRoot("coven-cmd-"));
    const init = registry.get("init")!;
    expect(init.source).toBe("builtin");
    expect(init.hints).toEqual(["$ARGUMENTS"]);
    expect(init.template).toContain("AGENTS.md");
    expect(init.template).toContain("improve it in place rather than rewriting blindly");

    const review = registry.get("review")!;
    expect(review.source).toBe("builtin");
    expect(review.agent).toBe("reviewer");
    expect(review.subtask).toBe(true);
    expect(review.hints).toEqual(["$ARGUMENTS"]);
    expect(review.template).toContain("NOT in the diff");
  });

  test("builtin hint arrays match what extraction would produce", () => {
    for (const def of BUILTIN_COMMANDS) {
      expect(def.hints).toEqual(extractHints(def.template));
    }
  });
});

describe("CommandRegistry.load", () => {
  test("loads a markdown command with frontmatter from .coven/commands", async () => {
    const root = tmpRoot("coven-cmd-");
    mkdirSync(join(root, ".coven", "commands"), { recursive: true });
    writeFileSync(
      join(root, ".coven", "commands", "deploy.md"),
      `---\ndescription: Deploy the app\nagent: builder\nmodel: anthropic/claude-x\nsubtask: true\n---\nDeploy $1 to $2 now.\n`,
    );
    const registry = await loadIsolated(root);
    const deploy = registry.get("deploy")!;
    expect(deploy.description).toBe("Deploy the app");
    expect(deploy.agent).toBe("builder");
    expect(deploy.model).toBe("anthropic/claude-x");
    expect(deploy.subtask).toBe(true);
    expect(deploy.source).toBe("project");
    expect(deploy.template).toBe("Deploy $1 to $2 now.");
    expect(deploy.hints).toEqual(["$1", "$2"]);
  });

  test("nested command files keep the slash in their name", async () => {
    const root = tmpRoot("coven-cmd-");
    mkdirSync(join(root, ".coven", "commands", "git"), { recursive: true });
    writeFileSync(join(root, ".coven", "commands", "git", "pr.md"), "Open a PR for $ARGUMENTS");
    const registry = await loadIsolated(root);
    const pr = registry.get("git/pr")!;
    expect(pr.name).toBe("git/pr");
    expect(pr.hints).toEqual(["$ARGUMENTS"]);
  });

  test("project commands override global commands of the same name", async () => {
    const root = tmpRoot("coven-cmd-");
    const globalDir = tmpRoot("coven-cmd-global-");
    mkdirSync(join(globalDir, "commands"), { recursive: true });
    writeFileSync(join(globalDir, "commands", "deploy.md"), "---\ndescription: global version\n---\nglobal body");
    writeFileSync(join(globalDir, "commands", "greet.md"), "hello from global");
    mkdirSync(join(root, ".coven", "commands"), { recursive: true });
    writeFileSync(join(root, ".coven", "commands", "deploy.md"), "---\ndescription: project version\n---\nproject body");

    const registry = await loadIsolated(root, globalDir);
    expect(registry.get("deploy")?.description).toBe("project version");
    expect(registry.get("deploy")?.source).toBe("project");
    expect(registry.get("greet")?.source).toBe("global");
    expect(registry.all().map((c) => c.name)).toContain("init");
  });
});

describe("extractHints", () => {
  test("placeholders come back in order of first appearance, deduped", () => {
    expect(extractHints("do $2 then $1 then $2 again")).toEqual(["$2", "$1"]);
    expect(extractHints("$ARGUMENTS and $1")).toEqual(["$ARGUMENTS", "$1"]);
    expect(extractHints("no placeholders")).toEqual([]);
  });
});

describe("CommandRegistry.expand", () => {
  const opts = { root: tmpRoot("coven-cmd-expand-") };

  async function expand(template: string, rawArgs: string, root = opts.root): Promise<string> {
    const registry = await loadIsolated(root);
    // Tests opt into shell execution explicitly, mirroring the TUI's permission gate.
    return registry.expand(makeDef(template), rawArgs, { root, gateShell: async () => true });
  }

  test("substitutes positional arguments", async () => {
    expect(await expand("first=$1 second=$2 END", "a b")).toBe("first=a second=b END");
  });

  test("highest-numbered placeholder absorbs all remaining args", async () => {
    expect(await expand("cmd=$1 rest=$2", "run a b c")).toBe("cmd=run rest=a b c");
  });

  test("missing positional args become empty strings", async () => {
    expect(await expand("a=$1 b=$2 c=$3", "only")).toBe("a=only b= c=");
  });

  test("quoted arguments keep their spaces and lose their quotes", async () => {
    expect(await expand("x=$1 y=$2", `"hello world" 'foo bar'`)).toBe("x=hello world y=foo bar");
  });

  test("$ARGUMENTS receives the raw argument string verbatim", async () => {
    expect(await expand("Args: $ARGUMENTS", `one "two three"`)).toBe(`Args: one "two three"`);
  });

  test("templates without placeholders get args appended", async () => {
    expect(await expand("Run the tests.", "verbose please")).toBe("Run the tests.\n\nverbose please");
  });

  test("templates without placeholders and no args stay unchanged", async () => {
    expect(await expand("Run the tests.", "")).toBe("Run the tests.");
  });

  test("shell injection splices trimmed stdout in place", async () => {
    expect(await expand("Greeting: !`echo hello` end", "")).toBe("Greeting: hello end");
  });

  test("failed shell commands splice a failure marker", async () => {
    expect(await expand("Result: !`exit 3`", "")).toBe("Result: [command failed: exit 3]");
  });

  test("@file mentions stay in place and attach the file content", async () => {
    const root = tmpRoot("coven-cmd-file-");
    writeFileSync(join(root, "notes.txt"), "remember the milk");
    const result = await expand("Read @notes.txt carefully", "", root);
    expect(result).toContain("Read @notes.txt carefully");
    expect(result).toContain(`<attached-file path="notes.txt">`);
    expect(result).toContain("remember the milk");
    expect(result).toContain("</attached-file>");
  });

  test("@mentions of missing files are left untouched with no attachment", async () => {
    const root = tmpRoot("coven-cmd-file-");
    const result = await expand("See @does-not-exist.txt for details", "", root);
    expect(result).toBe("See @does-not-exist.txt for details");
  });

  test("shell injection is refused without a gate (RCE guard for cloned repos)", async () => {
    const root = tmpRoot("coven-cmd-gate-");
    const registry = await loadIsolated(root);
    const result = await registry.expand(makeDef("Run !`echo pwned` now"), "", { root });
    expect(result).toBe("Run [shell command blocked — not permitted] now");
  });

  test("@file traversal outside the root attaches nothing", async () => {
    const root = tmpRoot("coven-cmd-esc-");
    const result = await expand("Read @../../../../etc/passwd please", "", root);
    expect(result).toBe("Read @../../../../etc/passwd please");
    expect(result).not.toContain("<attached-file");
  });

  test("@file of a secret file inside the root is refused", async () => {
    const root = tmpRoot("coven-cmd-secret-");
    writeFileSync(join(root, ".env"), "OPENAI_API_KEY=sk-secret");
    const result = await expand("Read @.env please", "", root);
    expect(result).not.toContain("sk-secret");
    expect(result).not.toContain("<attached-file");
  });
});
