/**
 * First-run onboarding wizard (§13). A top-level route (not a modal) rendered
 * when prefs are not yet `onboarded` (or on `/onboarding` re-run). Five steps —
 * theme, accent, layout/density, glyphs, connector — collected by a step-index
 * state machine. `enter` advances, `esc` goes back, `ctrl+c` skips all (writes
 * defaults + `onboarded`). On the connector step, choosing a provider opens a
 * masked key prompt whose value is stored via `ctx.app.auth.set`; finishing
 * persists the collected prefs through `ctx.setPrefs` and calls `onDone`.
 *
 * The wizard nests its own {@link ThemeProvider} fed by the in-progress choices,
 * so theme/accent/glyph selections re-colour the whole wizard live.
 */
import { useState } from "react";
import type { ReactNode } from "react";
import { Box, Text, useInput } from "ink";
import { ThemeProvider } from "../context.tsx";
import { THEMES, DEFAULT_THEME } from "../theme.ts";
import { ENV_KEYS } from "../../auth/index.ts";
import { DEFAULT_PREFS, type UiPrefs } from "../prefs.ts";
import type { CommandContext } from "../types.ts";
import { Prompt } from "../dialogs/Prompt.tsx";
import { detectNerdFont } from "./nerdfont.ts";
import {
  ThemeStep,
  AccentStep,
  LayoutStep,
  GlyphStep,
  ConnectorStep,
  type LayoutChoice,
  type GlyphChoice,
} from "./steps.tsx";

const STEP_COUNT = 5;
const LAST_STEP = STEP_COUNT - 1;
const CONNECTOR_SKIP = "skip";

export function OnboardingWizard({ ctx, onDone }: { ctx: CommandContext; onDone(): void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [theme, setTheme] = useState(ctx.prefs.theme);
  const [accent, setAccent] = useState(
    ctx.prefs.accent ?? THEMES[ctx.prefs.theme]?.accent ?? THEMES[DEFAULT_THEME].accent,
  );
  const [layout, setLayout] = useState<LayoutChoice>({
    density: ctx.prefs.density,
    sidebar: ctx.prefs.sidebar,
  });
  const [glyph, setGlyph] = useState<GlyphChoice>(() =>
    detectNerdFont() === "likely"
      ? { glyphs: "nerd", logo: "block", borders: "unicode" }
      : { glyphs: "ascii", logo: "ascii", borders: "ascii" },
  );
  const [connector, setConnector] = useState<string>(Object.keys(ENV_KEYS)[0] ?? CONNECTOR_SKIP);
  const [enteringKey, setEnteringKey] = useState<string | null>(null);

  const localPrefs: UiPrefs = {
    ...ctx.prefs,
    theme,
    accent,
    density: layout.density,
    sidebar: layout.sidebar,
    glyphs: glyph.glyphs,
    logo: glyph.logo,
    borders: glyph.borders,
  };

  const next = () => setStepIndex((i) => Math.min(i + 1, LAST_STEP));
  const back = () => setStepIndex((i) => Math.max(i - 1, 0));

  const finish = (prefsToSave: UiPrefs) => {
    ctx.setPrefs({ ...prefsToSave, onboarded: true });
    onDone();
  };

  const connectorNext = () => {
    if (connector !== CONNECTOR_SKIP && ENV_KEYS[connector] !== undefined) {
      setEnteringKey(connector);
    } else {
      finish(localPrefs);
    }
  };

  const submitKey = (key: string) => {
    const provider = enteringKey;
    if (provider && key.trim().length > 0) ctx.app.auth?.set(provider, key);
    finish(localPrefs);
  };

  // ctrl+c skips the whole flow: persist defaults so first run is not blocked.
  useInput((input, key) => {
    if (key.ctrl && input === "c") finish({ ...DEFAULT_PREFS });
  });

  let body: ReactNode;
  if (stepIndex === 0) {
    body = <ThemeStep value={theme} onChange={setTheme} onNext={next} onBack={back} />;
  } else if (stepIndex === 1) {
    body = <AccentStep value={accent} onChange={setAccent} onNext={next} onBack={back} />;
  } else if (stepIndex === 2) {
    body = <LayoutStep value={layout} onChange={setLayout} onNext={next} onBack={back} />;
  } else if (stepIndex === 3) {
    body = <GlyphStep value={glyph} onChange={setGlyph} onNext={next} onBack={back} />;
  } else if (enteringKey === null) {
    body = <ConnectorStep value={connector} onChange={setConnector} onNext={connectorNext} onBack={back} />;
  } else {
    body = (
      <Prompt
        message={`Enter ${ENV_KEYS[enteringKey] ?? "API key"} for ${enteringKey}`}
        mask
        onSubmit={submitKey}
        onCancel={() => setEnteringKey(null)}
      />
    );
  }

  return (
    <ThemeProvider prefs={localPrefs}>
      <Box flexDirection="column" paddingX={1}>
        <Text>
          Welcome to Coven · setup {Math.min(stepIndex + 1, STEP_COUNT)} of {STEP_COUNT} · ctrl+c to skip
        </Text>
        {body}
      </Box>
    </ThemeProvider>
  );
}
