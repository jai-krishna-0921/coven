/** Where a command definition came from; later sources win on name collisions. */
export type CommandSource = "builtin" | "global" | "project" | "mcp" | "skill";

export interface CommandDef {
  /** Slash name, e.g. "init" or "git/pr" for nested files. */
  name: string;
  description: string;
  /** Prompt template body (markdown, trimmed). */
  template: string;
  /** Agent to run the expanded prompt with; defaults to the caller's agent. */
  agent?: string;
  /** "provider/model" override. */
  model?: string;
  /** Run in a child session (subtask) instead of the main conversation. */
  subtask?: boolean;
  source: CommandSource;
  /** Ordered placeholder names found in the template, e.g. ["$1", "$2"] or ["$ARGUMENTS"]. */
  hints: string[];
  /**
   * Async resolver — when present, `expand()` calls it instead of doing
   * template substitution. Lets MCP-sourced commands fetch their body lazily
   * from the server at slash-invoke time.
   */
  resolve?: (rawArgs: string, opts: { root: string }) => Promise<string>;
}
