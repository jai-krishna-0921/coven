/**
 * The public plugin API. A plugin module default-exports a CovenPlugin:
 * an async function receiving PluginInput and returning Hooks.
 *
 * Hook convention (borrowed from OpenCode): every hook is
 * `(input, output) => Promise<void> | void` and MUTATES `output` in place.
 * Hooks run sequentially in plugin load order.
 */
import type { z } from "zod";
import type { BusEvent } from "../bus/index.ts";
import type { CovenConfig } from "../config/schema.ts";
import type { PermissionRequest, PermissionAction } from "../permission/types.ts";
import type { ToolResult } from "../tool/types.ts";

export interface PluginToolDefinition {
  description: string;
  /** Zod schema for arguments. */
  parameters: z.ZodType;
  execute(args: unknown, ctx: { sessionID: string; root: string; abort: AbortSignal }): Promise<string | ToolResult>;
}

export interface Hooks {
  /** Observe every bus event (session/message/tool/permission lifecycle). */
  event?(event: BusEvent): void | Promise<void>;
  /** Register custom tools, keyed by tool id. */
  tools?: Record<string, PluginToolDefinition>;
  /** Mutate tool args before execution. */
  "tool.execute.before"?(
    input: { tool: string; sessionID: string; callID: string },
    output: { args: unknown },
  ): void | Promise<void>;
  /** Mutate tool results after execution. */
  "tool.execute.after"?(
    input: { tool: string; sessionID: string; callID: string; args: unknown },
    output: ToolResult,
  ): void | Promise<void>;
  /** Override a permission decision before it reaches the user ("allow"/"deny" skips the ask). */
  "permission.ask"?(input: PermissionRequest, output: { action: PermissionAction }): void | Promise<void>;
  /** Adjust model call parameters per turn. */
  "chat.params"?(
    input: { agent: string; model: string },
    output: { temperature?: number; maxTokens?: number },
  ): void | Promise<void>;
  /** Append/modify system prompt segments per turn. */
  "chat.system"?(input: { agent: string }, output: { system: string[] }): void | Promise<void>;
  /** Cleanup on shutdown. */
  dispose?(): void | Promise<void>;
}

export interface PluginInput {
  root: string;
  config: CovenConfig;
  /** Subscribe directly if the event hook isn't enough. */
  subscribe(listener: (event: BusEvent) => void): () => void;
}

export type CovenPlugin = (input: PluginInput) => Hooks | Promise<Hooks>;
