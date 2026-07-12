/**
 * Best-effort Nerd Font detection (§13). A terminal application cannot reliably
 * enumerate installed fonts, so this inspects environment hints only — an
 * explicit `*NERD*` marker, the terminal program/emulator, and `TERM`. It never
 * throws and only informs the onboarding default choice and its note; it never
 * blocks the flow.
 */
export type NerdFontLikelihood = "likely" | "unlikely" | "unknown";

/**
 * `TERM_PROGRAM` / `LC_TERMINAL` emulators that are modern and commonly
 * configured with a Nerd Font. Compared lower-cased.
 */
const NERD_LIKELY_PROGRAMS = new Set<string>([
  "wezterm",
  "iterm.app",
  "iterm2",
  "ghostty",
  "kitty",
  "alacritty",
  "rio",
  "tabby",
  "hyper",
  "wave",
  "warpterminal",
]);

/** `TERM` values that indicate a capable, commonly Nerd-Font-configured emulator. */
const NERD_LIKELY_TERMS = new Set<string>([
  "wezterm",
  "xterm-kitty",
  "alacritty",
  "foot",
  "foot-extra",
  "contour",
  "ghostty",
  "rio",
]);

/** `TERM` values that cannot render Nerd glyphs at all. */
const POOR_TERMS = new Set<string>([
  "dumb",
  "linux",
  "vt100",
  "vt102",
  "vt220",
  "cons25",
  "ansi",
]);

/**
 * Classify how likely the current terminal is to render Nerd Font glyphs.
 * Precedence: an explicit `NERD` env marker wins, then a known-poor `TERM`,
 * then a known Nerd-friendly emulator, else `"unknown"`.
 */
export function detectNerdFont(env: NodeJS.ProcessEnv = process.env): NerdFontLikelihood {
  try {
    // 1. Explicit Nerd-Font marker in any env key (or a "nerd font" value) — the
    //    strongest signal the user has intentionally set one up.
    for (const [key, value] of Object.entries(env)) {
      if (/nerd/i.test(key)) return "likely";
      if (typeof value === "string" && /nerd[\s_-]?font/i.test(value)) return "likely";
    }

    const term = (env["TERM"] ?? "").toLowerCase();
    const program = (env["TERM_PROGRAM"] ?? "").toLowerCase();
    const lcTerminal = (env["LC_TERMINAL"] ?? "").toLowerCase();

    // 2. Known-poor terminals cannot render glyphs, regardless of program.
    if (POOR_TERMS.has(term)) return "unlikely";

    // 3. Known Nerd-Font-friendly emulators.
    if (program.length > 0 && NERD_LIKELY_PROGRAMS.has(program)) return "likely";
    if (lcTerminal.length > 0 && NERD_LIKELY_PROGRAMS.has(lcTerminal)) return "likely";
    if (term.length > 0 && NERD_LIKELY_TERMS.has(term)) return "likely";

    // 4. No usable signal either way.
    return "unknown";
  } catch {
    return "unknown";
  }
}
