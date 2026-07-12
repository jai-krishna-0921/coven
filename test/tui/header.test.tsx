import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider, UiProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Header } from "../../src/tui/components/Header.tsx";
import type { UiStore } from "../../src/tui/store.ts";
import type { UiState } from "../../src/tui/types.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

function stateWith(session: SessionInfo): UiState {
  return {
    session,
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
    modelDisplay: session.model ?? "default",
  };
}

function fakeStore(state: UiState): UiStore {
  return { subscribe: () => () => {}, getSnapshot: () => state } as unknown as UiStore;
}

function frameOf(session: SessionInfo): string {
  const { lastFrame } = render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <UiProvider store={fakeStore(stateWith(session))}>
        <Header />
      </UiProvider>
    </ThemeProvider>,
  );
  return lastFrame() ?? "";
}

describe("Header", () => {
  test("renders wordmark, short model, agent, and title", () => {
    const f = frameOf({
      id: "s1",
      title: "T",
      agent: "builder",
      model: "anthropic/claude-opus-4-8",
      created: 0,
      updated: 0,
      usage: { ...EMPTY_USAGE },
    });
    expect(f).toContain("coven");
    expect(f).toContain("builder");
    expect(f).toContain("claude-opus-4-8");
    expect(f).not.toContain("anthropic/claude-opus-4-8");
    expect(f).toContain("T");
  });

  test("falls back to a default model label when none is set", () => {
    const f = frameOf({
      id: "s1",
      title: "Untitled",
      agent: "researcher",
      created: 0,
      updated: 0,
      usage: { ...EMPTY_USAGE },
    });
    expect(f).toContain("coven");
    expect(f).toContain("researcher");
    expect(f).toContain("default");
  });
});
