import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { MessageView } from "../../src/tui/components/Message.tsx";
import type { Message, Part } from "../../src/session/types.ts";

function msg(role: "user" | "assistant", parts: Part[]): Message {
  return { id: "m1", sessionID: "s1", role, parts, agent: "builder", time: 0 };
}

function frameOf(message: Message): string {
  const { lastFrame } = render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <MessageView message={message} />
    </ThemeProvider>,
  );
  return lastFrame() ?? "";
}

describe("MessageView", () => {
  test("user message renders its text prefixed with the prompt glyph", () => {
    const f = frameOf(msg("user", [{ id: "p1", type: "text", text: "hello there" }]));
    expect(f).toContain("❯");
    expect(f).toContain("hello there");
  });

  test("assistant text part renders via Markdown", () => {
    const f = frameOf(msg("assistant", [{ id: "p1", type: "text", text: "# Title\nbody line" }]));
    expect(f).toContain("Title");
    expect(f).toContain("body line");
    expect(f).not.toContain("#");
  });

  test("tool part renders a ToolLine", () => {
    const f = frameOf(
      msg("assistant", [
        { id: "p1", type: "tool", callID: "c1", tool: "bash", args: {}, status: "completed", title: "ran ls" },
      ]),
    );
    expect(f).toContain("bash");
    expect(f).toContain("ran ls");
  });

  test("edit tool part renders a Diff", () => {
    const f = frameOf(
      msg("assistant", [
        {
          id: "p1",
          type: "tool",
          callID: "c1",
          tool: "edit",
          args: { oldString: "a\nb", newString: "a\nc", filePath: "f.ts" },
          status: "completed",
        },
      ]),
    );
    expect(f).toContain("f.ts");
    expect(f).toContain("+c");
    expect(f).toContain("-b");
  });

  test("reasoning part renders its text", () => {
    const f = frameOf(msg("assistant", [{ id: "p1", type: "reasoning", text: "thinking hard" }]));
    expect(f).toContain("thinking hard");
  });
});
