/**
 * System prompt assembly: base identity + environment + agent charter +
 * project instructions (AGENTS.md etc.) + subagent roster + skills index.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { AgentInfo } from "../agent/types.ts";
import type { AgentRegistry } from "../agent/index.ts";
import type { SkillRegistry } from "../skill/index.ts";
import type { CovenConfig } from "../config/schema.ts";

const BASE_PROMPT = `You are Coven, a terminal-based coding agent. You act through tools; keep text responses
concise and terminal-friendly (no elaborate markdown). Prefer dedicated tools (read, edit,
write, grep, glob) over bash equivalents. Never invent file contents — read before editing.
Evidence before assertions: verify claims by running commands and reading output.
Safety: never exfiltrate secrets; never run destructive commands without need; respect
permission denials — a denied action means adjust the approach, not retry harder.`;

const INSTRUCTION_CANDIDATES = ["AGENTS.md", "CLAUDE.md", ".coven/instructions.md"];

export function assembleSystemPrompt(input: {
  agent: AgentInfo;
  agents: AgentRegistry;
  skills: SkillRegistry;
  config: CovenConfig;
  root: string;
}): string {
  const sections: string[] = [BASE_PROMPT];

  sections.push(
    `<environment>
Working directory: ${input.root}
Platform: ${process.platform}
Date: ${new Date().toDateString()}
</environment>`,
  );

  sections.push(`<agent name="${input.agent.name}">\n${input.agent.prompt}\n</agent>`);

  // Project instructions — first candidate found wins, plus config extras.
  const instructionFiles = [...INSTRUCTION_CANDIDATES, ...(input.config.instructions ?? [])];
  const seen = new Set<string>();
  for (const file of instructionFiles) {
    const path = join(input.root, file);
    if (seen.has(path) || !existsSync(path)) continue;
    seen.add(path);
    const content = readFileSync(path, "utf8").trim();
    if (content) sections.push(`<project_instructions source="${file}">\n${content}\n</project_instructions>`);
    if (INSTRUCTION_CANDIDATES.includes(file)) break; // only one primary instructions file
  }

  // Subagent roster for the task tool.
  const subagents = input.agents.subagents().filter((a) => a.name !== input.agent.name);
  if (subagents.length > 0) {
    const roster = subagents.map((a) => `- ${a.name}: ${a.description}`).join("\n");
    sections.push(`<subagents>\nDispatchable via the task tool:\n${roster}\n</subagents>`);
  }

  const skillsBlock = input.skills.systemPromptBlock();
  if (skillsBlock) sections.push(skillsBlock);

  return sections.join("\n\n");
}
