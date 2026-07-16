import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider, UiProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Permission } from "../../src/tui/dialogs/Permission.tsx";
import type { UiStore } from "../../src/tui/store.ts";
import type { UiState } from "../../src/tui/types.ts";
import type { PermissionRequest } from "../../src/permission/types.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

// > 20ms so Ink's pending-escape flush fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function makeSession(): SessionInfo {
  return { id: "s1", title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } };
}

function stateWith(permission: PermissionRequest | null): UiState {
  return {
    session: makeSession(),
    history: [],
    live: null,
    status: "busy",
    compacting: false,
    context: { tokens: 0, usable: 100, pct: 0 },
    permission,
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

type ReplySpy = ReturnType<typeof mock<(reply: "once" | "always" | "reject", feedback?: string) => void>>;

function fakeStore(state: UiState, reply: ReplySpy): UiStore {
  return { subscribe: () => () => {}, getSnapshot: () => state, replyPermission: reply } as unknown as UiStore;
}

function renderPermission(permission: PermissionRequest | null) {
  const reply: ReplySpy = mock((_reply: "once" | "always" | "reject", _feedback?: string) => {});
  const r = render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <UiProvider store={fakeStore(stateWith(permission), reply)}>
        <Permission />
      </UiProvider>
    </ThemeProvider>,
  );
  return { ...r, reply };
}

const REQ: PermissionRequest = {
  id: "p1",
  sessionID: "s1",
  permission: "bash",
  patterns: ["git push"],
  title: "run git push",
  metadata: {},
};

describe("Permission", () => {
  test("renders the permission kind, patterns, title, and the y/a/n row", () => {
    const { lastFrame } = renderPermission(REQ);
    const f = lastFrame() ?? "";
    expect(f).toContain("bash");
    expect(f).toContain("git push");
    expect(f).toContain("run git push");
    expect(f).toContain("[y]es");
    expect(f).toContain("[a]lways");
    expect(f).toContain("[n]o");
  });

  test("y replies once", async () => {
    const { stdin, reply } = renderPermission(REQ);
    stdin.write("y");
    await tick();
    expect(reply).toHaveBeenCalledWith("once");
  });

  test("a replies always", async () => {
    const { stdin, reply } = renderPermission(REQ);
    stdin.write("a");
    await tick();
    expect(reply).toHaveBeenCalledWith("always");
  });

  test("n prompts for feedback, then Enter rejects with the feedback", async () => {
    const { stdin, reply, lastFrame } = renderPermission(REQ);
    stdin.write("n");
    await tick();
    expect(reply).not.toHaveBeenCalled(); // not yet — feedback prompt first
    stdin.write("too risky");
    await tick();
    expect(lastFrame() ?? "").toContain("too risky");
    stdin.write("\r");
    await tick();
    expect(reply).toHaveBeenCalledWith("reject", "too risky");
  });

  test("metadata.dangerous renders a DANGEROUS banner", () => {
    const { lastFrame } = renderPermission({ ...REQ, metadata: { dangerous: true } });
    expect(lastFrame() ?? "").toContain("DANGEROUS");
  });

  test("renders nothing when there is no pending permission", () => {
    const { lastFrame } = renderPermission(null);
    expect((lastFrame() ?? "").trim()).toBe("");
  });
});
