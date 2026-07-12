import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Markdown } from "../../src/tui/components/Markdown.tsx";

function frameOf(text: string): string {
  const { lastFrame } = render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <Markdown text={text} />
    </ThemeProvider>,
  );
  return lastFrame() ?? "";
}

describe("Markdown", () => {
  test("heading strips the # markup", () => {
    const f = frameOf("# Hello");
    expect(f).toContain("Hello");
    expect(f).not.toContain("#");
  });

  test("bold strips the ** markup", () => {
    const f = frameOf("say **loud** now");
    expect(f).toContain("say");
    expect(f).toContain("loud");
    expect(f).toContain("now");
    expect(f).not.toContain("**");
  });

  test("inline code strips the backticks", () => {
    const f = frameOf("run `bun test` please");
    expect(f).toContain("bun test");
    expect(f).not.toContain("`");
  });

  test("bullet renders with the bullet glyph and drops the dash", () => {
    const f = frameOf("- item one");
    expect(f).toContain("item one");
    expect(f).toContain("•");
    expect(f).not.toContain("- item");
  });

  test("plain text passes through unchanged", () => {
    expect(frameOf("just some words")).toContain("just some words");
  });
});
