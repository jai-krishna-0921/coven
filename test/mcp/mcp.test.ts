import { describe, expect, test } from "bun:test";
import { McpClient } from "../../src/mcp/client.ts";
import { bridgeTool } from "../../src/mcp/index.ts";
import type { Transport } from "../../src/mcp/transport.ts";
import type { JsonRpcMessage, JsonRpcRequest, JsonRpcResponse } from "../../src/mcp/types.ts";
import type { ToolContext } from "../../src/tool/types.ts";

/** In-memory transport that auto-answers requests via a supplied responder. */
class FakeTransport implements Transport {
  sent: JsonRpcMessage[] = [];
  private handler: (m: JsonRpcMessage) => void = () => {};
  private closeHandler: (r?: string) => void = () => {};
  constructor(private responder?: (req: JsonRpcRequest) => JsonRpcResponse | undefined) {}
  async start(): Promise<void> {}
  send(msg: JsonRpcMessage): void {
    this.sent.push(msg);
    if ("id" in msg && this.responder) {
      const res = this.responder(msg as JsonRpcRequest);
      if (res) queueMicrotask(() => this.handler(res));
    }
  }
  onMessage(h: (m: JsonRpcMessage) => void): void {
    this.handler = h;
  }
  onClose(h: (r?: string) => void): void {
    this.closeHandler = h;
  }
  async close(): Promise<void> {}
  triggerClose(reason?: string): void {
    this.closeHandler(reason);
  }
}

const ok = (id: JsonRpcResponse["id"], result: unknown): JsonRpcResponse => ({ jsonrpc: "2.0", id, result });

function fakeCtx(): ToolContext {
  return {
    sessionID: "s",
    messageID: "m",
    callID: "c",
    agent: "builder",
    root: "/tmp",
    abort: new AbortController().signal,
    messages: [],
    ask: async () => {},
    progress: () => {},
  };
}

describe("McpClient", () => {
  test("connect performs the initialize handshake then notifies initialized", async () => {
    const t = new FakeTransport((req) => (req.method === "initialize" ? ok(req.id, { protocolVersion: "x" }) : undefined));
    const client = new McpClient(t);
    await client.connect();
    expect(t.sent.some((m) => "method" in m && m.method === "initialize")).toBe(true);
    expect(t.sent.some((m) => "method" in m && m.method === "notifications/initialized" && !("id" in m))).toBe(true);
  });

  test("listTools and callTool round-trip", async () => {
    const t = new FakeTransport((req) => {
      if (req.method === "initialize") return ok(req.id, {});
      if (req.method === "tools/list") return ok(req.id, { tools: [{ name: "echo", inputSchema: { type: "object" } }] });
      if (req.method === "tools/call") return ok(req.id, { content: [{ type: "text", text: "pong" }] });
      return undefined;
    });
    const client = new McpClient(t);
    await client.connect();
    const tools = await client.listTools();
    expect(tools).toHaveLength(1);
    expect(tools[0]!.name).toBe("echo");
    const result = await client.callTool("echo", { x: 1 });
    expect(result.content[0]!.text).toBe("pong");
  });

  test("a request times out instead of hanging forever", async () => {
    const t = new FakeTransport(() => undefined); // never responds
    const client = new McpClient(t, 20);
    await expect(client.listTools()).rejects.toThrow(/timed out/);
  });

  test("a transport close rejects every in-flight request", async () => {
    const t = new FakeTransport(() => undefined);
    const client = new McpClient(t, 5_000);
    const pending = client.listTools();
    t.triggerClose("server died");
    await expect(pending).rejects.toThrow(/closed/);
  });
});

describe("bridgeTool", () => {
  test("namespaces the id, uses the MCP inputSchema, and flattens text content", async () => {
    const t = new FakeTransport((req) => {
      if (req.method === "tools/call") return ok(req.id, { content: [{ type: "text", text: "line1" }, { type: "text", text: "line2" }] });
      return undefined;
    });
    const client = new McpClient(t);
    const schema = { type: "object", properties: { path: { type: "string" } } };
    const tool = bridgeTool("fs.local", { name: "read-file", inputSchema: schema }, client);
    expect(tool.id).toBe("mcp__fs_local__read_file");
    expect(tool.jsonSchema).toEqual(schema);
    const result = await tool.execute({ path: "x" } as never, fakeCtx());
    expect(result.output).toBe("line1\nline2");
    expect(result.metadata?.isError).toBe(false);
  });

  test("a failing MCP call surfaces as error output, not a thrown turn-killer", async () => {
    const t = new FakeTransport(() => undefined);
    const client = new McpClient(t, 15);
    const tool = bridgeTool("srv", { name: "boom", inputSchema: { type: "object" } }, client);
    const result = await tool.execute({} as never, fakeCtx());
    expect(result.metadata?.isError).toBe(true);
    expect(result.output).toContain("MCP call failed");
  });

  test("execute gates on the mcp permission", async () => {
    const t = new FakeTransport((req) => (req.method === "tools/call" ? ok(req.id, { content: [] }) : undefined));
    const client = new McpClient(t);
    const tool = bridgeTool("srv", { name: "act", inputSchema: { type: "object" } }, client);
    let asked: string | undefined;
    const ctx = { ...fakeCtx(), ask: async (input: { permission: string; patterns: string[] }) => {
      asked = `${input.permission}:${input.patterns[0]}`;
    } } as ToolContext;
    await tool.execute({} as never, ctx);
    expect(asked).toBe("mcp:srv/act");
  });
});
