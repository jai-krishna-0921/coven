/**
 * Onboarding wizard step components (§13). Each step is a controlled
 * single-select over its choices with a shared {@link StepProps} contract:
 * up/down move the highlight and emit the new value via `onChange`, `enter`
 * advances (`onNext`), `esc` goes back (`onBack`). Selection is tracked
 * internally (initialised from the controlled `value`) so compound values need
 * no structural equality. `ThemeStep` renders a live preview strip; `GlyphStep`
 * shows both icon families plus a Nerd-Font note; `ConnectorStep` marks
 * env-satisfied providers.
 */
import { useState } from "react";
import { Box, Text, useInput } from "ink";
import { useTheme } from "../context.tsx";
import { THEMES, DEFAULT_THEME, type Theme } from "../theme.ts";
import { ICONS } from "../glyphs.ts";
import { ENV_KEYS } from "../../auth/index.ts";
import { detectNerdFont, type NerdFontLikelihood } from "./nerdfont.ts";

/** Controlled contract every wizard step shares. */
export interface StepProps<T> {
  value: T;
  onChange(value: T): void;
  onNext(): void;
  onBack(): void;
}

export interface LayoutChoice {
  density: "comfortable" | "compact";
  sidebar: boolean;
}

export interface GlyphChoice {
  glyphs: "nerd" | "ascii";
  logo: "block" | "ascii";
  borders: "unicode" | "ascii";
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(Math.max(n, lo), hi);
}

/**
 * Shared list navigation for a step: up/down (or ctrl+p/ctrl+n) move the
 * highlight and emit the new index via `onSelect`; `enter` advances; `esc`
 * backs out. Returns the current internal index for rendering.
 */
function useChoiceNav(o: {
  count: number;
  initial: number;
  onSelect(index: number): void;
  onNext(): void;
  onBack(): void;
}): number {
  const [index, setIndex] = useState(clamp(o.initial, 0, Math.max(0, o.count - 1)));
  useInput((input, key) => {
    if (key.escape) {
      o.onBack();
      return;
    }
    if (key.return) {
      o.onNext();
      return;
    }
    if (key.downArrow || (key.ctrl && input === "n")) {
      const next = clamp(index + 1, 0, o.count - 1);
      setIndex(next);
      o.onSelect(next);
      return;
    }
    if (key.upArrow || (key.ctrl && input === "p")) {
      const next = clamp(index - 1, 0, o.count - 1);
      setIndex(next);
      o.onSelect(next);
    }
  });
  return index;
}

/** A single highlightable list row painted with the theme selection colors. */
function Row({ label, selected }: { label: string; selected: boolean }) {
  const { theme, icons } = useTheme();
  return (
    <Text
      backgroundColor={selected ? theme.selectionBg : undefined}
      color={selected ? theme.selectionFg : theme.fg}
    >
      {selected ? icons.arrow : " "} {label}
    </Text>
  );
}

const THEME_NAMES = Object.keys(THEMES);

export function ThemeStep({ value, onChange, onNext, onBack }: StepProps<string>) {
  const { theme, borders, icons } = useTheme();
  const index = useChoiceNav({
    count: THEME_NAMES.length,
    initial: Math.max(0, THEME_NAMES.indexOf(value)),
    onSelect: (i) => {
      const name = THEME_NAMES[i];
      if (name) onChange(name);
    },
    onNext,
    onBack,
  });
  const previewName = THEME_NAMES[index] ?? value;
  const preview: Theme = THEMES[previewName] ?? THEMES[DEFAULT_THEME];
  return (
    <Box flexDirection="column">
      <Text color={theme.accent} bold>
        Choose a theme
      </Text>
      {THEME_NAMES.map((name, i) => (
        <Row key={name} label={THEMES[name]?.label ?? name} selected={i === index} />
      ))}
      <Box
        flexDirection="column"
        borderStyle={borders as "round" | "classic"}
        borderColor={preview.border}
        paddingX={1}
        marginTop={1}
      >
        <Text color={preview.accent}>{icons.agent} coven</Text>
        <Text color={preview.roleUser}>you   fix the failing test</Text>
        <Text color={preview.roleAssistant}>coven on it</Text>
        <Text color={preview.tool}>{icons.tool} read src/index.ts</Text>
      </Box>
      <Text color={theme.fgSubtle}>Preview: {preview.label}</Text>
      <Text color={theme.fgSubtle}>↑↓ preview · enter next · esc back</Text>
    </Box>
  );
}

/** Curated accent swatches offered alongside the current (theme-default) value. */
const ACCENT_PALETTE = [
  "#c026d3",
  "#7c3aed",
  "#2563eb",
  "#0891b2",
  "#059669",
  "#d97706",
  "#dc2626",
  "#db2777",
];

export function AccentStep({ value, onChange, onNext, onBack }: StepProps<string>) {
  const { theme, icons } = useTheme();
  // The current value always leads the list so the theme default is selectable.
  const options = [value, ...ACCENT_PALETTE.filter((c) => c !== value)];
  const index = useChoiceNav({
    count: options.length,
    initial: 0,
    onSelect: (i) => {
      const hex = options[i];
      if (hex) onChange(hex);
    },
    onNext,
    onBack,
  });
  const current = options[index] ?? value;
  return (
    <Box flexDirection="column">
      <Text color={current} bold>
        Choose an accent
      </Text>
      {options.map((hex, i) => (
        <Text
          key={hex}
          backgroundColor={i === index ? theme.selectionBg : undefined}
          color={i === index ? theme.selectionFg : theme.fg}
        >
          {i === index ? icons.arrow : " "} <Text color={hex}>{icons.bullet}{icons.bullet}</Text> {hex}
        </Text>
      ))}
      <Text color={theme.fgSubtle}>↑↓ change · enter next · esc back</Text>
    </Box>
  );
}

