import type { Ruleset } from "../permission/types.ts";

export type AgentMode = "primary" | "subagent" | "all";

export interface AgentInfo {
  name: string;
  description: string;
  /** primary = user-selectable; subagent = task-tool dispatchable; all = both. */
  mode: AgentMode;
  /** Hidden agents are internal (titles, summaries) and never listed. */
  hidden?: boolean;
  /** "provider/model" override; defaults to the session model. */
  model?: string;
  temperature?: number;
  /** Max agentic iterations per turn. */
  steps?: number;
  /** System prompt appended to the base prompt. */
  prompt: string;
  /** Agent-specific permission rules, appended after engine baseline (last wins). */
  permission: Ruleset;
}
