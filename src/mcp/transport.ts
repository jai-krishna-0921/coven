/**
 * MCP transports. Two shapes, one interface:
 *  - {@link StdioTransport}: a local subprocess speaking newline-delimited
 *    JSON-RPC over stdin/stdout (the common case: filesystem, github, …).
 *  - {@link HttpTransport}: a remote endpoint over Streamable HTTP / SSE — each
 *    outgoing message is POSTed; the response is JSON or an SSE event stream.
 *
 * Transports are dumb pipes: framing + delivery only. The {@link McpClient}
 * owns the JSON-RPC handshake and request/response correlation.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createLogger } from "../util/log.ts";
import type { JsonRpcMessage } from "./types.ts";

const log = createLogger("mcp");

export interface Transport {
  start(): Promise<void>;
  send(msg: JsonRpcMessage): void;
  onMessage(handler: (msg: JsonRpcMessage) => void): void;
  onClose(handler: (reason?: string) => void): void;
  close(): Promise<void>;
}

/** Split a growing buffer into complete newline-delimited JSON messages. */
function drainLines(buffer: string, onMessage: (msg: JsonRpcMessage) => void): string {
  let rest = buffer;
  let nl: number;
  while ((nl = rest.indexOf("\n")) !== -1) {
    const line = rest.slice(0, nl).trim();
    rest = rest.slice(nl + 1);
    if (!line) continue;
    try {
      onMessage(JSON.parse(line) as JsonRpcMessage);
    } catch {
      log.warn("mcp: dropped non-JSON line", { line: line.slice(0, 200) });
    }
  }
  return rest;
}

export class StdioTransport implements Transport {
  private child: ChildProcess | undefined;
  private buffer = "";
  private messageHandler: (msg: JsonRpcMessage) => void = () => {};
  private closeHandler: (reason?: string) => void = () => {};
  private closed = false;

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly env?: Record<string, string>,
  ) {}

  async start(): Promise<void> {
    const child = spawn(this.command, this.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.env },
      detached: process.platform !== "win32", // own process group so close() kills the tree
    });
    this.child = child;
    child.on("error", (error) => this.fail(`spawn failed: ${String(error)}`));
    child.on("exit", (code, signal) => this.fail(`exited (code ${code ?? "null"}${signal ? `, ${signal}` : ""})`));
    child.stdout?.on("data", (chunk: Buffer) => {
      this.buffer = drainLines(this.buffer + chunk.toString(), this.messageHandler);
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) log.debug("mcp stderr", { command: this.command, text: text.slice(0, 500) });
    });
    child.stdin?.on("error", () => {}); // broken pipe on a dying server must not crash us
  }

  private fail(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.closeHandler(reason);
  }

  send(msg: JsonRpcMessage): void {
    if (this.closed || !this.child?.stdin?.writable) return;
    this.child.stdin.write(JSON.stringify(msg) + "\n");
  }

  onMessage(handler: (msg: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: (reason?: string) => void): void {
    this.closeHandler = handler;
  }

  async close(): Promise<void> {
    this.closed = true;
    const child = this.child;
    if (!child || child.exitCode !== null) return;
    try {
      if (process.platform !== "win32" && child.pid !== undefined) process.kill(-child.pid, "SIGTERM");
      else child.kill("SIGTERM");
    } catch {
      try {
        child.kill("SIGKILL");
      } catch {
        /* already gone */
      }
    }
  }
}

export class HttpTransport implements Transport {
  private sessionId: string | undefined;
  private messageHandler: (msg: JsonRpcMessage) => void = () => {};
  private closeHandler: (reason?: string) => void = () => {};
  private closed = false;

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string> = {},
    private readonly fetchImpl: typeof fetch = fetch,
  ) {}

  async start(): Promise<void> {
    /* HTTP is request-driven; nothing to open until the first send(). */
  }

  send(msg: JsonRpcMessage): void {
    void this.post(msg);
  }

  private async post(msg: JsonRpcMessage): Promise<void> {
    if (this.closed) return;
    let res: Response;
    try {
      res = await this.fetchImpl(this.url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...this.headers,
          ...(this.sessionId ? { "mcp-session-id": this.sessionId } : {}),
        },
        body: JSON.stringify(msg),
      });
    } catch (error) {
      this.fail(`request failed: ${String(error)}`);
      return;
    }
    const sid = res.headers.get("mcp-session-id");
    if (sid) this.sessionId = sid;
    if (!res.ok) {
      this.fail(`HTTP ${res.status}`);
      return;
    }
    const ct = res.headers.get("content-type") ?? "";
    if (res.status === 202 || !res.body) return; // accepted notification, no payload
    if (ct.includes("text/event-stream")) {
      await this.readSse(res.body);
    } else {
      try {
        this.messageHandler((await res.json()) as JsonRpcMessage);
      } catch (error) {
        log.warn("mcp: bad JSON response", { error: String(error) });
      }
    }
  }

  private async readSse(body: ReadableStream<Uint8Array>): Promise<void> {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let sep: number;
      while ((sep = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, sep).trim();
        buffer = buffer.slice(sep + 1);
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (!payload || payload === "[DONE]") continue;
        try {
          this.messageHandler(JSON.parse(payload) as JsonRpcMessage);
        } catch {
          /* skip keep-alive / partial */
        }
      }
    }
  }

  private fail(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.closeHandler(reason);
  }

  onMessage(handler: (msg: JsonRpcMessage) => void): void {
    this.messageHandler = handler;
  }

  onClose(handler: (reason?: string) => void): void {
    this.closeHandler = handler;
  }

  async close(): Promise<void> {
    this.closed = true;
  }
}
