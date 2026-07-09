/**
 * Agent registry: builtins ← coven.json overrides ← .coven/agents/*.md files.
 * Later sources win field-by-field; permission rules append (last-match-wins
 * downstream, so later sources take precedence there too).
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { CovenConfig } from "../config/schema.ts";
import { rulesFromConfig } from "../permission/index.ts";
import { parseFrontmatter } from "../util/frontmatter.ts";
import { createLogger } from "../util/log.ts";
import { BUILTIN_AGENTS } from "./builtin.ts";
import type { AgentInfo, AgentMode } from "./types.ts";

const log = createLogger("agent");

function loadMarkdownAgents(dir: string): AgentInfo[] {
  if (!existsSync(dir)) return [];
  const agents: AgentInfo[] = [];
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".md")) continue;
    try {
      const { data, body } = parseFrontmatter(readFileSync(join(dir, file), "utf8"));
      const name = data["name"] ?? file.replace(/\.md$/, "");
      agents.push({
        name,
        description: data["description"] ?? `Custom agent from ${file}`,
        mode: (data["mode"] as AgentMode) ?? "all",
        model: data["model"],
        temperature: data["temperature"] ? Number(data["temperature"]) : undefined,
        steps: data["steps"] ? Number(data["steps"]) : undefined,
        prompt: body.trim(),
        permission: [],
      });
    } catch (error) {
      log.warn("failed to load agent file", { file, error: String(error) });
    }
  }
  return agents;
}

export class AgentRegistry {
  private agents = new Map<string, AgentInfo>();

  constructor(config: CovenConfig, root: string) {
    for (const agent of BUILTIN_AGENTS) this.agents.set(agent.name, { ...agent });

    // Markdown agents from the project.
    for (const agent of loadMarkdownAgents(join(root, ".coven", "agents"))) {
      const existing = this.agents.get(agent.name);
      this.agents.set(agent.name, existing ? { ...existing, ...agent, permission: [...existing.permission] } : agent);
    }

    // Config overrides win over everything.
    for (const [name, override] of Object.entries(config.agent ?? {})) {
      if (override.disable) {
        this.agents.delete(name);
        continue;
      }
      const existing = this.agents.get(name);
      const base: AgentInfo = existing ?? {
        name,
        description: override.description ?? `Custom agent "${name}"`,
        mode: override.mode ?? "all",
        prompt: override.prompt ?? "",
        permission: [],
      };
      this.agents.set(name, {
        ...base,
        description: override.description ?? base.description,
        mode: override.mode ?? base.mode,
        model: override.model ?? base.model,
        temperature: override.temperature ?? base.temperature,
        steps: override.steps ?? base.steps,
        hidden: override.hidden ?? base.hidden,
        prompt: override.prompt ?? base.prompt,
        permission: [...base.permission, ...rulesFromConfig(override.permission)],
      });
    }
  }

  get(name: string): AgentInfo | undefined {
    return this.agents.get(name);
  }

  /** Agents the user can drive directly. */
  primaries(): AgentInfo[] {
    return [...this.agents.values()].filter((a) => !a.hidden && (a.mode === "primary" || a.mode === "all"));
  }

  /** Agents the task tool can dispatch. */
  subagents(): AgentInfo[] {
    return [...this.agents.values()].filter((a) => !a.hidden && (a.mode === "subagent" || a.mode === "all"));
  }

  all(): AgentInfo[] {
    return [...this.agents.values()];
  }
}
