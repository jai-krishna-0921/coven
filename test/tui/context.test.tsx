import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { Text } from "ink";
import { ThemeProvider, UiProvider, useTheme, useUi } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import type { UiStore } from "../../src/tui/store.ts";
import type { UiState } from "../../src/tui/types.ts";
import { EMPTY_USAGE } from "../../src/session/types.ts";

function AccentProbe() {
  const { theme } = useTheme();
  return <Text>{theme.accent}</Text>;
}

function GlyphProbe() {
  const { icons } = useTheme();
  return <Text>{icons.prompt}</Text>;
}

function StatusProbe() {
  const state = useUi();
  return <Text>{state.status}</Text>;
}

function fakeStore(state: UiState): UiStore {
  return {
    subscribe: () => () => {},
    getSnapshot: () => state,
  } as unknown as UiStore;
}

const seedState: UiState = {
  session: { id: "s1", title: "t", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } },
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
};

describe("tui context", () => {
  test("useTheme resolves the prefs theme accent", () => {
    const { lastFrame } = render(
      <ThemeProvider prefs={{ ...DEFAULT_PREFS, theme: "dracula" }}>
        <AccentProbe />
      </ThemeProvider>,
    );
    expect(lastFrame()).toContain("#bd93f9");
  });

  test("useTheme selects the ascii glyph set", () => {
    const { lastFrame } = render(
      <ThemeProvider prefs={{ ...DEFAULT_PREFS, glyphs: "ascii" }}>
        <GlyphProbe />
      </ThemeProvider>,
    );
    expect(lastFrame()).toContain("❯");
  });

  test("useUi reads the store snapshot status", () => {
    const { lastFrame } = render(
      <UiProvider store={fakeStore(seedState)}>
        <StatusProbe />
      </UiProvider>,
    );
    expect(lastFrame()).toContain("idle");
  });
});
