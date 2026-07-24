import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";

export interface UiPrefs {
  version: 1;
  onboarded: boolean;
  theme: string;
  accent?: string;
  density: "comfortable" | "compact";
  sidebar: boolean;
  glyphs: "nerd" | "ascii";
  logo: "block" | "ascii";
  borders: "unicode" | "ascii";
  recentModels: string[];
  /** Show <thinking> blocks in the transcript. Toggle via /thinking. */
  showThinking: boolean;
  /** Prefix each message with its wall-clock time. Toggle via /timestamps. */
  showTimestamps: boolean;
}

export const DEFAULT_PREFS: UiPrefs = {
  version: 1, onboarded: false, theme: "coven-dark",
  density: "comfortable", sidebar: true, glyphs: "ascii",
  logo: "block", borders: "unicode", recentModels: [],
  showThinking: true, showTimestamps: false,
};

export function prefsPath(dir: string = join(homedir(), ".local", "share", "coven")): string {
  return join(dir, "tui.json");
}

export function loadPrefs(dir?: string): UiPrefs {
  try {
    const raw = JSON.parse(readFileSync(prefsPath(dir), "utf8")) as Partial<UiPrefs>;
    return { ...DEFAULT_PREFS, ...raw, version: 1 };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

export function savePrefs(p: UiPrefs, dir?: string): void {
  const file = prefsPath(dir);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(p, null, 2), { mode: 0o600 });
}
