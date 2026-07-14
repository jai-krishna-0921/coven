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
import { isStdioConfig, type McpServerConfig, type McpServerStatus, type McpTool } from "./types.ts";

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
  client: McpClient;
  status: McpServerStatus;
}

export class McpHost {
  private entries: ServerEntry[] = [];
  private tools: ToolDef<never>[] = [];

  constructor(
    private readonly config: Record<string, McpServerConfig> | undefined,
    private readonly bus?: Bus,
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
    const client = new McpClient(transport, cfg.timeoutMs);
    const status: McpServerStatus = {
      name,
      transport: stdio ? "stdio" : (cfg.type ?? "http"),
      state: "connecting",
      toolCount: 0,
    };
    this.entries.push({ client, status });
    this.emit(status);
    try {
      await client.connect();
      const tools = await client.listTools();
      for (const tool of tools) this.tools.push(bridgeTool(name, tool, client));
      status.state = "ready";
      status.toolCount = tools.length;
      log.info("mcp server connected", { name, tools: tools.length });
    } catch (error) {
      status.state = "error";
      status.error = String(error);
      await client.close().catch(() => {});
      log.warn("mcp server failed", { name, error: String(error) });
    }
    this.emit(status);
  }

  private emit(status: McpServerStatus): void {
    this.bus?.publish({ type: "mcp.status", status: { ...status } });
  }

  /** Bridged tool defs to register into the ToolRegistry. */
  toolDefs(): ToolDef<never>[] {
    return this.tools;
  }

  /** Per-server status for the sidebar / `coven mcp`. */
  servers(): McpServerStatus[] {
    return this.entries.map((e) => ({ ...e.status }));
  }

  async dispose(): Promise<void> {
    await Promise.all(this.entries.map((e) => e.client.close().catch(() => {})));
  }
}
