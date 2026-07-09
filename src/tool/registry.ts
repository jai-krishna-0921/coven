import type { ToolDef } from "./types.ts";
import { readTool } from "./read.ts";
import { writeTool } from "./write.ts";
import { editTool } from "./edit.ts";
import { lsTool } from "./ls.ts";
import { globTool } from "./glob.ts";
import { grepTool } from "./grep.ts";
import { bashTool } from "./bash.ts";
import { webfetchTool } from "./webfetch.ts";
import { todoTool } from "./todo.ts";
import { taskTool } from "./task.ts";
import { skillTool } from "./skill.ts";

/** Tool ids the read-only agents are limited to. */
export const READ_ONLY_TOOLS = ["read", "ls", "glob", "grep", "webfetch", "skill", "todo"] as const;

export const BUILTIN_TOOLS: ToolDef<never>[] = [
  readTool,
  writeTool,
  editTool,
  lsTool,
  globTool,
  grepTool,
  bashTool,
  webfetchTool,
  todoTool,
  taskTool,
  skillTool,
] as ToolDef<never>[];

export class ToolRegistry {
  private tools = new Map<string, ToolDef<never>>();

  constructor() {
    for (const tool of BUILTIN_TOOLS) this.tools.set(tool.id, tool);
  }

  register(tool: ToolDef<never>): void {
    this.tools.set(tool.id, tool);
  }

  get(id: string): ToolDef<never> | undefined {
    return this.tools.get(id);
  }

  all(): ToolDef<never>[] {
    return [...this.tools.values()];
  }

  /**
   * Tools visible to an agent: everything whose `tool.<id>` permission does not
   * resolve to deny for that agent. Subagent-incapable agents also lose `task`.
   */
  forAgent(resolveAction: (permission: string, pattern: string) => "allow" | "ask" | "deny"): ToolDef<never>[] {
    return this.all().filter((tool) => resolveAction("tool", tool.id) !== "deny");
  }
}
