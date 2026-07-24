/**
 * MCP client: the JSON-RPC handshake and request/response correlation over a
 * {@link Transport}. Owns the initialize → initialized → tools/list flow and
 * turns tools/call into a typed result. Requests time out, and a transport
 * close rejects every in-flight request so callers never hang.
 */
import { createLogger } from "../util/log.ts";
import type { Transport } from "./transport.ts";
import {
  JSONRPC_VERSION,
  MCP_PROTOCOL_VERSION,
  type JsonRpcId,
  type JsonRpcMessage,
  type McpPrompt,
  type McpPromptResult,
  type McpResource,
  type McpTool,
  type McpToolCallResult,
} from "./types.ts";

const log = createLogger("mcp");
const DEFAULT_TIMEOUT_MS = 30_000;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface McpServerCapabilities {
  tools?: { listChanged?: boolean };
  resources?: { listChanged?: boolean; subscribe?: boolean };
  prompts?: { listChanged?: boolean };
  logging?: Record<string, unknown>;
}

export interface McpClientHandlers {
  /** Fires when the server sends notifications/tools/list_changed — refetch tools. */
  onToolsChanged?: () => void;
  /** notifications/message — server-emitted log records. */
  onLog?: (level: string, logger: string | undefined, data: unknown) => void;
  /** Answer the server's roots/list request; return `undefined` to reply []. */
  onListRoots?: () => Array<{ uri: string; name?: string }> | undefined;
}

export class McpClient {
  private nextId = 1;
  private pending = new Map<JsonRpcId, Pending>();
  private closed = false;
  private serverInstructions?: string;
  private capabilities: McpServerCapabilities = {};

  constructor(
    private readonly transport: Transport,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
    private readonly handlers: McpClientHandlers = {},
  ) {
    transport.onMessage((msg) => this.onMessage(msg));
    transport.onClose((reason) => this.onClose(reason));
  }

  private onMessage(msg: JsonRpcMessage): void {
    if ("method" in msg) {
      // Server-emitted notification (no id) or server request (has id).
      const method = (msg as { method: string }).method;
      const hasId = "id" in msg && msg.id !== undefined && msg.id !== null;
      if (!hasId) {
        if (method === "notifications/tools/list_changed") this.handlers.onToolsChanged?.();
        else if (method === "notifications/message") {
          const params = (msg as { params?: { level?: string; logger?: string; data?: unknown } }).params ?? {};
          this.handlers.onLog?.(params.level ?? "info", params.logger, params.data);
        }
        return;
      }
      if (method === "roots/list") {
        const roots = this.handlers.onListRoots?.() ?? [];
        this.transport.send({ jsonrpc: JSONRPC_VERSION, id: (msg as { id: JsonRpcId }).id, result: { roots } });
        return;
      }
      // Anything else server-initiated: answer null so the server doesn't stall.
      this.transport.send({ jsonrpc: JSONRPC_VERSION, id: (msg as { id: JsonRpcId }).id, result: null });
      return;
    }
    if (!("id" in msg) || msg.id === undefined || msg.id === null) return;
    if (!("result" in msg) && !("error" in msg)) return;
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    clearTimeout(entry.timer);
    if ("error" in msg && msg.error) entry.reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
    else entry.resolve((msg as { result?: unknown }).result);
  }

  private onClose(reason?: string): void {
    this.closed = true;
    const error = new Error(`mcp transport closed: ${reason ?? "unknown"}`);
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("mcp client is closed"));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`mcp request timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.transport.send({ jsonrpc: JSONRPC_VERSION, id, method, params });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.transport.send({ jsonrpc: JSONRPC_VERSION, method, params });
  }

  async connect(): Promise<void> {
    await this.transport.start();
    const initResult = (await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {
        // Declare roots so the server knows Coven can answer roots/list.
        roots: { listChanged: false },
      },
      clientInfo: { name: "coven", version: "0.5.1" },
    })) as { instructions?: string; capabilities?: McpServerCapabilities } | undefined;
    this.serverInstructions = initResult?.instructions;
    this.capabilities = initResult?.capabilities ?? {};
    this.notify("notifications/initialized");
    log.debug("mcp: initialized", { hasInstructions: !!this.serverInstructions });
  }

  getInstructions(): string | undefined {
    return this.serverInstructions;
  }

  serverCapabilities(): McpServerCapabilities {
    return this.capabilities;
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.request("tools/list")) as { tools?: McpTool[] } | undefined;
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const result = (await this.request("tools/call", { name, arguments: args })) as McpToolCallResult;
    return { content: result?.content ?? [], isError: result?.isError };
  }

  async listResources(): Promise<McpResource[]> {
    if (!this.capabilities.resources) return [];
    const result = (await this.request("resources/list")) as { resources?: McpResource[] } | undefined;
    return result?.resources ?? [];
  }

  async readResource(uri: string): Promise<{ contents: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> }> {
    const result = (await this.request("resources/read", { uri })) as
      | { contents?: Array<{ uri: string; mimeType?: string; text?: string; blob?: string }> }
      | undefined;
    return { contents: result?.contents ?? [] };
  }

  async listPrompts(): Promise<McpPrompt[]> {
    if (!this.capabilities.prompts) return [];
    const result = (await this.request("prompts/list")) as { prompts?: McpPrompt[] } | undefined;
    return result?.prompts ?? [];
  }

  async getPrompt(name: string, args: Record<string, unknown> = {}): Promise<McpPromptResult> {
    const result = (await this.request("prompts/get", { name, arguments: args })) as McpPromptResult;
    return { description: result?.description, messages: result?.messages ?? [] };
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.transport.close();
  }
}
