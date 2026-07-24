import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { Box } from "ink";
import { ThemeProvider, UiProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { ModalLayer } from "../../src/tui/dialogs/ModalLayer.tsx";
import type { UiStore } from "../../src/tui/store.ts";
import type { UiState, CommandContext } from "../../src/tui/types.ts";
import type { App } from "../../src/app.ts";
import type { PermissionRequest } from "../../src/permission/types.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

function makeSession(): SessionInfo {
  return { id: "s1", title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } };
}

function baseState(): UiState {
  return {
    session: makeSession(),
    history: [],
    live: null,
    status: "idle",
    compacting: false,
    context: { tokens: 0, usable: 100, pct: 0 },
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
  return { subscribe: () => () => {}, getSnapshot: () => state, replyPermission: () => {} } as unknown as UiStore;
}

function makeCtx(): CommandContext {
  const app = { agents: { primaries: () => [] } } as unknown as App;
  return {
    app,
    store: {
      setSessionID: () => {},
      appendSynthetic: () => {},
      replyPermission: () => {},
      openModal: () => {},
      closeModal: () => {},
      toast: () => {},
      setReonboarding: () => {},
      scrollBy: () => {},
    scrollToMessage: () => {},
    },
    session: makeSession(),
    abort: new AbortController().signal,
    host: { redraw() {}, openEditor: async () => {}, attachFile() {}, exportTranscript: async () => {}, interrupt() {}, quit() {} },
    send: async () => {},
    gateShell: async () => true,
    openModal: () => {},
    closeModal: mock(() => {}),
    toast: () => {},
    prefs: { ...DEFAULT_PREFS },
    setPrefs: () => {},
  };
}

function renderLayer(overrides: Partial<UiState>) {
  const state = { ...baseState(), ...overrides };
  // The real App mounts ModalLayer inside a full-screen root; give the test a
  // sized container so the absolutely-positioned, height:100% overlay has bounds.
  const { lastFrame } = render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <UiProvider store={fakeStore(state)}>
        <Box width={100} height={24}>
          <ModalLayer ctx={makeCtx()} />
        </Box>
      </UiProvider>
    </ThemeProvider>,
  );
  return lastFrame() ?? "";
}

const REQ: PermissionRequest = {
  id: "p1",
  sessionID: "s1",
  permission: "bash",
  patterns: ["git push"],
  title: "run git push",
  metadata: {},
};

describe("ModalLayer", () => {
  test("renders the Palette when modal.kind is palette", () => {
    expect(renderLayer({ modal: { kind: "palette" } })).toContain("Commands");
  });

  test("renders the Themes dialog when modal.kind is themes", () => {
    const f = renderLayer({ modal: { kind: "themes" } });
    expect(f).toContain("Themes");
    expect(f).toContain("Dracula"); // a theme label unique to the Themes dialog
  });

  test("permission takes precedence over any open modal", () => {
    const f = renderLayer({ permission: REQ, modal: { kind: "palette" } });
    expect(f).toContain("Permission required");
    expect(f).toContain("[y]es");
    expect(f).not.toContain("Commands"); // the palette is suppressed
  });

  test("renders nothing when neither a modal nor a permission is active", () => {
    expect(renderLayer({ modal: null, permission: null }).trim()).toBe("");
  });
});
