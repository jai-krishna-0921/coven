import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Diff, diffRows } from "../../src/tui/components/Diff.tsx";

describe("Diff", () => {
  test("renders path, deletion, addition, and context", () => {
    const { lastFrame } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <Diff oldText={"a\nb"} newText={"a\nc"} path="f.ts" />
      </ThemeProvider>,
    );
    const f = lastFrame() ?? "";
    expect(f).toContain("f.ts");
    expect(f).toContain("-b");
    expect(f).toContain("+c");
    expect(f).toContain("a");
  });

  test("diffRows marks changed lines for equal-length input", () => {
    expect(diffRows("a\nb", "a\nc")).toEqual([
      { kind: "context", text: "a" },
      { kind: "del", text: "b" },
      { kind: "add", text: "c" },
    ]);
  });

  test("diffRows falls back to all-del/all-add for unequal length", () => {
    expect(diffRows("x", "y\nz")).toEqual([
      { kind: "del", text: "x" },
      { kind: "add", text: "y" },
      { kind: "add", text: "z" },
    ]);
  });
});
