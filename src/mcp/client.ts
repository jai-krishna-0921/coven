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

export class McpClient {
  private nextId = 1;
  private pending = new Map<JsonRpcId, Pending>();
  private closed = false;

  constructor(
    private readonly transport: Transport,
    private readonly timeoutMs: number = DEFAULT_TIMEOUT_MS,
  ) {
    transport.onMessage((msg) => this.onMessage(msg));
    transport.onClose((reason) => this.onClose(reason));
  }

  private onMessage(msg: JsonRpcMessage): void {
    if (!("id" in msg) || msg.id === undefined || msg.id === null) return; // notification / server request
    if (!("result" in msg) && !("error" in msg)) return; // server-initiated request (unsupported) — ignore
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
    await this.request("initialize", {
      protocolVersion: MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: "coven", version: "0.3.1" },
    });
    this.notify("notifications/initialized");
    log.debug("mcp: initialized");
  }

  async listTools(): Promise<McpTool[]> {
    const result = (await this.request("tools/list")) as { tools?: McpTool[] } | undefined;
    return result?.tools ?? [];
  }

  async callTool(name: string, args: Record<string, unknown>): Promise<McpToolCallResult> {
    const result = (await this.request("tools/call", { name, arguments: args })) as McpToolCallResult;
    return { content: result?.content ?? [], isError: result?.isError };
  }

  async close(): Promise<void> {
    this.closed = true;
    await this.transport.close();
  }
}
