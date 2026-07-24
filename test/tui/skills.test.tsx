import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Skills } from "../../src/tui/dialogs/Skills.tsx";
import type { CommandContext } from "../../src/tui/types.ts";
import type { App } from "../../src/app.ts";
import type { SkillInfo } from "../../src/skill/index.ts";
import { EMPTY_USAGE, type SessionInfo } from "../../src/session/types.ts";

// > 20ms so Ink's pending-escape flush fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function makeSession(): SessionInfo {
  return { id: "s1", title: "T", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } };
}

const SKILLS: SkillInfo[] = [
  { name: "brainstorming", description: "Ideate before coding", dir: "/x", content: "# Brainstorming\nStart here first\nThink widely" },
  { name: "systematic-debugging", description: "Root-cause first", dir: "/y", content: "# Debugging\nReproduce the bug" },
];

function makeCtx() {
  const closeModalSpy = mock((): void => {});
  const app = { skills: { all: () => SKILLS } } as unknown as App;
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
    replyQuestion: () => {},
    },
    session: makeSession(),
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

function renderSkills(ctx: CommandContext) {
  return render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <Skills ctx={ctx} />
    </ThemeProvider>,
  );
}

describe("Skills", () => {
  test("lists all skill names", () => {
    const { ctx } = makeCtx();
    const { lastFrame } = renderSkills(ctx);
    const f = lastFrame() ?? "";
    expect(f).toContain("brainstorming");
    expect(f).toContain("systematic-debugging");
  });

  test("shows the highlighted skill's description and content preview", () => {
    const { ctx } = makeCtx();
    const { lastFrame } = renderSkills(ctx);
    const f = lastFrame() ?? "";
    expect(f).toContain("Ideate before coding");
    expect(f).toContain("Start here first");
  });

  test("moving the highlight updates the preview to the next skill", async () => {
    const { ctx } = makeCtx();
    const { stdin, lastFrame } = renderSkills(ctx);
    stdin.write("\x1b[B"); // down → systematic-debugging
    await tick();
    const f = lastFrame() ?? "";
    expect(f).toContain("Root-cause first");
    expect(f).toContain("Reproduce the bug");
  });

  test("esc closes", async () => {
    const { ctx, closeModalSpy } = makeCtx();
    const { stdin } = renderSkills(ctx);
    stdin.write("\x1b");
    await tick();
    expect(closeModalSpy).toHaveBeenCalledTimes(1);
  });
});
