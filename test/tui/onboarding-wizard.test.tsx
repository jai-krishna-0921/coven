import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { OnboardingWizard } from "../../src/tui/onboarding/Wizard.tsx";
import { DEFAULT_PREFS, type UiPrefs } from "../../src/tui/prefs.ts";
import type { CommandContext } from "../../src/tui/types.ts";
import type { App } from "../../src/app.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

// > 20ms so Ink's pending-escape flush fires and effects settle before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function makeSession(): SessionInfo {
  return { id: "s1", title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } };
}

function makeCtx() {
  const authSet = mock((_p: string, _k: string) => {});
  const setPrefs = mock((_p: Partial<UiPrefs>) => {});
  const app = { auth: { set: authSet } } as unknown as App;
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
    session: makeSession(),
    abort: new AbortController().signal,
    host: { redraw() {}, openEditor: async () => {}, attachFile() {}, exportTranscript: async () => {}, interrupt() {}, quit() {} },
    send: async () => {},
    gateShell: async () => true,
    openModal: () => {},
    closeModal: () => {},
    toast: () => {},
    prefs: { ...DEFAULT_PREFS },
    setPrefs,
  };
  return { ctx, authSet, setPrefs };
}

describe("OnboardingWizard", () => {
  test("walks all 5 steps, stores a chosen provider key, persists onboarded, calls onDone", async () => {
    const { ctx, authSet, setPrefs } = makeCtx();
    const onDone = mock(() => {});
    const { stdin, lastFrame } = render(<OnboardingWizard ctx={ctx} onDone={onDone} />);

    // Step 1: theme — starts here.
    expect(lastFrame() ?? "").toContain("Choose a theme");

    stdin.write("\r"); // theme → accent
    await tick();
    expect(lastFrame() ?? "").toContain("Choose an accent");

    stdin.write("\r"); // accent → layout
    await tick();
    expect(lastFrame() ?? "").toContain("Layout & density");

    stdin.write("\r"); // layout → glyphs
    await tick();
    expect(lastFrame() ?? "").toContain("Icon style");

    stdin.write("\r"); // glyphs → connector
    await tick();
    expect(lastFrame() ?? "").toContain("Connect a provider");

    stdin.write("\x1b[B"); // anthropic → openai
    await tick();
    stdin.write("\r"); // select openai → key entry prompt
    await tick();

    stdin.write("sk-test-key-value");
    await tick();
    stdin.write("\r"); // submit key
    await tick();

    expect(authSet).toHaveBeenCalledWith("openai", "sk-test-key-value");
    expect(onDone).toHaveBeenCalledTimes(1);
    const lastPatch = setPrefs.mock.calls.at(-1)?.[0];
    expect(lastPatch?.onboarded).toBe(true);
  });

  test("choosing 'skip for now' finishes without touching auth", async () => {
    const { ctx, authSet, setPrefs } = makeCtx();
    const onDone = mock(() => {});
    const { stdin } = render(<OnboardingWizard ctx={ctx} onDone={onDone} />);

    for (let i = 0; i < 4; i++) {
      stdin.write("\r"); // advance theme → accent → layout → glyphs → connector
      await tick();
    }
    // connector highlight starts on the first provider; move to the trailing "skip".
    // Wave 8 added 11 providers on top of the original 6 — the "skip" entry is
    // now at index 17, so 17 down-arrows walks from the first provider to it.
    for (let i = 0; i < 17; i++) {
      stdin.write("\x1b[B");
      await tick();
    }
    stdin.write("\r"); // select skip → finish
    await tick();

    expect(authSet).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
    expect(setPrefs.mock.calls.at(-1)?.[0]?.onboarded).toBe(true);
  });

  test("ctrl+c at any step writes defaults + onboarded and finishes", async () => {
    const { ctx, authSet, setPrefs } = makeCtx();
    const onDone = mock(() => {});
    const { stdin } = render(<OnboardingWizard ctx={ctx} onDone={onDone} />);

    stdin.write("\x03"); // ctrl+c on the very first step
    await tick();

    expect(authSet).not.toHaveBeenCalled();
    expect(onDone).toHaveBeenCalledTimes(1);
    const patch = setPrefs.mock.calls.at(-1)?.[0];
    expect(patch?.onboarded).toBe(true);
    expect(patch?.theme).toBe(DEFAULT_PREFS.theme);
    expect(patch?.glyphs).toBe(DEFAULT_PREFS.glyphs);
  });

  test("esc on the first step stays on the wizard (does not go negative)", async () => {
    const { ctx } = makeCtx();
    const onDone = mock(() => {});
    const { stdin, lastFrame } = render(<OnboardingWizard ctx={ctx} onDone={onDone} />);
    stdin.write("\x1b"); // back from step 0
    await tick();
    expect(lastFrame() ?? "").toContain("Choose a theme");
    expect(onDone).not.toHaveBeenCalled();
  });
});
