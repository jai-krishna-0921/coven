/**
 * Skills — progressive disclosure of expertise.
 * A skill is a directory with SKILL.md (frontmatter: name, description) plus
 * optional support files. Only name+description enter the system prompt; the
 * body loads on demand via the skill tool.
 *
 * Discovery roots (later wins on name collision):
 *   ~/.config/coven/skills/**       (global)
 *   <root>/.claude/skills/**        (Claude Code compat — same format)
 *   <root>/.coven/skills/**         (project)
 *   config.skills.paths[]           (explicit)
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";
import { parseFrontmatter } from "../util/frontmatter.ts";
import { createLogger } from "../util/log.ts";
import type { CovenConfig } from "../config/schema.ts";

const log = createLogger("skill");

export interface SkillInfo {
  name: string;
  description: string;
  /** Directory containing SKILL.md — support files live beside it. */
  dir: string;
  /** Markdown body, frontmatter stripped. */
  content: string;
}

async function scanRoot(root: string): Promise<SkillInfo[]> {
  if (!existsSync(root)) return [];
  const skills: SkillInfo[] = [];
  const glob = new Bun.Glob("**/SKILL.md");
  for await (const match of glob.scan({ cwd: root, dot: false })) {
    const path = join(root, match);
    try {
      const { data, body } = parseFrontmatter(readFileSync(path, "utf8"));
      const name = data["name"];
      if (!name) {
        log.warn("skill missing name frontmatter", { path });
        continue;
      }
      skills.push({
        name,
        description: data["description"] ?? "",
        dir: dirname(path),
        content: body.trim(),
      });
    } catch (error) {
      log.warn("failed to load skill", { path, error: String(error) });
    }
  }
  return skills;
}

export class SkillRegistry {
  private skills = new Map<string, SkillInfo>();

  private constructor() {}

  static async load(config: CovenConfig, root: string): Promise<SkillRegistry> {
    const registry = new SkillRegistry();
    const roots = [
      join(homedir(), ".config", "coven", "skills"),
      join(root, ".claude", "skills"),
      join(root, ".coven", "skills"),
      ...(config.skills?.paths ?? []).map((p) => join(root, p)),
    ];
    for (const skillRoot of roots) {
      for (const skill of await scanRoot(skillRoot)) {
        registry.skills.set(skill.name, skill);
      }
    }
    return registry;
  }

  get(name: string): SkillInfo | undefined {
    return this.skills.get(name);
  }

  all(): SkillInfo[] {
    return [...this.skills.values()].sort((a, b) => a.name.localeCompare(b.name));
  }

  /** The <available_skills> system-prompt block. Empty string when no skills. */
  systemPromptBlock(): string {
    const skills = this.all();
    if (skills.length === 0) return "";
    const lines = skills.map((s) => `- ${s.name}: ${s.description}`);
    return `<available_skills>
Before starting any non-trivial task, check this list. If a skill applies — even 1% chance —
load it with the skill tool FIRST and follow it exactly.
${lines.join("\n")}
</available_skills>`;
  }
}
