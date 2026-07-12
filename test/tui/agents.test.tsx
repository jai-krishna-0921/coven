import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Agents } from "../../src/tui/dialogs/Agents.tsx";
import type { CommandContext } from "../../src/tui/types.ts";
import type { App } from "../../src/app.ts";
import type { AgentInfo } from "../../src/agent/types.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

// > 20ms so Ink's pending-escape flush fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function makeSession(id: string): SessionInfo {
  return { id, title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } };
}

const PRIMARIES: AgentInfo[] = [
  { name: "builder", mode: "primary", description: "Builds features", prompt: "", permission: [] },
  { name: "researcher", mode: "all", description: "Recon", prompt: "", permission: [] },
];

function makeCtx() {
  const setAgentSpy = mock((_id: string, _name: string): SessionInfo => makeSession("sess1"));
  const closeModalSpy = mock((): void => {});

  const app = {
    engine: { setAgent: setAgentSpy },
    agents: { primaries: () => PRIMARIES },
    bus: { publish: () => {} },
  } as unknown as App;

  const ctx: CommandContext = {
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
    },
    session: makeSession("sess1"),
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
  return { ctx, setAgentSpy, closeModalSpy };
}

function renderAgents(ctx: CommandContext) {
  return render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <Agents ctx={ctx} />
    </ThemeProvider>,
  );
}

describe("Agents", () => {
  test("lists name, mode, and description", () => {
    const { ctx } = makeCtx();
    const { lastFrame } = renderAgents(ctx);
    const f = lastFrame() ?? "";
    expect(f).toContain("builder");
    expect(f).toContain("primary");
    expect(f).toContain("Builds features");
    expect(f).toContain("researcher");
  });

  test("Enter switches the driving agent and closes", async () => {
    const { ctx, setAgentSpy, closeModalSpy } = makeCtx();
    const { stdin } = renderAgents(ctx);
    stdin.write("\r");
    await tick();
    expect(setAgentSpy).toHaveBeenCalledWith("sess1", "builder");
    expect(closeModalSpy).toHaveBeenCalledTimes(1);
  });
});
