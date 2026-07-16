/**
 * LSP client: the initialize handshake, the textDocument lifecycle
 * (didOpen/didChange), request/response correlation for hover / definition /
 * references, and collection of publishDiagnostics notifications via a callback.
 * Requests time out; a transport close rejects everything in flight.
 */
import { createLogger } from "../util/log.ts";
import type { LspTransport } from "./transport.ts";
import type { Diagnostic, JsonRpcId, Location, LspMessage, Position } from "./types.ts";

const log = createLogger("lsp");
const DEFAULT_TIMEOUT_MS = 15_000;

interface Pending {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface LspClientOptions {
  rootUri: string;
  timeoutMs?: number;
  onDiagnostics?: (uri: string, diagnostics: Diagnostic[]) => void;
}

export class LspClient {
  private nextId = 1;
  private pending = new Map<JsonRpcId, Pending>();
  private closed = false;

  constructor(
    private readonly transport: LspTransport,
    private readonly opts: LspClientOptions,
  ) {
    transport.onMessage((msg) => this.onMessage(msg));
    transport.onClose((reason) => this.onClose(reason));
  }

  private onMessage(msg: LspMessage): void {
    if ("method" in msg) {
      if (msg.method === "textDocument/publishDiagnostics") {
        const params = msg.params as { uri: string; diagnostics?: Diagnostic[] } | undefined;
        if (params?.uri) this.opts.onDiagnostics?.(params.uri, params.diagnostics ?? []);
        return;
      }
      // Server-initiated request (e.g. workspace/configuration) — answer null so
      // the server doesn't stall waiting on us.
      if ("id" in msg && msg.id !== undefined && msg.id !== null) {
        this.transport.send({ jsonrpc: "2.0", id: msg.id, result: null });
      }
      return;
    }
    if (!("id" in msg) || msg.id === undefined || msg.id === null) return;
    const entry = this.pending.get(msg.id);
    if (!entry) return;
    this.pending.delete(msg.id);
    clearTimeout(entry.timer);
    if ("error" in msg && msg.error) entry.reject(new Error(`${msg.error.message} (code ${msg.error.code})`));
    else entry.resolve((msg as { result?: unknown }).result);
  }

  private onClose(reason?: string): void {
    this.closed = true;
    const error = new Error(`lsp transport closed: ${reason ?? "unknown"}`);
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
  }

  private request(method: string, params?: unknown, timeoutMs?: number): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error("lsp client is closed"));
    const id = this.nextId++;
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`lsp request timed out: ${method}`));
      }, timeoutMs ?? this.opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
      this.pending.set(id, { resolve, reject, timer });
      this.transport.send({ jsonrpc: "2.0", id, method, params });
    });
  }

  private notify(method: string, params?: unknown): void {
    this.transport.send({ jsonrpc: "2.0", method, params });
  }

  async initialize(): Promise<void> {
    await this.transport.start();
    await this.request("initialize", {
      processId: process.pid,
      rootUri: this.opts.rootUri,
      workspaceFolders: [{ uri: this.opts.rootUri, name: "root" }],
      capabilities: {
        textDocument: {
          synchronization: { didSave: false, dynamicRegistration: false },
          hover: { contentFormat: ["plaintext", "markdown"] },
          definition: {},
          references: {},
          publishDiagnostics: {},
        },
        workspace: { workspaceFolders: true, configuration: true },
      },
      clientInfo: { name: "coven", version: "0.4.1" },
    });
    this.notify("initialized", {});
    log.debug("lsp: initialized", { rootUri: this.opts.rootUri });
  }

  didOpen(uri: string, languageId: string, version: number, text: string): void {
    this.notify("textDocument/didOpen", { textDocument: { uri, languageId, version, text } });
  }

  didChange(uri: string, version: number, text: string): void {
    this.notify("textDocument/didChange", { textDocument: { uri, version }, contentChanges: [{ text }] });
  }

  async hover(uri: string, position: Position): Promise<unknown> {
    return this.request("textDocument/hover", { textDocument: { uri }, position });
  }

  async definition(uri: string, position: Position): Promise<Location | Location[] | null> {
    return (await this.request("textDocument/definition", { textDocument: { uri }, position })) as
      | Location
      | Location[]
      | null;
  }

  async references(uri: string, position: Position): Promise<Location[]> {
    const result = (await this.request("textDocument/references", {
      textDocument: { uri },
      position,
      context: { includeDeclaration: true },
    })) as Location[] | null;
    return result ?? [];
  }

  async shutdown(): Promise<void> {
    if (!this.closed) {
      try {
        await this.request("shutdown", null, 2_000);
        this.notify("exit");
      } catch {
        /* server already gone */
      }
    }
    await this.transport.close();
  }
}
