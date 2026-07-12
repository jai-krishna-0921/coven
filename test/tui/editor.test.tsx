import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { PromptEditor } from "../../src/tui/input/editor.tsx";
import { TextBuffer } from "../../src/tui/input/buffer.ts";
import {
  applyKey,
  completeToken,
  cursorIndex,
  isSingleLine,
  parseSubmit,
  type EditorKey,
} from "../../src/tui/input/editor-reducer.ts";
import type { PaletteItem } from "../../src/tui/types.ts";

const K = (o: Partial<EditorKey> = {}): EditorKey => ({
  ctrl: false, meta: false, shift: false, return: false, escape: false,
  upArrow: false, downArrow: false, leftArrow: false, rightArrow: false,
  tab: false, backspace: false, delete: false, ...o,
});

const mk = (slash: string): PaletteItem => ({ id: slash, title: slash, slash, category: "System", run() {} });
const ITEMS = ["review", "rename", "resume", "new", "models"].map(mk);

const tick = () => new Promise((r) => setTimeout(r, 15));

// Redirect InputHistory persistence to a throwaway HOME so tests stay hermetic.
const realHome = process.env.HOME;
let tmpHome: string;
beforeAll(() => {
  tmpHome = mkdtempSync(join(tmpdir(), "coven-editor-"));
  process.env.HOME = tmpHome;
});
afterAll(() => {
  if (realHome === undefined) delete process.env.HOME;
  else process.env.HOME = realHome;
  rmSync(tmpHome, { recursive: true, force: true });
});

describe("cursorIndex", () => {
  test("linear offset counts newline separators", () => {
    const b = new TextBuffer("ab\ncd");
    expect(cursorIndex(b)).toBe(5); // cursor at end
    b.home();
    b.moveUp();
    expect(cursorIndex(b)).toBe(0); // top-left
  });
});

describe("applyKey", () => {
  test("printable input inserts and reports changed", () => {
    const b = new TextBuffer();
    expect(applyKey(b, K(), "hi")).toEqual({ kind: "changed" });
    expect(b.value()).toBe("hi");
  });
  test("backspace deletes left; ctrl+backspace deletes a word", () => {
    const b = new TextBuffer("foo bar");
    applyKey(b, K({ backspace: true }), "");
    expect(b.value()).toBe("foo ba");
    applyKey(b, K({ ctrl: true, backspace: true }), "");
    expect(b.value()).toBe("foo ");
  });
  test("emacs controls: ctrl+a/e/u/w", () => {
    const b = new TextBuffer("foo bar");
    applyKey(b, K({ ctrl: true }), "a");
    expect(b.cursor().col).toBe(0);
    applyKey(b, K({ ctrl: true }), "e");
    expect(b.cursor().col).toBe(7);
    applyKey(b, K({ ctrl: true }), "w");
    expect(b.value()).toBe("foo ");
    applyKey(b, K({ ctrl: true }), "u");
    expect(b.value()).toBe("");
  });
  test("Enter on text is a submit; blank/tab/ctrl-unknown are noops", () => {
    const b = new TextBuffer("hello");
    expect(applyKey(b, K({ return: true }), "")).toEqual({ kind: "submit" });
    expect(applyKey(b, K({ tab: true }), "\t")).toEqual({ kind: "noop" });
    expect(applyKey(b, K({ ctrl: true }), "z")).toEqual({ kind: "noop" });
  });
  test("shift+Enter inserts a newline instead of submitting", () => {
    const b = new TextBuffer("a");
    expect(applyKey(b, K({ return: true, shift: true }), "")).toEqual({ kind: "changed" });
    expect(b.value()).toBe("a\n");
  });
  test("trailing backslash + Enter is a line continuation (strips the backslash)", () => {
    const b = new TextBuffer("a\\");
    expect(applyKey(b, K({ return: true }), "")).toEqual({ kind: "changed" });
    expect(b.value()).toBe("a\n");
  });
  test("arrows move the cursor", () => {
    const b = new TextBuffer("abc");
    applyKey(b, K({ leftArrow: true }), "");
    expect(b.cursor().col).toBe(2);
    applyKey(b, K({ rightArrow: true }), "");
    expect(b.cursor().col).toBe(3);
  });
});

describe("completeToken", () => {
  test("replaces the token under the cursor and adds a trailing space", () => {
    expect(completeToken("/re", 3, "/rename")).toEqual({ value: "/rename ", cursor: 8 });
  });
  test("replaces a mid-line @token", () => {
    expect(completeToken("look @src/i", 11, "src/index.ts")).toEqual({
      value: "look src/index.ts ",
      cursor: 18,
    });
  });
});

describe("parseSubmit", () => {
  test("classifies shell, prompt, and empty", () => {
    expect(parseSubmit("!ls")).toEqual({ kind: "shell", command: "ls" });
    expect(parseSubmit("  !git status ")).toEqual({ kind: "shell", command: "git status" });
    expect(parseSubmit("hello")).toEqual({ kind: "prompt", text: "hello" });
    expect(parseSubmit("   ")).toEqual({ kind: "empty" });
  });
});

describe("isSingleLine", () => {
  test("true for one line, false with a newline", () => {
    expect(isSingleLine(new TextBuffer("abc"))).toBe(true);
    expect(isSingleLine(new TextBuffer("a\nb"))).toBe(false);
  });
});

function renderEditor(opts: {
  onSubmit?: (t: string) => void;
  onShell?: (c: string) => void;
  onPopoverChange?: (o: boolean) => void;
}) {
  return render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <PromptEditor
        items={ITEMS}
        active
        onSubmit={opts.onSubmit ?? (() => {})}
        onShell={opts.onShell ?? (() => {})}
        onPopoverChange={opts.onPopoverChange}
      />
    </ThemeProvider>,
  );
}

describe("PromptEditor", () => {
  test("renders the prompt glyph", () => {
    const { lastFrame } = renderEditor({});
    expect(lastFrame() ?? "").toContain("❯");
  });

  test("typing /re opens a popover of matching commands", async () => {
    const opened: boolean[] = [];
    const { lastFrame, stdin } = renderEditor({ onPopoverChange: (o) => opened.push(o) });
    stdin.write("/re");
    await tick();
    const f = lastFrame() ?? "";
    expect(f).toContain("rename");
    expect(f).toContain("resume");
    expect(f).toContain("review");
    expect(f).not.toContain("/new");
    expect(opened).toContain(true);
  });

  test("Tab accepts the first completion", async () => {
    const { lastFrame, stdin } = renderEditor({});
    stdin.write("/re");
    await tick();
    stdin.write("\t");
    await tick();
    expect(lastFrame() ?? "").toContain("/rename");
  });

  test("typing text then Enter submits the text", async () => {
    const submitted: string[] = [];
    const { stdin } = renderEditor({ onSubmit: (t) => submitted.push(t) });
    stdin.write("hello world");
    await tick();
    stdin.write("\r");
    await tick();
    expect(submitted).toEqual(["hello world"]);
  });

  test("a leading ! routes the line to onShell", async () => {
    const shelled: string[] = [];
    const { stdin } = renderEditor({ onShell: (c) => shelled.push(c) });
    stdin.write("!ls");
    await tick();
    stdin.write("\r");
    await tick();
    expect(shelled).toEqual(["ls"]);
  });
});
