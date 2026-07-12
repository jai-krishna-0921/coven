/**
 * React glue for the TUI: two contexts wired to the pure logic from Phase 1–2.
 *
 * `ThemeProvider`/`useTheme` derive the active {@link Theme} + glyph/border/logo
 * sets from {@link UiPrefs}. `UiProvider`/`useUi`/`useStore` bridge the imperative
 * {@link UiStore} into React via `useSyncExternalStore`, so snapshot identity
 * changes drive re-renders.
 */
import { createContext, useContext, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { NamedError } from "../util/error.ts";
import { DEFAULT_THEME, THEMES, type Theme } from "./theme.ts";
import { BORDERS, ICONS, LOGO, type IconSet } from "./glyphs.ts";
import type { UiPrefs } from "./prefs.ts";
import type { UiStore } from "./store.ts";
import type { UiState } from "./types.ts";

export class TuiContextError extends NamedError {
  override readonly name = "TuiContextError";
  constructor(readonly detail: string) {
    super(detail);
  }
}

export interface ThemeContextValue {
  theme: Theme;
  icons: IconSet;
  borders: string;
  logo: string;
  density: UiPrefs["density"];
}

const ThemeCtx = createContext<ThemeContextValue | null>(null);
const StoreCtx = createContext<UiStore | null>(null);

/** Resolve the concrete theme + glyphs/borders/logo the prefs select. */
function resolveTheme(prefs: UiPrefs): ThemeContextValue {
  const base = THEMES[prefs.theme] ?? THEMES[DEFAULT_THEME];
  const theme: Theme = prefs.accent ? { ...base, accent: prefs.accent } : base;
  return {
    theme,
    icons: ICONS[prefs.glyphs],
    borders: BORDERS[prefs.borders],
    logo: LOGO[prefs.logo],
    density: prefs.density,
  };
}

export function ThemeProvider({ prefs, children }: { prefs: UiPrefs; children?: ReactNode }) {
  return <ThemeCtx.Provider value={resolveTheme(prefs)}>{children}</ThemeCtx.Provider>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeCtx);
  if (!value) throw new TuiContextError("useTheme must be used within a ThemeProvider");
  return value;
}

export function UiProvider({ store, children }: { store: UiStore; children?: ReactNode }) {
  return <StoreCtx.Provider value={store}>{children}</StoreCtx.Provider>;
}

export function useStore(): UiStore {
  const store = useContext(StoreCtx);
  if (!store) throw new TuiContextError("useStore must be used within a UiProvider");
  return store;
}

export function useUi(): UiState {
  const store = useStore();
  return useSyncExternalStore(
    (cb) => store.subscribe(cb),
    () => store.getSnapshot(),
  );
}
