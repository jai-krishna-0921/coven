import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Sessions } from "../../src/tui/dialogs/Sessions.tsx";
import type { CommandContext } from "../../src/tui/types.ts";
import type { App } from "../../src/app.ts";
import { EMPTY_USAGE, type Message, type SessionInfo } from "../../src/session/types.ts";

// > 20ms so Ink's pending-escape flush fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function makeSession(id: string, over: Partial<SessionInfo> = {}): SessionInfo {
  return { id, title: id, agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE }, ...over };
}

const SESSIONS: SessionInfo[] = [
  makeSession("s1", { title: "First", agent: "builder", updated: 200 }),
  makeSession("s2", { title: "Second", agent: "researcher", updated: 100 }),
];

const MESSAGES: Record<string, Message[]> = {
  s1: [1, 2, 3].map((n) => ({ id: `m${n}`, sessionID: "s1", role: "user", agent: "builder", parts: [], time: 0 })),
  s2: [],
};

function makeCtx() {
  const setSessionIDSpy = mock((_id: string): void => {});
  const closeModalSpy = mock((): void => {});
  const app = {
    store: {
      list: () => SESSIONS,
      messagesOf: (id: string) => MESSAGES[id] ?? [],
      get: () => undefined,
      update: () => {},
    },
    bus: { publish: () => {} },
  } as unknown as App;

  const ctx: CommandContext = {
    app,
    store: {
      setSessionID: setSessionIDSpy,
      appendSynthetic: () => {},
      replyPermission: () => {},
      openModal: () => {},
      closeModal: () => {},
      toast: () => {},
      setReonboarding: () => {},
      scrollBy: () => {},
    },
    session: makeSession("s1"),
    abort: new AbortController().signal,
    host: { redraw() {}, openEditor: async () => {}, attachFile() {}, exportTranscript: async () => {}, interrupt() {}, quit() {} },
    send: async () => {},
    gateShell: async () => true,
    openModal: () => {},
    closeModal: closeModalSpy,
    toast: () => {},
    prefs: { ...DEFAULT_PREFS },
    setPrefs: () => {},
  };
  return { ctx, setSessionIDSpy, closeModalSpy };
}

function renderSessions(ctx: CommandContext) {
  return render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <Sessions ctx={ctx} />
    </ThemeProvider>,
  );
}

describe("Sessions", () => {
  test("lists title, agent, and message counts", () => {
    const { ctx } = makeCtx();
    const { lastFrame } = renderSessions(ctx);
    const f = lastFrame() ?? "";
    expect(f).toContain("First");
    expect(f).toContain("builder");
    expect(f).toContain("3 msgs");
    expect(f).toContain("Second");
    expect(f).toContain("researcher");
  });

  test("Enter switches to the highlighted session and closes", async () => {
    const { ctx, setSessionIDSpy, closeModalSpy } = makeCtx();
    const { stdin } = renderSessions(ctx);
    stdin.write("\r");
    await tick();
    expect(setSessionIDSpy).toHaveBeenCalledWith("s1");
    expect(closeModalSpy).toHaveBeenCalledTimes(1);
  });
});
