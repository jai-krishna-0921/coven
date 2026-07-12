import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { Spinner } from "../../src/tui/components/Spinner.tsx";

describe("Spinner", () => {
  test("renders a spinner frame and its label", () => {
    const { lastFrame } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <Spinner label="working" />
      </ThemeProvider>,
    );
    const frame = lastFrame() ?? "";
    expect(frame).toContain("working");
    expect(["|", "/", "-", "\\"].some((g) => frame.includes(g))).toBe(true);
  });

  test("renders without a label", () => {
    const { lastFrame } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <Spinner />
      </ThemeProvider>,
    );
    expect((lastFrame() ?? "").length).toBeGreaterThan(0);
  });
});
