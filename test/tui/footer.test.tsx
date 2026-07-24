import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider, UiProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Footer, pctColor } from "../../src/tui/components/Footer.tsx";
import { THEMES } from "../../src/tui/theme.ts";
import type { UiStore } from "../../src/tui/store.ts";
import type { UiState } from "../../src/tui/types.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

const theme = THEMES["coven-dark"];

function stateWith(session: SessionInfo, context: UiState["context"], over: Partial<UiState> = {}): UiState {
  return {
    session,
    history: [],
    live: null,
    status: "idle",
    compacting: false,
    context,
    permission: null,
    question: null,
    modal: null,
    reonboarding: false,
    sidebarOverlay: false,
    scrollOffset: 0,
    toast: null,
    changedFiles: [],
    connectorReady: true,
    modelDisplay: session.model ?? "default",
    mcpServers: [],
    lspServers: [],
    lspDiagnostics: {},
    todos: [],
    ...over,
  };
}

function fakeStore(state: UiState): UiStore {
  return { subscribe: () => () => {}, getSnapshot: () => state } as unknown as UiStore;
}

function frameOf(state: UiState): string {
  const { lastFrame } = render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <UiProvider store={fakeStore(state)}>
        <Footer />
      </UiProvider>
    </ThemeProvider>,
  );
  return lastFrame() ?? "";
}

describe("pctColor", () => {
  test(">= 95 is the error token", () => {
    expect(pctColor(97, theme)).toBe(theme.error);
    expect(pctColor(95, theme)).toBe(theme.error);
  });
  test(">= 80 is the warning token", () => {
    expect(pctColor(85, theme)).toBe(theme.warning);
    expect(pctColor(80, theme)).toBe(theme.warning);
  });
  test("below 80 is the muted token", () => {
    expect(pctColor(12, theme)).toBe(theme.fgMuted);
    expect(pctColor(0, theme)).toBe(theme.fgMuted);
  });
});

describe("Footer", () => {
  test("shows help, context pct, cost, diagnostics, and short model", () => {
    const f = frameOf(
      stateWith(
        {
          id: "s1",
          title: "T",
          agent: "builder",
          model: "anthropic/claude-opus-4-8",
          created: 0,
          updated: 0,
          usage: { ...EMPTY_USAGE },
          cost: 0.02,
        },
        { tokens: 12400, usable: 100000, pct: 12 },
      ),
    );
    expect(f).toContain("help");
    expect(f).toContain("12%");
    expect(f).toContain("$0.02");
    expect(f).toContain("no diagnostics");
    expect(f).toContain("claude-opus-4-8");
  });

  test("cost defaults to $0.00 when unset", () => {
    const f = frameOf(
      stateWith(
        { id: "s1", title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } },
        { tokens: 0, usable: 100, pct: 0 },
      ),
    );
    expect(f).toContain("$0.00");
  });

  test("diagnostics count replaces the 'no diagnostics' label when > 0", () => {
    const f = frameOf(
      stateWith(
        { id: "s1", title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } },
        { tokens: 0, usable: 100, pct: 0 },
        { lspDiagnostics: { "file:///a.ts": 3, "file:///b.ts": 1 } },
      ),
    );
    expect(f).toContain("4 diag");
    expect(f).not.toContain("no diagnostics");
  });
});
