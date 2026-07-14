/**
 * LSP stdio transport: JSON-RPC over `Content-Length: N\r\n\r\n<body>` framing
 * (the LSP wire format — distinct from MCP's newline framing). Byte-accurate:
 * the length counts UTF-8 bytes, so we buffer Buffers, not strings.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createLogger } from "../util/log.ts";
import type { LspMessage } from "./types.ts";

const log = createLogger("lsp");

export interface LspTransport {
  start(): Promise<void>;
  send(msg: LspMessage): void;
  onMessage(handler: (msg: LspMessage) => void): void;
  onClose(handler: (reason?: string) => void): void;
  close(): Promise<void>;
}

export class LspStdioTransport implements LspTransport {
  private child: ChildProcess | undefined;
  private buffered: Buffer = Buffer.alloc(0);
  private messageHandler: (msg: LspMessage) => void = () => {};
  private closeHandler: (reason?: string) => void = () => {};
  private closed = false;

  constructor(
    private readonly command: string,
    private readonly args: string[] = [],
    private readonly cwd?: string,
    private readonly env?: Record<string, string>,
  ) {}

  async start(): Promise<void> {
    const child = spawn(this.command, this.args, {
      cwd: this.cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...this.env },
      detached: process.platform !== "win32", // own process group so close() kills the tree
    });
    this.child = child;
    child.on("error", (error) => this.fail(`spawn failed: ${String(error)}`));
    child.on("exit", (code, signal) => this.fail(`exited (code ${code ?? "null"}${signal ? `, ${signal}` : ""})`));
    child.stdout?.on("data", (chunk: Buffer) => {
      this.buffered = Buffer.concat([this.buffered, chunk]);
      this.drain();
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      const text = chunk.toString().trim();
      if (text) log.debug("lsp stderr", { command: this.command, text: text.slice(0, 300) });
    });
    child.stdin?.on("error", () => {});
  }

  private drain(): void {
    while (true) {
      const headerEnd = this.buffered.indexOf("\r\n\r\n");
      if (headerEnd === -1) return;
      const header = this.buffered.subarray(0, headerEnd).toString("ascii");
      const match = /content-length:\s*(\d+)/i.exec(header);
      if (!match) {
        // Malformed frame — resync past this header block.
        this.buffered = this.buffered.subarray(headerEnd + 4);
        continue;
      }
      const length = Number.parseInt(match[1]!, 10);
      const bodyStart = headerEnd + 4;
      if (this.buffered.length < bodyStart + length) return; // wait for the rest
      const body = this.buffered.subarray(bodyStart, bodyStart + length).toString("utf8");
      this.buffered = this.buffered.subarray(bodyStart + length);
      try {
        this.messageHandler(JSON.parse(body) as LspMessage);
      } catch {
        log.warn("lsp: dropped non-JSON frame", { body: body.slice(0, 200) });
      }
    }
  }

  private fail(reason: string): void {
    if (this.closed) return;
    this.closed = true;
    this.closeHandler(reason);
  }

  send(msg: LspMessage): void {
    if (this.closed || !this.child?.stdin?.writable) return;
    const body = Buffer.from(JSON.stringify(msg), "utf8");
    this.child.stdin.write(`Content-Length: ${body.length}\r\n\r\n`);
    this.child.stdin.write(body);
  }

  onMessage(handler: (msg: LspMessage) => void): void {
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
        /* gone */
      }
    }
  }
}
