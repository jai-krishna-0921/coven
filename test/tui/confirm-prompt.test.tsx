import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import type { ReactNode } from "react";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Confirm } from "../../src/tui/dialogs/Confirm.tsx";
import { Prompt } from "../../src/tui/dialogs/Prompt.tsx";

// > 20ms so Ink's pending-escape flush fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function wrap(node: ReactNode) {
  return render(<ThemeProvider prefs={DEFAULT_PREFS}>{node}</ThemeProvider>);
}

describe("Confirm", () => {
  test("renders the message and the y/n choices", () => {
    const { lastFrame } = wrap(<Confirm message="Delete it?" onYes={() => {}} onNo={() => {}} />);
    const f = lastFrame() ?? "";
    expect(f).toContain("Delete it?");
    expect(f).toContain("[y]es");
    expect(f).toContain("[n]o");
  });

  test("y calls onYes", async () => {
    const onYes = mock(() => {});
    const onNo = mock(() => {});
    const { stdin } = wrap(<Confirm message="Delete it?" onYes={onYes} onNo={onNo} />);
    stdin.write("y");
    await tick();
    expect(onYes).toHaveBeenCalledTimes(1);
    expect(onNo).not.toHaveBeenCalled();
  });

  test("n calls onNo", async () => {
    const onYes = mock(() => {});
    const onNo = mock(() => {});
    const { stdin } = wrap(<Confirm message="Delete it?" onYes={onYes} onNo={onNo} />);
    stdin.write("n");
    await tick();
    expect(onNo).toHaveBeenCalledTimes(1);
    expect(onYes).not.toHaveBeenCalled();
  });
});

describe("Prompt", () => {
  test("renders the message; typing then Enter submits the text", async () => {
    const onSubmit = mock((_t: string) => {});
    const { stdin, lastFrame } = wrap(<Prompt message="Session name?" onSubmit={onSubmit} onCancel={() => {}} />);
    expect(lastFrame() ?? "").toContain("Session name?");
    stdin.write("hello");
    await tick();
    expect(lastFrame() ?? "").toContain("hello");
    stdin.write("\r");
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("hello");
  });

  test("prefills with initial", async () => {
    const onSubmit = mock((_t: string) => {});
    const { stdin, lastFrame } = wrap(<Prompt message="Rename" initial="foo" onSubmit={onSubmit} onCancel={() => {}} />);
    expect(lastFrame() ?? "").toContain("foo");
    stdin.write("\r");
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("foo");
  });

  test("mask hides the typed characters but submits the real value", async () => {
    const onSubmit = mock((_t: string) => {});
    const { stdin, lastFrame } = wrap(<Prompt message="API key?" mask onSubmit={onSubmit} onCancel={() => {}} />);
    stdin.write("secret");
    await tick();
    expect(lastFrame() ?? "").not.toContain("secret");
    stdin.write("\r");
    await tick();
    expect(onSubmit).toHaveBeenCalledWith("secret");
  });

  test("esc calls onCancel", async () => {
    const onCancel = mock(() => {});
    const { stdin } = wrap(<Prompt message="M" onSubmit={() => {}} onCancel={onCancel} />);
    stdin.write("\x1b");
    await tick();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
