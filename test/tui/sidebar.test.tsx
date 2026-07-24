import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider, UiProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Sidebar } from "../../src/tui/components/Sidebar.tsx";
import type { UiStore } from "../../src/tui/store.ts";
import type { UiState } from "../../src/tui/types.ts";
import { EMPTY_USAGE } from "../../src/session/types.ts";

function stateWith(context: UiState["context"], changedFiles: string[], over: Partial<UiState> = {}): UiState {
  return {
    session: { id: "s1", title: "t", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } },
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
    changedFiles,
    connectorReady: true,
    modelDisplay: "anthropic/claude-opus-4-8",
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
        <Sidebar />
      </UiProvider>
    </ThemeProvider>,
  );
  return lastFrame() ?? "";
}

describe("Sidebar", () => {
  test("shows Context, percentage, modified files, and stub panels", () => {
    const f = frameOf(stateWith({ tokens: 10, usable: 100, pct: 10 }, ["a.ts", "b.ts"]));
    expect(f).toContain("Context");
    expect(f).toContain("10%");
    expect(f).toContain("Modified Files");
    expect(f).toContain("a.ts");
    expect(f).toContain("b.ts");
    expect(f).toContain("LSP");
    expect(f).toContain("MCP");
  });

  test("hides the Modified Files header when there are none", () => {
    const f = frameOf(stateWith({ tokens: 0, usable: 100, pct: 0 }, []));
    expect(f).not.toContain("Modified Files");
    expect(f).toContain("Context");
    expect(f).toContain("LSP");
  });

  test("MCP panel lists connected servers with tool counts (no more 'later')", () => {
    const f = frameOf(stateWith({ tokens: 0, usable: 100, pct: 0 }, [], {
      mcpServers: [{ name: "calc", transport: "stdio", state: "ready", toolCount: 3 }],
    }));
    expect(f).toContain("calc");
    expect(f).toContain("3");
    expect(f).not.toContain("— later");
  });

  test("LSP panel lists servers and Todo panel lists items", () => {
    const f = frameOf(stateWith({ tokens: 0, usable: 100, pct: 0 }, [], {
      lspServers: [{ language: "typescript", command: "tsserver", state: "ready", openFiles: 1, diagnostics: 2 }],
      lspDiagnostics: { "file:///x.ts": 2 },
      todos: [
        { content: "wire the sidebar", status: "completed" },
        { content: "ship 0.4.1", status: "in_progress" },
      ],
    }));
    expect(f).toContain("typescript");
    expect(f).toContain("2 diag");
    expect(f).toContain("wire the sidebar");
    expect(f).toContain("ship 0.4.1");
    expect(f).toContain("1/2"); // 1 of 2 done
  });
});
