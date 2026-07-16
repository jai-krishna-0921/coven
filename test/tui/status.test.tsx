import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider, UiProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Status } from "../../src/tui/dialogs/Status.tsx";
import type { UiStore } from "../../src/tui/store.ts";
import type { UiState } from "../../src/tui/types.ts";
import type { CommandContext } from "../../src/tui/types.ts";
import type { App } from "../../src/app.ts";
import type { AuthEntry } from "../../src/auth/index.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

// > 20ms so Ink's pending-escape flush fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

const SESSION: SessionInfo = {
  id: "s1",
  title: "My Session",
  agent: "builder",
  model: "anthropic/claude-opus-4-8",
  created: 0,
  updated: 0,
  usage: { ...EMPTY_USAGE },
  cost: 0.02,
};

function stateWith(session: SessionInfo): UiState {
  return {
    session,
    history: [],
    live: null,
    status: "idle",
    compacting: false,
    context: { tokens: 12400, usable: 100000, pct: 12 },
    permission: null,
    modal: null,
    reonboarding: false,
    sidebarOverlay: false,
    scrollOffset: 0,
    toast: null,
    changedFiles: [],
    connectorReady: true,
    modelDisplay: "anthropic/claude-opus-4-8",
    mcpServers: [],
    lspServers: [],
    lspDiagnostics: {},
    todos: [],
  };
}

function fakeStore(state: UiState): UiStore {
  return { subscribe: () => () => {}, getSnapshot: () => state } as unknown as UiStore;
}

const ENTRIES: AuthEntry[] = [{ provider: "anthropic", source: "env", masked: "sk-abcd…wxyz" }];

function makeCtx(app: Partial<App> = {}) {
  const closeModalSpy = mock((): void => {});
  const fullApp = {
    tts: { status: () => "off (backend: spd available)" },
    auth: { entries: () => ENTRIES },
    ...app,
  } as unknown as App;
  const ctx: CommandContext = {
    app: fullApp,
    store: {
      setSessionID: () => {},
      appendSynthetic: () => {},
      replyPermission: () => {},
      openModal: () => {},
      closeModal: () => {},
      toast: () => {},
      setReonboarding: () => {},
      scrollBy: () => {},
    },
    session: SESSION,
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
  return { ctx, closeModalSpy };
}

function renderStatus(ctx: CommandContext, session: SessionInfo = SESSION) {
  return render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <UiProvider store={fakeStore(stateWith(session))}>
        <Status ctx={ctx} />
      </UiProvider>
    </ThemeProvider>,
  );
}

describe("Status", () => {
  test("shows session, agent, model, context pct, cost, tts, and connectors", () => {
    const { ctx } = makeCtx();
    const { lastFrame } = renderStatus(ctx);
    const f = lastFrame() ?? "";
    expect(f).toContain("My Session");
    expect(f).toContain("s1");
    expect(f).toContain("builder");
    expect(f).toContain("claude-opus-4-8");
    expect(f).toContain("12%");
    expect(f).toContain("$0.02");
    expect(f).toContain("off (backend: spd available)");
    expect(f).toContain("anthropic");
  });

  test("degrades when tts/auth are absent", () => {
    const { ctx } = makeCtx({ tts: undefined, auth: undefined });
    const { lastFrame } = renderStatus(ctx);
    const f = lastFrame() ?? "";
    // still renders the core fields without throwing
    expect(f).toContain("builder");
    expect(f).toContain("12%");
  });

  test("esc closes", async () => {
    const { ctx, closeModalSpy } = makeCtx();
    const { stdin } = renderStatus(ctx);
    stdin.write("\x1b");
    await tick();
    expect(closeModalSpy).toHaveBeenCalledTimes(1);
  });
});
