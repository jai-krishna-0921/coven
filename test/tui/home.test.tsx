import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider, UiProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Home } from "../../src/tui/components/Home.tsx";
import { Banner } from "../../src/tui/components/Banner.tsx";
import type { UiStore } from "../../src/tui/store.ts";
import type { UiState } from "../../src/tui/types.ts";
import { EMPTY_USAGE } from "../../src/session/types.ts";

function emptyState(): UiState {
  return {
    session: { id: "s1", title: "New session", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } },
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
  return { subscribe: () => () => {}, getSnapshot: () => state } as unknown as UiStore;
}

describe("Home", () => {
  test("renders the logo, example prompt, agent · model line, and command hint", () => {
    const { lastFrame } = render(
      <ThemeProvider prefs={{ ...DEFAULT_PREFS, logo: "ascii" }}>
        <UiProvider store={fakeStore(emptyState())}>
          <Home />
        </UiProvider>
      </ThemeProvider>,
    );
    const f = lastFrame() ?? "";
    expect(f).toContain("c o v e n");
    expect(f).toContain("Ask anything");
    expect(f).toContain("builder");
    expect(f).toContain("claude-opus-4-8");
    expect(f).toContain("ctrl+p commands");
  });
});

describe("Banner", () => {
  test("renders its text", () => {
    const { lastFrame } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <Banner text="no key" kind="warn" />
      </ThemeProvider>,
    );
    expect(lastFrame() ?? "").toContain("no key");
  });
});
