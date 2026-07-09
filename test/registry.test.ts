import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { AgentRegistry } from "../src/agent/index.ts";
import { BUILTIN_AGENTS } from "../src/agent/builtin.ts";
import { SkillRegistry } from "../src/skill/index.ts";
import { parseFrontmatter } from "../src/util/frontmatter.ts";

describe("BUILTIN_AGENTS", () => {
  test("the coven has exactly eleven members", () => {
    expect(BUILTIN_AGENTS).toHaveLength(11);
  });

  test("every agent has a charter and a description", () => {
    for (const agent of BUILTIN_AGENTS) {
      expect(agent.prompt.length).toBeGreaterThan(50);
      expect(agent.description.length).toBeGreaterThan(10);
    }
  });
});

describe("AgentRegistry", () => {
  test("config overrides merge over builtins", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-agent-"));
    const registry = new AgentRegistry({ agent: { builder: { model: "openai/gpt-x", steps: 5 } } }, dir);
    const builder = registry.get("builder")!;
    expect(builder.model).toBe("openai/gpt-x");
    expect(builder.steps).toBe(5);
    expect(builder.prompt).toContain("Builder"); // builtin prompt preserved
  });

  test("disable removes an agent entirely", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-agent-"));
    const registry = new AgentRegistry({ agent: { optimizer: { disable: true } } }, dir);
    expect(registry.get("optimizer")).toBeUndefined();
  });

  test("markdown agents load from .coven/agents", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-agent-"));
    mkdirSync(join(dir, ".coven", "agents"), { recursive: true });
    writeFileSync(
      join(dir, ".coven", "agents", "bard.md"),
      `---\nname: bard\ndescription: Sings about the codebase\nmode: subagent\n---\nYou are the Bard. You sing.\n`,
    );
    const registry = new AgentRegistry({}, dir);
    const bard = registry.get("bard")!;
    expect(bard.description).toBe("Sings about the codebase");
    expect(bard.mode).toBe("subagent");
    expect(bard.prompt).toContain("You are the Bard");
  });

  test("primaries and subagents are filtered by mode", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-agent-"));
    const registry = new AgentRegistry({}, dir);
    const primaryNames = registry.primaries().map((a) => a.name);
    expect(primaryNames).toContain("builder");
    expect(primaryNames).toContain("conductor");
    expect(primaryNames).not.toContain("researcher"); // subagent-only
    expect(registry.subagents().map((a) => a.name)).toContain("guardian");
  });
});

describe("SkillRegistry", () => {
  test("discovers SKILL.md files and builds the system prompt block", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-skill-"));
    mkdirSync(join(dir, ".coven", "skills", "my-skill"), { recursive: true });
    writeFileSync(
      join(dir, ".coven", "skills", "my-skill", "SKILL.md"),
      `---\nname: my-skill\ndescription: Use when testing skill discovery\n---\n# Body\nDo the thing.`,
    );
    const registry = await SkillRegistry.load({}, dir);
    expect(registry.get("my-skill")?.content).toContain("Do the thing");
    expect(registry.systemPromptBlock()).toContain("my-skill: Use when testing skill discovery");
  });

  test("project skills shadow global ones by name", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-skill-"));
    for (const [root, marker] of [
      [".claude/skills", "claude-version"],
      [".coven/skills", "coven-version"],
    ] as const) {
      mkdirSync(join(dir, root, "shared"), { recursive: true });
      writeFileSync(join(dir, root, "shared", "SKILL.md"), `---\nname: shared\ndescription: x\n---\n${marker}`);
    }
    const registry = await SkillRegistry.load({}, dir);
    expect(registry.get("shared")?.content).toBe("coven-version"); // .coven scanned after .claude
  });

  test("skills without a name are skipped, not fatal", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-skill-"));
    mkdirSync(join(dir, ".coven", "skills", "broken"), { recursive: true });
    writeFileSync(join(dir, ".coven", "skills", "broken", "SKILL.md"), "no frontmatter here");
    const registry = await SkillRegistry.load({}, dir);
    expect(registry.all()).toHaveLength(0);
  });
});

describe("parseFrontmatter", () => {
  test("parses key-value pairs and strips quotes", () => {
    const { data, body } = parseFrontmatter(`---\nname: test\ndescription: "quoted value"\n---\nbody text`);
    expect(data["name"]).toBe("test");
    expect(data["description"]).toBe("quoted value");
    expect(body).toBe("body text");
  });

  test("content without frontmatter returns empty data", () => {
    const { data, body } = parseFrontmatter("just markdown");
    expect(data).toEqual({});
    expect(body).toBe("just markdown");
  });

  test("values containing colons survive", () => {
    const { data } = parseFrontmatter(`---\ndescription: Use when: always\n---\nx`);
    expect(data["description"]).toBe("Use when: always");
  });
});
