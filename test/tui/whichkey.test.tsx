import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { WhichKey } from "../../src/tui/dialogs/WhichKey.tsx";

// > 20ms so Ink's pending-escape flush fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

function renderWhichKey(onCancel: () => void) {
  return render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <WhichKey onCancel={onCancel} />
    </ThemeProvider>,
  );
}

describe("WhichKey", () => {
  test("renders key → action rows from BINDINGS", () => {
    const { lastFrame } = renderWhichKey(() => {});
    const f = lastFrame() ?? "";
    expect(f).toContain("ctrl+p");
    expect(f).toContain("Command palette");
    expect(f).toContain("ctrl+n");
    expect(f).toContain("New session");
  });

  test("Esc calls onCancel", async () => {
    const onCancel = mock((): void => {});
    const { stdin } = renderWhichKey(onCancel);
    stdin.write("\x1b");
    await tick();
    expect(onCancel).toHaveBeenCalledTimes(1);
  });
});