const LAYOUT_OPTIONS: { label: string; value: LayoutChoice }[] = [
  { label: "Comfortable · sidebar on", value: { density: "comfortable", sidebar: true } },
  { label: "Comfortable · sidebar off", value: { density: "comfortable", sidebar: false } },
  { label: "Compact · sidebar on", value: { density: "compact", sidebar: true } },
  { label: "Compact · sidebar off", value: { density: "compact", sidebar: false } },
];

export function LayoutStep({ value, onChange, onNext, onBack }: StepProps<LayoutChoice>) {
  const { theme } = useTheme();
  const initial = LAYOUT_OPTIONS.findIndex(
    (o) => o.value.density === value.density && o.value.sidebar === value.sidebar,
  );
  const index = useChoiceNav({
    count: LAYOUT_OPTIONS.length,
    initial: Math.max(0, initial),
    onSelect: (i) => {
      const o = LAYOUT_OPTIONS[i];
      if (o) onChange(o.value);
    },
    onNext,
    onBack,
  });
  return (
    <Box flexDirection="column">
      <Text color={theme.accent} bold>
        Layout & density
      </Text>
      {LAYOUT_OPTIONS.map((o, i) => (
        <Row key={o.label} label={o.label} selected={i === index} />
      ))}
      <Text color={theme.fgSubtle}>↑↓ change · enter next · esc back</Text>
    </Box>
  );
}

const GLYPH_OPTIONS: { label: string; value: GlyphChoice }[] = [
  { label: "Nerd Font icons", value: { glyphs: "nerd", logo: "block", borders: "unicode" } },
  { label: "ASCII (universal)", value: { glyphs: "ascii", logo: "ascii", borders: "ascii" } },
];

const NERD_NOTE =
  "No Nerd Font detected — glyph icons may render as boxes. Install one (e.g. nerd-fonts) and set it in your terminal; Coven can't change the font for you.";

export function GlyphStep({
  value,
  onChange,
  onNext,
  onBack,
  detect = detectNerdFont,
}: StepProps<GlyphChoice> & { detect?: () => NerdFontLikelihood }) {
  const { theme } = useTheme();
  const initial = GLYPH_OPTIONS.findIndex((o) => o.value.glyphs === value.glyphs);
  const index = useChoiceNav({
    count: GLYPH_OPTIONS.length,
    initial: Math.max(0, initial),
    onSelect: (i) => {
      const o = GLYPH_OPTIONS[i];
      if (o) onChange(o.value);
    },
    onNext,
    onBack,
  });
  const likelihood = detect();
  const nerd = ICONS.nerd;
  const ascii = ICONS.ascii;
  return (
    <Box flexDirection="column">
      <Text color={theme.accent} bold>
        Icon style
      </Text>
      {GLYPH_OPTIONS.map((o, i) => (
        <Row key={o.label} label={o.label} selected={i === index} />
      ))}
      <Box flexDirection="column" marginTop={1}>
        <Text color={theme.fgMuted}>
          Nerd:  {nerd.ok} {nerd.err} {nerd.tool} {nerd.agent} {nerd.prompt}
        </Text>
        <Text color={theme.fgMuted}>
          ASCII: {ascii.ok} {ascii.err} {ascii.tool} {ascii.agent} {ascii.prompt}
        </Text>
      </Box>
      {likelihood === "unlikely" ? <Text color={theme.warning}>{NERD_NOTE}</Text> : null}
      <Text color={theme.fgSubtle}>↑↓ change · enter next · esc back</Text>
    </Box>
  );
}

const CONNECTOR_SKIP = "skip";
const CONNECTOR_OPTIONS = [...Object.keys(ENV_KEYS), CONNECTOR_SKIP];

export function ConnectorStep({
  value,
  onChange,
  onNext,
  onBack,
  env = process.env,
}: StepProps<string> & { env?: NodeJS.ProcessEnv }) {
  const { theme, icons } = useTheme();
  const index = useChoiceNav({
    count: CONNECTOR_OPTIONS.length,
    initial: Math.max(0, CONNECTOR_OPTIONS.indexOf(value)),
    onSelect: (i) => {
      const name = CONNECTOR_OPTIONS[i];
      if (name) onChange(name);
    },
    onNext,
    onBack,
  });
  return (
    <Box flexDirection="column">
      <Text color={theme.accent} bold>
        Connect a provider
      </Text>
      {CONNECTOR_OPTIONS.map((name, i) => {
        const selected = i === index;
        const envName = ENV_KEYS[name];
        const detected = envName !== undefined && (env[envName]?.length ?? 0) > 0;
        const label = name === CONNECTOR_SKIP ? "skip for now" : name;
        return (
          <Text
            key={name}
            backgroundColor={selected ? theme.selectionBg : undefined}
            color={selected ? theme.selectionFg : theme.fg}
          >
            {selected ? icons.arrow : " "} {label}
            {detected ? (
              <Text color={theme.success}>
                {" "}
                {icons.ok} detected
              </Text>
            ) : (
              ""
            )}
          </Text>
        );
      })}
      <Text color={theme.fgSubtle}>↑↓ change · enter select · esc back</Text>
    </Box>
  );
}
