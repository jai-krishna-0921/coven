import { describe, expect, mock, test } from "bun:test";
import { PassThrough, Writable } from "node:stream";
import { Bus } from "../../src/bus/index.ts";
import { runFallbackRepl } from "../../src/tui/fallback.ts";
import { EMPTY_USAGE, type Message, type SessionInfo } from "../../src/session/types.ts";
import type { App } from "../../src/app.ts";

function capture(): { stream: Writable; text(): string } {
  let buffer = "";
  const stream = new Writable({
    write(chunk, _enc, cb) {
      buffer += chunk.toString();
      cb();
    },
  });
  return { stream, text: () => buffer };
}

describe("runFallbackRepl", () => {
  test("streams a prompt turn and answers a mid-run permission ask", async () => {
    const bus = new Bus();
    const session: SessionInfo = {
      id: "s1",
      title: "New session",
      agent: "builder",
      created: 0,
      updated: 0,
      usage: { ...EMPTY_USAGE },
    };
    const pending = new Set<string>();
    let resolveReply: (() => void) | undefined;

    const replyMock = mock((id: string, _reply: string, _feedback?: string) => {
      pending.delete(id);
      resolveReply?.();
    });

    const promptMock = mock(async (sid: string, _text: string): Promise<Message> => {
      const request = { id: "perm1", sessionID: sid, permission: "bash", patterns: ["ls"], title: "run ls", metadata: {} };
      pending.add(request.id);
      await new Promise<void>((resolve) => {
        resolveReply = resolve;
        bus.publish({ type: "permission.asked", request });
      });
      return { id: "a1", sessionID: sid, role: "assistant", agent: "builder", parts: [{ id: "p", type: "text", text: "done" }], time: 0 };
    });

    const app = {
      loaded: { root: process.cwd(), config: { default_agent: "builder" } },
      bus,
      store: { create: () => session, appendMessage: () => {}, messagesOf: (): Message[] => [] },
      engine: { prompt: promptMock, contextInfo: () => ({ tokens: 0, usable: 100, pct: 0 }) },
      permissions: {
        ask: async () => {},
        reply: replyMock,
        pendingRequests: () => [...pending].map((id) => ({ id, sessionID: session.id, permission: "bash", patterns: ["ls"], title: "run ls" })),
      },
      agents: { get: () => ({ name: "builder", mode: "primary", permission: [] }), primaries: () => [] },
      commands: { get: () => undefined, all: () => [] },
    } as unknown as App;

    const input = new PassThrough();
    const out = capture();
    const done = runFallbackRepl(app, { input, output: out.stream });
    input.write("hello\n");
    input.write("y\n");
    input.write("/exit\n");
    input.end();
    await done;

    expect(promptMock).toHaveBeenCalled();
    expect(promptMock.mock.calls[0]?.[1]).toBe("hello");
    expect(replyMock).toHaveBeenCalled();
    expect(replyMock.mock.calls[0]?.[0]).toBe("perm1");
    expect(replyMock.mock.calls[0]?.[1]).toBe("once");
  });

  test("auto-rejects a permission when stdin is already closed", async () => {
    const bus = new Bus();
    const session: SessionInfo = {
      id: "s1",
      title: "New session",
      agent: "builder",
      created: 0,
      updated: 0,
      usage: { ...EMPTY_USAGE },
    };
    const pending = new Set<string>(["perm1"]);
    const replyMock = mock((id: string, _reply: string, _feedback?: string) => {
      pending.delete(id);
    });

    const promptMock = mock(async (sid: string, _text: string): Promise<Message> => {
      const request = { id: "perm1", sessionID: sid, permission: "bash", patterns: ["ls"], title: "run ls", metadata: {} };
      bus.publish({ type: "permission.asked", request });
      // Give the fallback a tick to observe the closed stdin and auto-reject.
      await new Promise((resolve) => setTimeout(resolve, 5));
      return { id: "a1", sessionID: sid, role: "assistant", agent: "builder", parts: [{ id: "p", type: "text", text: "done" }], time: 0 };
    });

    const app = {
      loaded: { root: process.cwd(), config: { default_agent: "builder" } },
      bus,
      store: { create: () => session, appendMessage: () => {}, messagesOf: (): Message[] => [] },
      engine: { prompt: promptMock, contextInfo: () => ({ tokens: 0, usable: 100, pct: 0 }) },
      permissions: {
        ask: async () => {},
        reply: replyMock,
        pendingRequests: () => [...pending].map((id) => ({ id, sessionID: session.id, permission: "bash", patterns: ["ls"], title: "run ls" })),
      },
      agents: { get: () => ({ name: "builder", mode: "primary", permission: [] }), primaries: () => [] },
      commands: { get: () => undefined, all: () => [] },
    } as unknown as App;

    const input = new PassThrough();
    const out = capture();
    input.write("hello\n");
    input.end(); // stdin closes before the mid-run ask — no interactive reply possible
    await runFallbackRepl(app, { input, output: out.stream });

    expect(replyMock).toHaveBeenCalled();
    expect(replyMock.mock.calls[0]?.[0]).toBe("perm1");
    expect(replyMock.mock.calls[0]?.[1]).toBe("reject");
  });
});
