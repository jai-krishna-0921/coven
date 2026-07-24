import { describe, expect, test } from "bun:test";
import { questionTool } from "../src/tool/question.ts";
import type { ToolContext } from "../src/tool/types.ts";

function ctx(over: Partial<ToolContext> = {}): ToolContext {
  return {
    sessionID: "s",
    messageID: "m",
    callID: "c",
    agent: "builder",
    root: "/tmp",
    abort: new AbortController().signal,
    messages: [],
    ask: async () => {},
    progress: () => {},
    ...over,
  };
}

describe("question tool", () => {
  test("execute returns a friendly error when no askQuestion is injected", async () => {
    const result = await questionTool.execute({ title: "?", choices: ["a"] } as never, ctx());
    expect(result.metadata).toEqual({ isError: true });
    expect(result.output).toMatch(/not available/i);
  });

  test("execute forwards args and joins single-select output", async () => {
    let received: { title: string; choices: string[]; allowCustom?: boolean; allowMultiple?: boolean } | undefined;
    const askQuestion = async (input: typeof received): Promise<string[]> => {
      received = input;
      return ["a"];
    };
    const result = await questionTool.execute(
      { title: "pick", choices: ["a", "b"], allow_custom: false, allow_multiple: false } as never,
      ctx({ askQuestion: askQuestion as never }),
    );
    expect(received?.title).toBe("pick");
    expect(received?.choices).toEqual(["a", "b"]);
    expect(result.output).toBe("a");
  });

  test("multi-select values are comma-joined in the tool output", async () => {
    const result = await questionTool.execute(
      { title: "pick", choices: ["a", "b", "c"], allow_multiple: true } as never,
      ctx({ askQuestion: (async () => ["a", "c"]) as never }),
    );
    expect(result.output).toBe("a, c");
  });

  test("cancellation is surfaced as an error ToolResult (no throw)", async () => {
    const result = await questionTool.execute(
      { title: "?", choices: ["a"] } as never,
      ctx({ askQuestion: (async () => { throw new Error("User cancelled the question."); }) as never }),
    );
    expect(result.metadata).toEqual({ isError: true });
    expect(result.output).toMatch(/User cancelled/);
  });

  test("empty selection is rendered clearly", async () => {
    const result = await questionTool.execute(
      { title: "pick", choices: ["a"], allow_multiple: true } as never,
      ctx({ askQuestion: (async () => []) as never }),
    );
    expect(result.output).toBe("(no selection)");
  });
});
