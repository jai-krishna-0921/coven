import { describe, expect, test } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { SelectDialog, filterOptions, type SelectOption } from "../../src/tui/dialogs/Select.tsx";

// > 20ms so Ink's pending-escape flush (bare ESC debounce) fires before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

const OPTIONS: SelectOption[] = [
  { value: "review", label: "Review", group: "Prompt" },
  { value: "rename", label: "Rename", group: "Session" },
  { value: "resume", label: "Resume", group: "Session" },
  { value: "new", label: "New session", group: "Session" },
  { value: "models", label: "Models", group: "Model" },
];

function renderDialog(opts: { onSelect?: (v: string) => void; onCancel?: () => void }) {
  return render(
    <ThemeProvider prefs={DEFAULT_PREFS}>
      <SelectDialog
        title="Test dialog"
        options={OPTIONS}
        onSelect={opts.onSelect ?? (() => {})}
        onCancel={opts.onCancel ?? (() => {})}
      />
    </ThemeProvider>,
  );
}

describe("filterOptions", () => {
  test("empty query returns all options unchanged", () => {
    expect(filterOptions(OPTIONS, "")).toEqual(OPTIONS);
  });

  test("prefix matches sort before fuzzy matches", () => {
    const out = filterOptions(OPTIONS, "re").map((o) => o.value);
    expect(out.slice(0, 3).sort()).toEqual(["rename", "resume", "review"]);
    expect(out).not.toContain("new");
  });

  test("preserves the group field on matches", () => {
    const out = filterOptions(OPTIONS, "rename");
    expect(out[0]).toMatchObject({ value: "rename", group: "Session" });
  });
});

describe("SelectDialog", () => {
  test("renders the title and every label", () => {
    const { lastFrame } = renderDialog({});
    const f = lastFrame() ?? "";
    expect(f).toContain("Test dialog");
    for (const o of OPTIONS) expect(f).toContain(o.label);
  });

  test("down arrow moves the highlight to the second option", async () => {
    const { lastFrame, stdin } = renderDialog({});
    stdin.write("\x1b[B");
    await tick();
    const lines = (lastFrame() ?? "").split("\n");
    const renameLine = lines.find((l) => l.includes("Rename")) ?? "";
    const reviewLine = lines.find((l) => l.includes("Review")) ?? "";
    expect(renameLine).toContain("›");
    expect(reviewLine).not.toContain("›");
  });

  test("typing filters the visible labels", async () => {
    const { lastFrame, stdin } = renderDialog({});
    stdin.write("re");
    await tick();
    const f = lastFrame() ?? "";
    expect(f).toContain("Review");
    expect(f).toContain("Rename");
    expect(f).toContain("Resume");
    expect(f).not.toContain("New session");
  });

  test("Enter selects the highlighted value", async () => {
    const selected: string[] = [];
    const { stdin } = renderDialog({ onSelect: (v) => selected.push(v) });
    stdin.write("\x1b[B");
    await tick();
    stdin.write("\r");
    await tick();
    expect(selected).toEqual(["rename"]);
  });

  test("Esc cancels", async () => {
    const cancelled: boolean[] = [];
    const { stdin } = renderDialog({ onCancel: () => cancelled.push(true) });
    stdin.write("\x1b");
    await tick();
    expect(cancelled).toEqual([true]);
  });
});
