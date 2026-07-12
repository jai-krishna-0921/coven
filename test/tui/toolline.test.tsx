import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { ToolLine } from "../../src/tui/components/ToolLine.tsx";
import type { Part } from "../../src/session/types.ts";

type ToolPart = Extract<Part, { type: "tool" }>;

function tool(over: Partial<ToolPart>): ToolPart {
  return {
    id: "c1",
    type: "tool",
    callID: "c1",
    tool: "bash",
    args: {},
    status: "running",
    ...over,
  };
}

function frameOf(part: ToolPart): string {
  const { lastFrame } = render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <ToolLine part={part} />
    </ThemeProvider>,
  );
  return lastFrame() ?? "";
}

describe("ToolLine", () => {
  test("running tool renders the tool name and a spinner frame", () => {
    const f = frameOf(tool({ tool: "bash", status: "running", title: "run tests" }));
    expect(f).toContain("bash");
    expect(["|", "/", "-", "\\"].some((g) => f.includes(g))).toBe(true);
  });

  test("completed tool renders the ok glyph and title", () => {
    const f = frameOf(tool({ tool: "read", status: "completed", title: "read file.ts" }));
    expect(f).toContain("✓");
    expect(f).toContain("read file.ts");
  });

  test("errored tool renders the error glyph", () => {
    const f = frameOf(tool({ tool: "bash", status: "error", title: "boom" }));
    expect(f).toContain("✗");
    expect(f).toContain("boom");
  });

  test("edit tool with args renders nothing (Diff handles it)", () => {
    const f = frameOf(
      tool({ tool: "edit", status: "completed", args: { oldString: "a", newString: "b", filePath: "x.ts" } }),
    );
    expect(f).not.toContain("edit");
  });
});
