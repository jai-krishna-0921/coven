import { describe, expect, test, mock } from "bun:test";
import { render } from "ink-testing-library";
import { ThemeProvider } from "../../src/tui/context.tsx";
import { DEFAULT_PREFS } from "../../src/tui/prefs.ts";
import { THEMES } from "../../src/tui/theme.ts";
import { ENV_KEYS } from "../../src/auth/index.ts";
import {
  ThemeStep,
  AccentStep,
  LayoutStep,
  GlyphStep,
  ConnectorStep,
  type LayoutChoice,
  type GlyphChoice,
} from "../../src/tui/onboarding/steps.tsx";

// > 20ms so Ink's pending-escape flush fires and effects settle before we assert.
const tick = () => new Promise((r) => setTimeout(r, 40));

describe("ThemeStep", () => {
  test("lists all 7 themes, previews the highlight live, advances on enter", async () => {
    const onChange = mock((_v: string) => {});
    const onNext = mock(() => {});
    const { stdin, lastFrame } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <ThemeStep value="coven-dark" onChange={onChange} onNext={onNext} onBack={() => {}} />
      </ThemeProvider>,
    );
    const f0 = lastFrame() ?? "";
    for (const t of Object.values(THEMES)) expect(f0).toContain(t.label);
    expect(f0).toContain("Preview: Coven Dark");
    stdin.write("\x1b[B"); // down → coven-light (Object.keys order)
    await tick();
    expect(onChange).toHaveBeenCalledWith("coven-light");
    expect(lastFrame() ?? "").toContain("Preview: Coven Light");
    stdin.write("\r");
    await tick();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  test("esc calls onBack", async () => {
    const onBack = mock(() => {});
    const { stdin } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <ThemeStep value="coven-dark" onChange={() => {}} onNext={() => {}} onBack={onBack} />
      </ThemeProvider>,
    );
    stdin.write("\x1b");
    await tick();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

describe("AccentStep", () => {
  test("shows swatches incl. the current value, changes accent on nav, advances", async () => {
    const onChange = mock((_v: string) => {});
    const onNext = mock(() => {});
    const { stdin, lastFrame } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <AccentStep value="#c026d3" onChange={onChange} onNext={onNext} onBack={() => {}} />
      </ThemeProvider>,
    );
    expect(lastFrame() ?? "").toContain("#c026d3");
    stdin.write("\x1b[B");
    await tick();
    expect(onChange).toHaveBeenCalledWith("#7c3aed");
    stdin.write("\r");
    await tick();
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("LayoutStep", () => {
  test("offers density/sidebar combos, emits the combo on nav, advances", async () => {
    const onChange = mock((_v: LayoutChoice) => {});
    const onNext = mock(() => {});
    const { stdin, lastFrame } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <LayoutStep
          value={{ density: "comfortable", sidebar: true }}
          onChange={onChange}
          onNext={onNext}
          onBack={() => {}}
        />
      </ThemeProvider>,
    );
    const f = lastFrame() ?? "";
    expect(f).toContain("Comfortable");
    expect(f).toContain("Compact");
    stdin.write("\x1b[B");
    await tick();
    expect(onChange).toHaveBeenCalledWith({ density: "comfortable", sidebar: false });
    stdin.write("\r");
    await tick();
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});

describe("GlyphStep", () => {
  test("shows both icon samples + the note when unlikely, emits on nav, advances", async () => {
    const onChange = mock((_v: GlyphChoice) => {});
    const onNext = mock(() => {});
    const value: GlyphChoice = { glyphs: "nerd", logo: "block", borders: "unicode" };
    const { stdin, lastFrame } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <GlyphStep value={value} onChange={onChange} onNext={onNext} onBack={() => {}} detect={() => "unlikely"} />
      </ThemeProvider>,
    );
    const f = lastFrame() ?? "";
    expect(f).toContain("Nerd");
    expect(f).toContain("ASCII");
    expect(f).toContain("No Nerd Font detected");
    stdin.write("\x1b[B");
    await tick();
    expect(onChange).toHaveBeenCalledWith({ glyphs: "ascii", logo: "ascii", borders: "ascii" });
    stdin.write("\r");
    await tick();
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  test("hides the note when a Nerd Font is likely", () => {
    const { lastFrame } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <GlyphStep
          value={{ glyphs: "nerd", logo: "block", borders: "unicode" }}
          onChange={() => {}}
          onNext={() => {}}
          onBack={() => {}}
          detect={() => "likely"}
        />
      </ThemeProvider>,
    );
    expect(lastFrame() ?? "").not.toContain("No Nerd Font detected");
  });
});

describe("ConnectorStep", () => {
  test("lists ENV_KEYS providers, marks env-detected, emits on nav, advances", async () => {
    const onChange = mock((_v: string) => {});
    const onNext = mock(() => {});
    const { stdin, lastFrame } = render(
      <ThemeProvider prefs={DEFAULT_PREFS}>
        <ConnectorStep
          value="anthropic"
          onChange={onChange}
          onNext={onNext}
          onBack={() => {}}
          env={{ OPENAI_API_KEY: "sk-xxxxxxxxxxxxxxxx" }}
        />
      </ThemeProvider>,
    );
    const f = lastFrame() ?? "";
    for (const p of Object.keys(ENV_KEYS)) expect(f).toContain(p);
    expect(f).toContain("detected"); // openai satisfied by env
    stdin.write("\x1b[B"); // down → openai (Object.keys order)
    await tick();
    expect(onChange).toHaveBeenCalledWith("openai");
    stdin.write("\r");
    await tick();
    expect(onNext).toHaveBeenCalledTimes(1);
  });
});
