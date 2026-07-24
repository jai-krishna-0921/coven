import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider, UiProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Transcript, windowMessages } from "../../src/tui/components/Transcript.tsx";
import type { UiStore } from "../../src/tui/store.ts";
import type { UiState } from "../../src/tui/types.ts";
import { EMPTY_USAGE, type Message } from "../../src/session/types.ts";

function userMsg(id: string, text: string): Message {
  return { id, sessionID: "s1", role: "user", parts: [{ id: `${id}p`, type: "text", text }], agent: "builder", time: 0 };
}

function assistantMsg(id: string, text: string): Message {
  return { id, sessionID: "s1", role: "assistant", parts: [{ id: `${id}p`, type: "text", text }], agent: "builder", time: 0 };
}

function tallMsg(id: string, lines: number): Message {
  const text = Array.from({ length: lines }, (_, i) => `line${i}`).join("\n");
  return assistantMsg(id, text);
}

const HISTORY = [userMsg("1", "AAAA"), assistantMsg("2", "BBBB"), userMsg("3", "CCCC"), assistantMsg("4", "DDDD")];

function stateWith(history: Message[], live: Message | null, scrollOffset: number): UiState {
  return {
    session: { id: "s1", title: "t", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } },
    history,
    live,
    status: "idle",
    compacting: false,
    context: { tokens: 0, usable: 100, pct: 0 },
    permission: null,
    question: null,
    modal: null,
    reonboarding: false,
    sidebarOverlay: false,
    scrollOffset,
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

function fakeStore(state: UiState): UiStore {
  return { subscribe: () => () => {}, getSnapshot: () => state } as unknown as UiStore;
}

function frameOf(state: UiState, height: number): string {
  const { lastFrame } = render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <UiProvider store={fakeStore(state)}>
        <Transcript height={height} />
      </UiProvider>
    </ThemeProvider>,
  );
  return lastFrame() ?? "";
}

describe("windowMessages", () => {
  test("tail-anchored: returns the most recent messages that fit", () => {
    expect(windowMessages(HISTORY, 2, 0).map((m) => m.id)).toEqual(["3", "4"]);
  });

  test("height 1 returns only the newest message", () => {
    expect(windowMessages(HISTORY, 1, 0).map((m) => m.id)).toEqual(["4"]);
  });

  test("scrollOffset shifts the window toward older messages", () => {
    expect(windowMessages(HISTORY, 2, 2).map((m) => m.id)).toEqual(["1", "2"]);
  });

  test("a single message taller than the viewport is still returned (renders from its top)", () => {
    expect(windowMessages([tallMsg("t", 5)], 2, 0).map((m) => m.id)).toEqual(["t"]);
  });

  test("empty input returns empty", () => {
    expect(windowMessages([], 5, 0)).toEqual([]);
  });
});

describe("Transcript", () => {
  test("tail-anchored at scrollOffset 0 shows newest, clips oldest", () => {
    const f = frameOf(stateWith(HISTORY, null, 0), 3);
    expect(f).toContain("DDDD");
    expect(f).toContain("CCCC");
    expect(f).not.toContain("AAAA");
    expect(f).not.toContain("BBBB");
  });

  test("scrolled up reveals earlier messages and clips the newest", () => {
    const f = frameOf(stateWith(HISTORY, null, 2), 3);
    expect(f).toContain("AAAA");
    expect(f).not.toContain("DDDD");
  });

  test("streaming live message is visible at the tail", () => {
    const f = frameOf(stateWith([userMsg("1", "AAAA")], assistantMsg("live", "streaming now"), 0), 6);
    expect(f).toContain("streaming now");
  });

  test("shows a scroll hint when older content is hidden above", () => {
    const f = frameOf(stateWith(HISTORY, null, 0), 3);
    expect(f).toContain("more above");
    expect(f).toContain("scroll");
  });
});
