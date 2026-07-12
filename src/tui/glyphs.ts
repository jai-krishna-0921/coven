/**
 * Glyph, border, and logo sets. Two icon families: `nerd` (Nerd-Font glyphs)
 * and `ascii` (plain, renders everywhere). `BORDERS` values map to Ink
 * `borderStyle` names. Selected via UiPrefs (glyphs/borders/logo).
 */
export interface IconSet {
  ok: string;
  err: string;
  warn: string;
  info: string;
  tool: string;
  agent: string;
  bullet: string;
  arrow: string;
  prompt: string;
  sidebar: string;
  context: string;
  spinner: string[];
}

export const ICONS: Record<"nerd" | "ascii", IconSet> = {
  ascii: {
    ok: "✓",
    err: "✗",
    warn: "!",
    info: "i",
    tool: "›",
    agent: "◆",
    bullet: "•",
    arrow: "›",
    prompt: "❯",
    sidebar: "▏",
    context: "▤",
    spinner: ["|", "/", "-", "\\"],
  },
  nerd: {
    ok: "\u{f00c}",
    err: "\u{f00d}",
    warn: "\u{f071}",
    info: "\u{f05a}",
    tool: "\u{f0ad}",
    agent: "\u{f219}",
    bullet: "\u{f111}",
    arrow: "\u{f054}",
    prompt: "\u{f105}",
    sidebar: "\u{f0c9}",
    context: "\u{f1c0}",
    spinner: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
  },
};

/** Ink `borderStyle` names for the two border families. */
export const BORDERS: Record<"unicode" | "ascii", string> = {
  unicode: "round",
  ascii: "classic",
};

const LOGO_BLOCK = [
  " ██████╗ ██████╗ ██╗   ██╗███████╗███╗   ██╗",
  "██╔════╝██╔═══██╗██║   ██║██╔════╝████╗  ██║",
  "██║     ██║   ██║██║   ██║█████╗  ██╔██╗ ██║",
  "██║     ██║   ██║╚██╗ ██╔╝██╔══╝  ██║╚██╗██║",
  "╚██████╗╚██████╔╝ ╚████╔╝ ███████╗██║ ╚████║",
  " ╚═════╝ ╚═════╝   ╚═══╝  ╚══════╝╚═╝  ╚═══╝",
].join("\n");

export const LOGO: Record<"block" | "ascii", string> = {
  block: LOGO_BLOCK,
  ascii: "c o v e n",
};
