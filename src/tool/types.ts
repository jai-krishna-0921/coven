import { z } from "zod";
import type { AskInput } from "../permission/types.ts";
import type { Message } from "../session/types.ts";

export interface ToolContext {
  sessionID: string;
  messageID: string;
  callID: string;
  /** Name of the agent executing this tool. */
  agent: string;
  /** Workspace root — tools must not escape it without an external_directory permission. */
  root: string;
  abort: AbortSignal;
  /** Conversation so far (read-only) — lets tools like task see context. */
  messages: readonly Message[];
  /**
   * Gate on the permission engine. Resolves when allowed; throws
   * PermissionDeniedError / PermissionRejectedError otherwise.
   */
  ask(input: AskInput): Promise<void>;
  /** Update the live title shown in the TUI while the tool runs. */
  progress(title: string): void;
  /** Spawn a subagent session (injected by the session layer; used by the task tool). */
  spawnSubagent?(input: { agent: string; prompt: string; description: string }): Promise<string>;
  /** Load a skill body by name (injected by the session layer; used by the skill tool). */
  loadSkill?(name: string): { content: string; dir: string } | undefined;
}

export interface ToolResult {
  /** One-line human summary, e.g. the file path or command. */
  title: string;
  /** Output fed back to the model. */
  output: string;
  metadata?: Record<string, unknown>;
}

export interface ToolDef<Args = unknown> {
  id: string;
  description: string;
  parameters: z.ZodType<Args>;
  execute(args: Args, ctx: ToolContext): Promise<ToolResult>;
}

/** Identity helper that preserves the Args type for inference. */
export function defineTool<Args>(def: ToolDef<Args>): ToolDef<Args> {
  return def;
}

const MAX_OUTPUT_CHARS = 50_000;

export function truncateOutput(output: string): string {
  if (output.length <= MAX_OUTPUT_CHARS) return output;
  const half = Math.floor(MAX_OUTPUT_CHARS / 2);
  return `${output.slice(0, half)}\n\n… [${output.length - MAX_OUTPUT_CHARS} chars truncated] …\n\n${output.slice(-half)}`;
}

export function toJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const json = z.toJSONSchema(schema, { target: "draft-7", io: "input" }) as Record<string, unknown>;
  delete json["$schema"];
  return json;
}
