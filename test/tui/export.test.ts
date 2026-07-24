import { describe, expect, test } from "bun:test";
import { defaultExportOptions, renderTranscript, sanitizeFilename } from "../../src/tui/export.ts";
import { EMPTY_USAGE, type Message, type SessionInfo } from "../../src/session/types.ts";

function session(): SessionInfo {
  return { id: "ses_abcdef1234", title: "Test session", agent: "builder", created: 0, updated: 0, usage: { ...EMPTY_USAGE } };
}

function userMsg(text: string): Message {
  return { id: "u1", sessionID: "ses_abcdef1234", role: "user", agent: "builder", parts: [{ id: "p", type: "text", text }], time: 1 };
}

function assistantMsg(parts: Message["parts"], extra: Partial<Message> = {}): Message {
  return {
    id: "a1", sessionID: "ses_abcdef1234", role: "assistant", agent: "builder",
    parts, time: 2, model: "anthropic/claude-opus-4-8",
    usage: { inputTokens: 100, outputTokens: 50, cacheReadTokens: 0, cacheWriteTokens: 0 },
    finish: "stop",
    ...extra,
  };
}

describe("sanitizeFilename", () => {
  test("empty falls back to coven-<id-suffix>.md", () => {
    expect(sanitizeFilename("", "ses_abcdef1234")).toBe("coven-cdef1234.md");
    expect(sanitizeFilename("   ", "ses_abcdef1234")).toBe("coven-cdef1234.md");
  });
  test("strips path separators so it cannot escape the root", () => {
    expect(sanitizeFilename("../etc/passwd", "ses_x")).not.toContain("/");
    expect(sanitizeFilename("../etc/passwd", "ses_x")).not.toContain("..");
    expect(sanitizeFilename("subdir\\report.md", "ses_x")).not.toContain("\\");
  });
  test("strips control chars", () => {
    expect(sanitizeFilename("hello\x00world.md", "ses_x")).toBe("helloworld.md");
  });
  test("passes a plain filename through", () => {
    expect(sanitizeFilename("report.md", "ses_x")).toBe("report.md");
  });
});

describe("renderTranscript", () => {
  const opts = defaultExportOptions("ses_abcdef1234");
  const s = session();

  test("always emits user + assistant text sections and the title", () => {
    const md = renderTranscript(
      [userMsg("hello"), assistantMsg([{ id: "p", type: "text", text: "hi back" }])],
      s,
      opts,
    );
    expect(md).toContain("# Coven session — Test session");
    expect(md).toContain("**You**");
    expect(md).toContain("hello");
    expect(md).toContain("**Coven (builder)**");
    expect(md).toContain("hi back");
  });

  test("reasoning parts are omitted by default and included when includeReasoning=true", () => {
    const msg = assistantMsg([
      { id: "r", type: "reasoning", text: "internal chain of thought" },
      { id: "t", type: "text", text: "final answer" },
    ]);
    expect(renderTranscript([msg], s, opts)).not.toContain("internal chain of thought");
    const inc = renderTranscript([msg], s, { ...opts, includeReasoning: true });
    expect(inc).toContain("internal chain of thought");
    expect(inc).toContain("<details>");
  });

  test("tool parts render title-only by default; includeToolDetails adds args + output", () => {
    const msg = assistantMsg([
      { id: "t", type: "tool", callID: "c1", tool: "read", args: { path: "/etc/passwd" }, status: "completed", title: "read /etc/passwd", output: "root:x:0:0" },
    ]);
    const brief = renderTranscript([msg], s, opts);
    expect(brief).toContain("`read`");
    expect(brief).toContain("read /etc/passwd");
    expect(brief).not.toContain("root:x:0:0");
    expect(brief).not.toContain("/etc/passwd\"");
    const full = renderTranscript([msg], s, { ...opts, includeToolDetails: true });
    expect(full).toContain("root:x:0:0");
    expect(full).toContain("/etc/passwd");
  });

  test("assistant metadata comment only appears when includeMetadata=true", () => {
    const msg = assistantMsg([{ id: "t", type: "text", text: "hi" }]);
    expect(renderTranscript([msg], s, opts)).not.toContain("<!-- model=");
    const withMeta = renderTranscript([msg], s, { ...opts, includeMetadata: true });
    expect(withMeta).toContain("<!-- model=anthropic/claude-opus-4-8");
    expect(withMeta).toContain("tokens=100/50");
  });
});
