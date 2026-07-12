import { describe, expect, test, mock } from "bun:test";
import { useState } from "react";
import { render } from "ink-testing-library";
import { Text } from "ink";
import { ThemeProvider, useTheme } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS, type UiPrefs } from "../../src/tui/prefs.ts";
import { Themes } from "../../src/tui/dialogs/Themes.tsx";
import { THEMES } from "../../src/tui/theme.ts";
import type { CommandContext } from "../../src/tui/types.ts";
import type { App } from "../../src/app.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

// > 20ms so Ink's pending-escape flush fires and effects settle before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function makeSession(): SessionInfo {
  return { id: "s1", title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } };
}

function baseCtx(prefs: UiPrefs, setPrefs: (p: Partial<UiPrefs>) => void, closeModal: () => void): CommandContext {
  return {
    app: {} as unknown as App,
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
    closeModal,
    toast: () => {},
    prefs,
    setPrefs,
  };
}

function AccentProbe() {
  const { theme } = useTheme();
  return <Text>ACCENT[{theme.accent}]</Text>;
}

function Harness({
  initialTheme,
  setPrefsSpy,
  closeSpy,
}: {
  initialTheme: string;
  setPrefsSpy: (p: Partial<UiPrefs>) => void;
  closeSpy: () => void;
}) {
  const [prefs, setPrefs] = useState<UiPrefs>({ ...DEFAULT_PREFS, theme: initialTheme });
  const applyPrefs = (patch: Partial<UiPrefs>) => {
    setPrefsSpy(patch);
    setPrefs((p) => ({ ...p, ...patch }));
  };
  const ctx = baseCtx(prefs, applyPrefs, closeSpy);
  return (
    <ThemeProvider prefs={prefs}>
      <AccentProbe />
      <Themes ctx={ctx} />
    </ThemeProvider>
  );
}

function renderThemes(initialTheme = "coven-dark") {
  const setPrefsSpy = mock((_p: Partial<UiPrefs>) => {});
  const closeSpy = mock(() => {});
  const r = render(<Harness initialTheme={initialTheme} setPrefsSpy={setPrefsSpy} closeSpy={closeSpy} />);
  return { ...r, setPrefsSpy, closeSpy };
}

const DARK_ACCENT = THEMES["coven-dark"].accent; // #c026d3
const LIGHT_ACCENT = THEMES["coven-light"].accent; // #a21caf

describe("Themes", () => {
  test("lists all 7 theme labels", () => {
    const { lastFrame } = renderThemes();
    const f = lastFrame() ?? "";
    for (const t of Object.values(THEMES)) expect(f).toContain(t.label);
  });

  test("moving the highlight live-previews the theme (surrounding accent changes on down)", async () => {
    const { stdin, lastFrame, setPrefsSpy } = renderThemes("coven-dark");
    expect(lastFrame() ?? "").toContain(`ACCENT[${DARK_ACCENT}]`);
    stdin.write("\x1b[B"); // down → coven-light (Object.keys order)
    await tick();
    expect(setPrefsSpy).toHaveBeenCalledWith({ theme: "coven-light" });
    expect(lastFrame() ?? "").toContain(`ACCENT[${LIGHT_ACCENT}]`);
  });

  test("Enter commits the highlighted theme and closes", async () => {
    const { stdin, setPrefsSpy, closeSpy } = renderThemes("coven-dark");
    stdin.write("\x1b[B"); // preview coven-light
    await tick();
    stdin.write("\r"); // commit
    await tick();
    const calls = setPrefsSpy.mock.calls;
    expect(calls[calls.length - 1]?.[0]).toEqual({ theme: "coven-light" });
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });

  test("Esc reverts to the entry theme and closes", async () => {
    const { stdin, lastFrame, setPrefsSpy, closeSpy } = renderThemes("coven-dark");
    stdin.write("\x1b[B"); // preview coven-light
    await tick();
    expect(lastFrame() ?? "").toContain(`ACCENT[${LIGHT_ACCENT}]`);
    stdin.write("\x1b"); // esc → revert to entry
    await tick();
    // entry theme restored via ctx.setPrefs({ theme: entry })
    const calls = setPrefsSpy.mock.calls;
    expect(calls[calls.length - 1]?.[0]).toEqual({ theme: "coven-dark" });
    expect(lastFrame() ?? "").toContain(`ACCENT[${DARK_ACCENT}]`);
    expect(closeSpy).toHaveBeenCalledTimes(1);
  });
});
