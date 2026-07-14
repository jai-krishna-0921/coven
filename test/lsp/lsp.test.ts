import { describe, expect, test } from "bun:test";
import { LspClient } from "../../src/lsp/client.ts";
import type { LspTransport } from "../../src/lsp/transport.ts";
import type { LspMessage, LspRequest, LspResponse, Diagnostic } from "../../src/lsp/types.ts";

class FakeLspTransport implements LspTransport {
  sent: LspMessage[] = [];
  private handler: (m: LspMessage) => void = () => {};
  private closeHandler: (r?: string) => void = () => {};
  constructor(private responder?: (req: LspRequest) => LspResponse | undefined) {}
  async start(): Promise<void> {}
  send(msg: LspMessage): void {
    this.sent.push(msg);
    if ("id" in msg && "method" in msg && this.responder) {
      const res = this.responder(msg as LspRequest);
      if (res) queueMicrotask(() => this.handler(res));
    }
  }
  onMessage(h: (m: LspMessage) => void): void {
    this.handler = h;
  }
  onClose(h: (r?: string) => void): void {
    this.closeHandler = h;
  }
  async close(): Promise<void> {}
  emit(msg: LspMessage): void {
    this.handler(msg);
  }
  triggerClose(reason?: string): void {
    this.closeHandler(reason);
  }
}

const ok = (id: LspResponse["id"], result: unknown): LspResponse => ({ jsonrpc: "2.0", id, result });

describe("LspClient", () => {
  test("initialize handshakes then notifies initialized", async () => {
    const t = new FakeLspTransport((req) => (req.method === "initialize" ? ok(req.id, { capabilities: {} }) : undefined));
    const client = new LspClient(t, { rootUri: "file:///root" });
    await client.initialize();
    expect(t.sent.some((m) => "method" in m && m.method === "initialize" && "id" in m)).toBe(true);
    expect(t.sent.some((m) => "method" in m && m.method === "initialized" && !("id" in m))).toBe(true);
  });

  test("publishDiagnostics notifications reach the onDiagnostics callback", async () => {
    let captured: { uri: string; diagnostics: Diagnostic[] } | undefined;
    const t = new FakeLspTransport();
    new LspClient(t, { rootUri: "file:///root", onDiagnostics: (uri, diagnostics) => (captured = { uri, diagnostics }) });
    t.emit({
      jsonrpc: "2.0",
      method: "textDocument/publishDiagnostics",
      params: { uri: "file:///root/a.c", diagnostics: [{ range: { start: { line: 2, character: 0 }, end: { line: 2, character: 4 } }, severity: 1, message: "boom" }] },
    });
    expect(captured?.uri).toBe("file:///root/a.c");
    expect(captured?.diagnostics[0]!.message).toBe("boom");
  });

  test("hover / definition / references round-trip", async () => {
    const t = new FakeLspTransport((req) => {
      if (req.method === "initialize") return ok(req.id, {});
      if (req.method === "textDocument/hover") return ok(req.id, { contents: { kind: "markdown", value: "int x" } });
      if (req.method === "textDocument/definition") return ok(req.id, { uri: "file:///root/a.c", range: { start: { line: 0, character: 4 }, end: { line: 0, character: 5 } } });
      if (req.method === "textDocument/references") return ok(req.id, [{ uri: "file:///root/a.c", range: { start: { line: 5, character: 2 }, end: { line: 5, character: 3 } } }]);
      return undefined;
    });
    const client = new LspClient(t, { rootUri: "file:///root" });
    await client.initialize();
    expect((await client.hover("file:///root/a.c", { line: 0, character: 4 })) as { contents: { value: string } }).toEqual({
      contents: { kind: "markdown", value: "int x" },
    } as never);
    const def = await client.definition("file:///root/a.c", { line: 0, character: 4 });
    expect(Array.isArray(def) ? def[0]!.uri : def!.uri).toBe("file:///root/a.c");
    const refs = await client.references("file:///root/a.c", { line: 0, character: 4 });
    expect(refs).toHaveLength(1);
  });

  test("a request times out instead of hanging", async () => {
    const t = new FakeLspTransport(() => undefined);
    const client = new LspClient(t, { rootUri: "file:///root", timeoutMs: 20 });
    await expect(client.hover("file:///x", { line: 0, character: 0 })).rejects.toThrow(/timed out/);
  });

  test("a transport close rejects in-flight requests", async () => {
    const t = new FakeLspTransport(() => undefined);
    const client = new LspClient(t, { rootUri: "file:///root", timeoutMs: 5_000 });
    const pending = client.hover("file:///x", { line: 0, character: 0 });
    t.triggerClose("server crashed");
    await expect(pending).rejects.toThrow(/closed/);
  });

  test("answers a server-initiated request with null so the server doesn't stall", () => {
    const t = new FakeLspTransport();
    new LspClient(t, { rootUri: "file:///root" });
    t.emit({ jsonrpc: "2.0", id: 99, method: "workspace/configuration", params: {} });
    const reply = t.sent.find((m) => "id" in m && m.id === 99) as LspResponse | undefined;
    expect(reply).toBeDefined();
    expect(reply!.result).toBeNull();
  });
});
