import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Models } from "../../src/tui/dialogs/Models.tsx";
import type { CommandContext } from "../../src/tui/types.ts";
import type { App, CatalogModelLike } from "../../src/app.ts";
import type { UiPrefs } from "../../src/tui/prefs.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

// > 20ms so Ink's pending-escape flush fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function makeSession(id: string): SessionInfo {
  return { id, title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } };
}

const mdl = (providerID: string, modelID: string, name: string, ctxLimit: number, input: number, output: number): CatalogModelLike => ({
  providerID,
  modelID,
  name,
  contextLimit: ctxLimit,
  outputLimit: 32000,
  cost: { input, output, cacheRead: 0, cacheWrite: 0 },
});

const CATALOG: CatalogModelLike[] = [
  mdl("anthropic", "claude-opus-4-8", "Claude Opus 4.8", 200000, 15, 75),
  mdl("anthropic", "claude-haiku", "Claude Haiku", 200000, 1, 5),
  mdl("openai", "gpt-5", "GPT-5", 128000, 3, 12),
  mdl("openai", "gpt-5-mini", "GPT-5 mini", 128000, 1, 4),
];

function makeCtx(prefs: UiPrefs = { ...DEFAULT_PREFS }) {
  const setModelSpy = mock((_id: string, _ref: string): SessionInfo => makeSession("sess1"));
  const setPrefsSpy = mock((_patch: Partial<UiPrefs>): void => {});
  const closeModalSpy = mock((): void => {});

  const app = {
    engine: { setModel: setModelSpy },
    catalog: {
      list: () => CATALOG,
      get: () => CATALOG[0],
      providers: () => [
        { id: "anthropic", name: "Anthropic", env: ["ANTHROPIC_API_KEY"] },
        { id: "openai", name: "OpenAI", env: ["OPENAI_API_KEY"] },
      ],
    },
    auth: { resolveKey: (provider: string) => (provider === "anthropic" ? { key: "sk-x", source: "env" as const } : undefined) },
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
    prefs,
    setPrefs: setPrefsSpy,
  };
  return { ctx, setModelSpy, setPrefsSpy, closeModalSpy };
}

function renderModels(ctx: CommandContext) {
  return render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <Models ctx={ctx} />
    </ThemeProvider>,
  );
}

describe("Models", () => {
  test("groups by provider and shows ctx window + $in/$out", () => {
    const { ctx } = makeCtx();
    const { lastFrame } = renderModels(ctx);
    const f = lastFrame() ?? "";
    expect(f).toContain("anthropic");
    expect(f).toContain("openai");
    expect(f).toContain("Claude Opus 4.8");
    expect(f).toContain("200K");
    expect(f).toContain("$15/$75");
    expect(f).toContain("GPT-5");
  });

  test("marks providers with a resolvable key", () => {
    const { ctx } = makeCtx();
    const { lastFrame } = renderModels(ctx);
    expect(lastFrame() ?? "").toContain("✓");
  });

  test("Enter sets the model, records it in recentModels, and closes", async () => {
    const { ctx, setModelSpy, setPrefsSpy, closeModalSpy } = makeCtx();
    const { stdin } = renderModels(ctx);
    stdin.write("\r");
    await tick();
    expect(setModelSpy).toHaveBeenCalledWith("sess1", "anthropic/claude-opus-4-8");
    expect(setPrefsSpy).toHaveBeenCalledWith({ recentModels: ["anthropic/claude-opus-4-8"] });
    expect(closeModalSpy).toHaveBeenCalledTimes(1);
  });

  test("recentModels moves an already-present model to the front (MRU dedup)", async () => {
    const prior = ["x/1", "anthropic/claude-opus-4-8", "y/2"];
    const { ctx, setPrefsSpy } = makeCtx({ ...DEFAULT_PREFS, recentModels: prior });
    const { stdin } = renderModels(ctx);
    stdin.write("\r");
    await tick();
    const patch = setPrefsSpy.mock.calls[0]?.[0] as Partial<UiPrefs>;
    expect(patch.recentModels).toEqual(["anthropic/claude-opus-4-8", "x/1", "y/2"]);
    expect(patch.recentModels?.filter((m) => m === "anthropic/claude-opus-4-8").length).toBe(1);
  });

  test("recentModels caps at 8, dropping the oldest", async () => {
    const prior = ["b/2", "c/3", "d/4", "e/5", "f/6", "g/7", "h/8", "i/9"]; // 8, none is the chosen
    const { ctx, setPrefsSpy } = makeCtx({ ...DEFAULT_PREFS, recentModels: prior });
    const { stdin } = renderModels(ctx);
    stdin.write("\r");
    await tick();
    const patch = setPrefsSpy.mock.calls[0]?.[0] as Partial<UiPrefs>;
    expect(patch.recentModels?.length).toBe(8);
    expect(patch.recentModels?.[0]).toBe("anthropic/claude-opus-4-8");
    expect(patch.recentModels).not.toContain("i/9"); // oldest pushed off the end
  });
});
