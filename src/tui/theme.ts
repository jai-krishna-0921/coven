/**
 * Theme registry. Each theme defines the full 24-token palette (§11.1) plus
 * metadata (name/label/mode and an optional light/dark sibling). The
 * ThemeProvider/useTheme React context that consumes this lands in Task 15.
 */
export interface Theme {
  name: string;
  label: string;
  mode: "dark" | "light";
  /** Sibling theme to switch to for light mode (set on dark themes). */
  light?: string;
  /** Sibling theme to switch to for dark mode (set on light themes). */
  dark?: string;
  bg: string;
  bgPanel: string;
  bgOverlay: string;
  fg: string;
  fgMuted: string;
  fgSubtle: string;
  border: string;
  borderFocus: string;
  accent: string;
  accentAlt: string;
  success: string;
  warning: string;
  error: string;
  info: string;
  roleUser: string;
  roleAssistant: string;
  agent: string;
  tool: string;
  toolOk: string;
  toolErr: string;
  diffAdd: string;
  diffDel: string;
  selectionBg: string;
  selectionFg: string;
}

export const DEFAULT_THEME = "coven-dark";

/**
 * A string-indexable registry (dynamic lookups like `THEMES[prefs.theme]` stay
 * `Theme | undefined` under `noUncheckedIndexedAccess`) whose built-in siblings
 * are known-present, so `THEMES["coven-dark"].light` needs no guard.
 */
export type ThemeRegistry = Record<string, Theme> & { "coven-dark": Theme; "coven-light": Theme };

export const THEMES: ThemeRegistry = {
  "coven-dark": {
    name: "coven-dark", label: "Coven Dark", mode: "dark", light: "coven-light",
    bg: "#0d1117", bgPanel: "#161b22", bgOverlay: "#1c2128",
    fg: "#e6edf3", fgMuted: "#9da7b3", fgSubtle: "#6e7681",
    border: "#30363d", borderFocus: "#c026d3",
    accent: "#c026d3", accentAlt: "#7c3aed",
    success: "#3fb950", warning: "#d29922", error: "#f85149", info: "#58a6ff",
    roleUser: "#58a6ff", roleAssistant: "#c026d3",
    agent: "#a371f7", tool: "#8b949e", toolOk: "#3fb950", toolErr: "#f85149",
    diffAdd: "#2ea043", diffDel: "#da3633",
    selectionBg: "#264f78", selectionFg: "#e6edf3",
  },
  "coven-light": {
    name: "coven-light", label: "Coven Light", mode: "light", dark: "coven-dark",
    bg: "#faf9fb", bgPanel: "#f0eef2", bgOverlay: "#e8e6ec",
    fg: "#1c1a20", fgMuted: "#565161", fgSubtle: "#8a8595",
    border: "#d8d4de", borderFocus: "#a21caf",
    accent: "#a21caf", accentAlt: "#7c3aed",
    success: "#1a7f37", warning: "#9a6700", error: "#cf222e", info: "#0969da",
    roleUser: "#0969da", roleAssistant: "#a21caf",
    agent: "#8250df", tool: "#656d76", toolOk: "#1a7f37", toolErr: "#cf222e",
    diffAdd: "#1a7f37", diffDel: "#cf222e",
    selectionBg: "#c8e1ff", selectionFg: "#1c1a20",
  },
  "catppuccin-mocha": {
    name: "catppuccin-mocha", label: "Catppuccin Mocha", mode: "dark",
    bg: "#1e1e2e", bgPanel: "#181825", bgOverlay: "#313244",
    fg: "#cdd6f4", fgMuted: "#a6adc8", fgSubtle: "#7f849c",
    border: "#45475a", borderFocus: "#cba6f7",
    accent: "#cba6f7", accentAlt: "#f5c2e7",
    success: "#a6e3a1", warning: "#f9e2af", error: "#f38ba8", info: "#89b4fa",
    roleUser: "#89b4fa", roleAssistant: "#cba6f7",
    agent: "#b4befe", tool: "#94e2d5", toolOk: "#a6e3a1", toolErr: "#f38ba8",
    diffAdd: "#a6e3a1", diffDel: "#f38ba8",
    selectionBg: "#585b70", selectionFg: "#cdd6f4",
  },
  "tokyo-night": {
    name: "tokyo-night", label: "Tokyo Night", mode: "dark",
    bg: "#1a1b26", bgPanel: "#16161e", bgOverlay: "#24283b",
    fg: "#c0caf5", fgMuted: "#9aa5ce", fgSubtle: "#565f89",
    border: "#3b4261", borderFocus: "#7aa2f7",
    accent: "#7aa2f7", accentAlt: "#bb9af7",
    success: "#9ece6a", warning: "#e0af68", error: "#f7768e", info: "#7dcfff",
    roleUser: "#7dcfff", roleAssistant: "#7aa2f7",
    agent: "#bb9af7", tool: "#73daca", toolOk: "#9ece6a", toolErr: "#f7768e",
    diffAdd: "#9ece6a", diffDel: "#f7768e",
    selectionBg: "#283457", selectionFg: "#c0caf5",
  },
  "gruvbox-dark": {
    name: "gruvbox-dark", label: "Gruvbox Dark", mode: "dark",
    bg: "#282828", bgPanel: "#1d2021", bgOverlay: "#3c3836",
    fg: "#ebdbb2", fgMuted: "#bdae93", fgSubtle: "#928374",
    border: "#504945", borderFocus: "#fabd2f",
    accent: "#fabd2f", accentAlt: "#fe8019",
    success: "#b8bb26", warning: "#fabd2f", error: "#fb4934", info: "#83a598",
    roleUser: "#83a598", roleAssistant: "#fabd2f",
    agent: "#d3869b", tool: "#8ec07c", toolOk: "#b8bb26", toolErr: "#fb4934",
    diffAdd: "#b8bb26", diffDel: "#fb4934",
    selectionBg: "#504945", selectionFg: "#ebdbb2",
  },
  "dracula": {
    name: "dracula", label: "Dracula", mode: "dark",
    bg: "#282a36", bgPanel: "#21222c", bgOverlay: "#343746",
    fg: "#f8f8f2", fgMuted: "#bfbfd0", fgSubtle: "#6272a4",
    border: "#44475a", borderFocus: "#bd93f9",
    accent: "#bd93f9", accentAlt: "#ff79c6",
    success: "#50fa7b", warning: "#f1fa8c", error: "#ff5555", info: "#8be9fd",
    roleUser: "#8be9fd", roleAssistant: "#bd93f9",
    agent: "#ff79c6", tool: "#6272a4", toolOk: "#50fa7b", toolErr: "#ff5555",
    diffAdd: "#50fa7b", diffDel: "#ff5555",
    selectionBg: "#44475a", selectionFg: "#f8f8f2",
  },
  "nord": {
    name: "nord", label: "Nord", mode: "dark",
    bg: "#2e3440", bgPanel: "#272c36", bgOverlay: "#3b4252",
    fg: "#eceff4", fgMuted: "#d8dee9", fgSubtle: "#7b88a1",
    border: "#434c5e", borderFocus: "#88c0d0",
    accent: "#88c0d0", accentAlt: "#81a1c1",
    success: "#a3be8c", warning: "#ebcb8b", error: "#bf616a", info: "#5e81ac",
    roleUser: "#81a1c1", roleAssistant: "#88c0d0",
    agent: "#b48ead", tool: "#8fbcbb", toolOk: "#a3be8c", toolErr: "#bf616a",
    diffAdd: "#a3be8c", diffDel: "#bf616a",
    selectionBg: "#434c5e", selectionFg: "#eceff4",
  },
};
