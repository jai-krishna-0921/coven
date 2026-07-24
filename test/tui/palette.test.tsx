import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Palette } from "../../src/tui/dialogs/Palette.tsx";
import type { CommandContext } from "../../src/tui/types.ts";
import type { App } from "../../src/app.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

// > 20ms so Ink's pending-escape flush fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function makeSession(id: string, over: Partial<SessionInfo> = {}): SessionInfo {
  return { id, title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE }, ...over };
}

function makeCtx() {
  const createSpy = mock((input: { agent: string; title?: string }): SessionInfo =>
    makeSession("sess-new", { agent: input.agent, title: input.title }));
  const setSessionIDSpy = mock((_id: string): void => {});
  const closeModalSpy = mock((): void => {});

  const app = {
    store: { create: createSpy, get: () => undefined, update: () => {} },
    commands: undefined,
    bus: { publish: () => {} },
    providers: { invalidate: () => {} },
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
    scrollToMessage: () => {},
    replyQuestion: () => {},
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

  return { ctx, createSpy, setSessionIDSpy, closeModalSpy };
}

function renderPalette(ctx: CommandContext) {
  return render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <Palette ctx={ctx} />
    </ThemeProvider>,
  );
}

describe("Palette", () => {
  test("renders categories and command titles", () => {
    const { ctx } = makeCtx();
    const { lastFrame } = renderPalette(ctx);
    const f = lastFrame() ?? "";
    expect(f).toContain("Command palette");
    expect(f).toContain("System");
    expect(f).toContain("New session");
  });

  test("typing narrows the list to New session", async () => {
    const { ctx } = makeCtx();
    const { lastFrame, stdin } = renderPalette(ctx);
    stdin.write("new");
    await tick();
    const f = lastFrame() ?? "";
    expect(f).toContain("New session");
    expect(f).not.toContain("Command palette");
  });

  test("Enter runs the highlighted item and closes the modal", async () => {
    const { ctx, createSpy, setSessionIDSpy, closeModalSpy } = makeCtx();
    const { stdin } = renderPalette(ctx);
    stdin.write("new");
    await tick();
    stdin.write("\r");
    await tick();
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(setSessionIDSpy).toHaveBeenCalledWith("sess-new");
    expect(closeModalSpy).toHaveBeenCalledTimes(1);
  });
});
