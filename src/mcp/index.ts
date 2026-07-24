/**
 * MCP host: connects every configured server, bridges each server's tools into
 * Coven {@link ToolDef}s (namespaced `mcp__<server>__<tool>`, permission-gated
 * under the `mcp` permission), and tracks per-server status for the UI. A server
 * that fails to connect is logged and skipped — it never blocks the others or
 * the app.
 */
import { z } from "zod";
import { truncateOutput, type ToolDef } from "../tool/types.ts";
import { createLogger } from "../util/log.ts";
import type { Bus } from "../bus/index.ts";
import { McpClient } from "./client.ts";
import { HttpTransport, StdioTransport } from "./transport.ts";
import {
  isStdioConfig,
  type McpPrompt,
  type McpResource,
  type McpServerConfig,
  type McpServerStatus,
  type McpTool,
} from "./types.ts";

export type { McpServerConfig, McpServerStatus } from "./types.ts";

const log = createLogger("mcp");

/** MCP → provider-safe tool name segment. */
function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, "_");
}

export function bridgeTool(server: string, tool: McpTool, client: McpClient): ToolDef<never> {
  const id = `mcp__${sanitize(server)}__${sanitize(tool.name)}`;
  const schema =
    tool.inputSchema && typeof tool.inputSchema === "object"
      ? tool.inputSchema
      : { type: "object", properties: {} };
  return {
    id,
    description: tool.description ?? `MCP tool "${tool.name}" from server "${server}"`,
    parameters: z.record(z.string(), z.unknown()) as unknown as z.ZodType<never>,
    jsonSchema: schema,
    async execute(args, ctx) {
      await ctx.ask({
        permission: "mcp",
        patterns: [`${server}/${tool.name}`],
        title: `MCP ${server}: ${tool.name}`,
        metadata: { server, tool: tool.name },
      });
      let text: string;
      let isError = false;
      try {
        const result = await client.callTool(tool.name, (args ?? {}) as Record<string, unknown>);
        isError = result.isError ?? false;
        text = result.content.map((c) => (c.type === "text" ? (c.text ?? "") : `[${c.type} content]`)).join("\n").trim();
      } catch (error) {
        // A dead server must not crash the turn — surface the failure as output.
        text = `MCP call failed: ${String(error)}`;
        isError = true;
      }
      return {
        title: `mcp ${server}/${tool.name}`,
        output: truncateOutput(text || "(no output)"),
        metadata: { isError },
      };
    },
  };
}

interface ServerEntry {
  name: string;
  client: McpClient;
  status: McpServerStatus;
  tools: ToolDef<never>[];
  resources: McpResource[];
  prompts: McpPrompt[];
  instructions?: string;
}

/** A prompt template surfaced from an MCP server — used to auto-register slash commands. */
export interface McpPromptEntry {
  server: string;
  name: string;
  description?: string;
  arguments: Array<{ name: string; description?: string; required?: boolean }>;
}

export class McpHost {
  private entries: ServerEntry[] = [];

  constructor(
    private readonly config: Record<string, McpServerConfig> | undefined,
    private readonly bus?: Bus,
    /** Called when a server's tool list changes after connect (tools/list_changed). */
    private readonly onToolsChanged?: () => void,
  ) {}

  /** Connect every server in parallel; individual failures are isolated. */
  async connectAll(): Promise<void> {
    if (!this.config) return;
    await Promise.all(Object.entries(this.config).map(([name, cfg]) => this.connectOne(name, cfg)));
  }

