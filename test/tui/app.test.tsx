import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { App, ctrlCAction } from "../../src/tui/app.tsx";
import { DEFAULT_PREFS, savePrefs } from "../../src/tui/prefs.ts";
import { Bus } from "../../src/bus/index.ts";
import { EMPTY_USAGE, type Message, type SessionInfo } from "../../src/session/types.ts";
import type { App as CovenApp } from "../../src/app.ts";

const tick = (ms = 25): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function makeFakeApp() {
  const bus = new Bus();
  const sessions = new Map<string, SessionInfo>();
  const messages = new Map<string, Message[]>();
  let counter = 0;

  const promptMock = mock(
    async (sid: string, _text: string): Promise<Message> => ({
      id: "a" + counter,
      sessionID: sid,
      role: "assistant",
      agent: "builder",
      parts: [{ id: "p", type: "text", text: "ok" }],
      time: 0,
    }),
  );

  const app = {
    loaded: { root: process.cwd(), config: { model: "anthropic/claude-x", default_agent: "builder" } },
    bus,
    store: {
      create: (input: { agent: string; title?: string; parentID?: string }): SessionInfo => {
        const id = "s" + counter++;
        const session: SessionInfo = {
          id,
          title: input.title ?? "New session",
          agent: input.agent,
          created: 0,
          updated: 0,
          usage: { ...EMPTY_USAGE },
        };
        sessions.set(id, session);
        messages.set(id, []);
        return session;
      },
      get: (id: string) => sessions.get(id),
      messagesOf: (id: string) => messages.get(id) ?? [],
      update: (session: SessionInfo) => {
        sessions.set(session.id, session);
      },
      appendMessage: (message: Message) => {
        const list = messages.get(message.sessionID) ?? [];
        list.push(message);
        messages.set(message.sessionID, list);
      },
      list: () => [...sessions.values()],
    },
    engine: {
      contextInfo: () => ({ tokens: 0, usable: 100, pct: 0 }),
      prompt: promptMock,
      compact: async () => ({ status: "nothing" as const }),
      setModel: (id: string) => sessions.get(id),
      setAgent: (id: string) => sessions.get(id),
    },
    permissions: { ask: async () => {}, reply: () => {}, pendingRequests: () => [] },
    agents: {
      get: (name: string) => ({ name, mode: "primary" as const, description: "", permission: [] }),
      primaries: () => [
        { name: "builder", mode: "primary" as const, description: "", permission: [] },
        { name: "researcher", mode: "primary" as const, description: "", permission: [] },
      ],
    },
    skills: { all: () => [] },
    auth: { resolveKey: () => undefined },
    commands: { all: () => [] },
    providers: { invalidate: () => {} },
  } as unknown as CovenApp;

  return { app, promptMock };
}

describe("ctrlCAction", () => {
  test("busy turn → interrupt", () => {
    expect(ctrlCAction({ busy: true, bufferEmpty: true, now: 1000, lastCtrlCAt: 0 })).toBe("interrupt");
  });
  test("non-empty buffer → clear", () => {
    expect(ctrlCAction({ busy: false, bufferEmpty: false, now: 1000, lastCtrlCAt: 0 })).toBe("clear");
  });
  test("second press within 1.5s → quit", () => {
    expect(ctrlCAction({ busy: false, bufferEmpty: true, now: 1200, lastCtrlCAt: 500 })).toBe("quit");
  });
  test("first press (idle, empty) → warn", () => {
    expect(ctrlCAction({ busy: false, bufferEmpty: true, now: 9000, lastCtrlCAt: 0 })).toBe("warn");
  });
});

describe("App", () => {
  let home: string;
  let realHome: string | undefined;

  beforeEach(() => {
    realHome = process.env.HOME;
    home = mkdtempSync(join(tmpdir(), "coven-app-"));
    process.env.HOME = home;
    savePrefs({ ...DEFAULT_PREFS, onboarded: true });
  });

  afterEach(() => {
    if (realHome === undefined) delete process.env.HOME;
    else process.env.HOME = realHome;
    rmSync(home, { recursive: true, force: true });
  });

  test("renders the Home splash for an empty session", async () => {
    const { app } = makeFakeApp();
    const { lastFrame, unmount } = render(<App app={app} />);
    await tick();
    expect(lastFrame() ?? "").toContain("Ask anything");
    unmount();
  });

  test("ctrl+p opens the command palette; esc closes it", async () => {
    const { app } = makeFakeApp();
    const { lastFrame, stdin, unmount } = render(<App app={app} />);
    await tick();
    stdin.write("\x10"); // ctrl+p
    await tick();
    expect(lastFrame() ?? "").toContain("Commands");
    stdin.write("\x1b"); // esc
    await tick();
    expect(lastFrame() ?? "").not.toContain("Commands");
    unmount();
  });

  test("typing a prompt and pressing enter calls engine.prompt", async () => {
    const { app, promptMock } = makeFakeApp();
    const { stdin, unmount } = render(<App app={app} />);
    await tick();
    stdin.write("hello");
    await tick();
    stdin.write("\r"); // enter
    await tick();
    expect(promptMock).toHaveBeenCalled();
    expect(promptMock.mock.calls[0]?.[1]).toBe("hello");
    unmount();
  });
});
