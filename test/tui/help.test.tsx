import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Help } from "../../src/tui/dialogs/Help.tsx";
import type { CommandContext } from "../../src/tui/types.ts";
import type { App } from "../../src/app.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

// > 20ms so Ink's pending-escape flush fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function makeSession(id: string): SessionInfo {
  return { id, title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } };
}

function makeCtx() {
  const closeModalSpy = mock((): void => {});
  const app = {
    agents: {
      primaries: () => [
        { name: "builder", mode: "primary", description: "Builds", prompt: "", permission: [] },
        { name: "researcher", mode: "all", description: "Researches", prompt: "", permission: [] },
      ],
    },
    skills: { all: () => [{ name: "brainstorming", description: "Ideate first", dir: "", content: "" }] },
    commands: undefined,
    store: { create: () => makeSession("x"), get: () => undefined, update: () => {} },
    bus: { publish: () => {} },
    providers: { invalidate: () => {} },
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
    scrollToMessage: () => {},
    },
    session: makeSession("parent1"),
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

function renderHelp(ctx: CommandContext) {
  return render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <Help ctx={ctx} />
    </ThemeProvider>,
  );
}

describe("Help", () => {
  test("lists every category and a default shortcut row", () => {
    const { ctx } = makeCtx();
    const { lastFrame } = renderHelp(ctx);
    const f = lastFrame() ?? "";
    for (const cat of ["Shortcuts", "Commands", "Agents", "Skills", "Permissions", "Getting started"]) {
      expect(f).toContain(cat);
    }
    expect(f).toContain("ctrl+p");
  });

  test("tab switches category and updates the detail pane", async () => {
    const { ctx } = makeCtx();
    const { lastFrame, stdin } = renderHelp(ctx);
    stdin.write("\t"); // Shortcuts → Commands
    await tick();
    const f = lastFrame() ?? "";
    expect(f).toContain("/new"); // a command slash — proves the Commands pane rendered
    expect(f).not.toContain("ctrl+p"); // the Shortcuts detail is gone
  });

  test("right/left arrows switch category; down no longer switches it (it scrolls)", async () => {
    const { ctx } = makeCtx();
    const { lastFrame, stdin } = renderHelp(ctx);
    stdin.write("\x1b[C"); // right: Shortcuts → Commands
    await tick();
    expect(lastFrame() ?? "").toContain("/new");
    stdin.write("\x1b[B"); // down: must NOT advance to Agents
    await tick();
    const f = lastFrame() ?? "";
    expect(f).toContain("/"); // still on the Commands pane
    expect(f).not.toContain("primary · Builds"); // the Agents detail did not appear
    stdin.write("\x1b[D"); // left: back to Shortcuts
    await tick();
    expect(lastFrame() ?? "").toContain("ctrl+p");
  });

  test("typing filters the active pane", async () => {
    const { ctx } = makeCtx();
    const { lastFrame, stdin } = renderHelp(ctx);
    stdin.write("model");
    await tick();
    const f = lastFrame() ?? "";
    expect(f).toContain("Model picker");
    expect(f).not.toContain("Command palette");
  });

  test("Esc closes the dialog", async () => {
    const { ctx, closeModalSpy } = makeCtx();
    const { stdin } = renderHelp(ctx);
    stdin.write("\x1b");
    await tick();
    expect(closeModalSpy).toHaveBeenCalledTimes(1);
  });
});