  private async connectOne(name: string, cfg: McpServerConfig): Promise<void> {
    if (cfg.enabled === false) return;
    const stdio = isStdioConfig(cfg);
    const transport = stdio
      ? new StdioTransport(cfg.command, cfg.args, cfg.env)
      : new HttpTransport(cfg.url, cfg.headers);
    const status: McpServerStatus = {
      name,
      transport: stdio ? "stdio" : (cfg.type ?? "http"),
      state: "connecting",
      toolCount: 0,
    };
    const entry: ServerEntry = { name, client: undefined as unknown as McpClient, status, tools: [], resources: [], prompts: [] };
    const client = new McpClient(transport, cfg.timeoutMs, {
      onToolsChanged: () => {
        // Server hot-added or removed tools — refetch and notify listeners.
        void this.refreshTools(entry).catch(() => {});
      },
      onLog: (level, logger, data) => {
        log.info("mcp server log", { server: name, level, logger, data });
      },
      onListRoots: () => [{ uri: `file://${process.cwd()}`, name: "workspace" }],
    });
    entry.client = client;
    this.entries.push(entry);
    this.emit(status);
    try {
      await client.connect();
      entry.instructions = client.getInstructions();
      const [tools, resources, prompts] = await Promise.all([
        client.listTools().catch(() => [] as McpTool[]),
        client.listResources().catch(() => [] as McpResource[]),
        client.listPrompts().catch(() => [] as McpPrompt[]),
      ]);
      entry.tools = tools.map((tool) => bridgeTool(name, tool, client));
      entry.resources = resources;
      entry.prompts = prompts;
      status.state = "ready";
      status.toolCount = entry.tools.length;
      status.resourceCount = resources.length;
      status.promptCount = prompts.length;
      log.info("mcp server connected", {
        name,
        tools: entry.tools.length,
        resources: resources.length,
        prompts: prompts.length,
      });
    } catch (error) {
      status.state = "error";
      status.error = String(error);
      await client.close().catch(() => {});
      log.warn("mcp server failed", { name, error: String(error) });
    }
    this.emit(status);
  }

  private async refreshTools(entry: ServerEntry): Promise<void> {
    try {
      const tools = await entry.client.listTools();
      entry.tools = tools.map((tool) => bridgeTool(entry.name, tool, entry.client));
      entry.status.toolCount = entry.tools.length;
      this.emit(entry.status);
      this.onToolsChanged?.();
    } catch (error) {
      log.warn("mcp refresh tools failed", { name: entry.name, error: String(error) });
    }
  }

  private emit(status: McpServerStatus): void {
    this.bus?.publish({ type: "mcp.status", status: { ...status } });
  }

  /** Bridged tool defs to register into the ToolRegistry. */
  toolDefs(): ToolDef<never>[] {
    return this.entries.flatMap((e) => e.tools);
  }

  /** Per-server status for the sidebar / `coven mcp`. */
  servers(): McpServerStatus[] {
    return this.entries.map((e) => ({ ...e.status }));
  }

  /** Every MCP prompt across all connected servers — auto-registered as slash commands. */
  promptEntries(): McpPromptEntry[] {
    return this.entries.flatMap((e) =>
      e.prompts.map((p) => ({
        server: e.name,
        name: p.name,
        description: p.description,
        arguments: p.arguments ?? [],
      })),
    );
  }

  /** Fetch a prompt template — rendered as messages the model will consume. */
  async fetchPrompt(server: string, name: string, args: Record<string, unknown> = {}): Promise<string> {
    const entry = this.entries.find((e) => e.name === server);
    if (!entry) throw new Error(`mcp: no such server "${server}"`);
    const result = await entry.client.getPrompt(name, args);
    const parts: string[] = [];
    for (const message of result.messages) {
      const items = Array.isArray(message.content) ? message.content : [message.content];
      for (const item of items) {
        if (item && item.type === "text" && typeof item.text === "string") parts.push(item.text);
      }
    }
    return parts.join("\n");
  }

  /** Every MCP resource across all connected servers — surfaced as @-mention targets. */
  resources(): Array<McpResource & { server: string }> {
    return this.entries.flatMap((e) => e.resources.map((r) => ({ ...r, server: e.name })));
  }

  async readResource(server: string, uri: string): Promise<string> {
    const entry = this.entries.find((e) => e.name === server);
    if (!entry) throw new Error(`mcp: no such server "${server}"`);
    const { contents } = await entry.client.readResource(uri);
    return contents
      .map((c) => c.text ?? (c.blob ? `[binary blob ${c.mimeType ?? "?"}]` : ""))
      .filter(Boolean)
      .join("\n");
  }

  /** Concatenated instructions from every server for the system prompt. */
  instructions(): string {
    const blocks: string[] = [];
    for (const e of this.entries) {
      if (!e.instructions) continue;
      const tools = e.tools.map((t) => t.id).join(", ");
      blocks.push(`<mcp-server name="${e.name}" tools="${tools}">\n${e.instructions}\n</mcp-server>`);
    }
    return blocks.join("\n\n");
  }

  async dispose(): Promise<void> {
    await Promise.all(this.entries.map((e) => e.client.close().catch(() => {})));
  }
}
