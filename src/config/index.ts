/**
 * Config discovery and merge.
 * Sources, lowest → highest precedence:
 *   1. built-in defaults
 *   2. global   ~/.config/coven/coven.json
 *   3. project  coven.json / coven.jsonc found walking UP from cwd (nearest wins)
 * Objects deep-merge; arrays (instructions, plugins, skill paths) union; scalars override.
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { homedir } from "node:os";
import { createLogger } from "../util/log.ts";
import { CovenConfig } from "./schema.ts";

const log = createLogger("config");

export interface LoadedConfig {
  config: CovenConfig;
  /** Directories containing config files, nearest last — used to resolve relative paths. */
  sources: string[];
  /** Workspace root: directory of the nearest project config, else cwd. */
  root: string;
}

function stripJsonComments(text: string): string {
  // Handles // and /* */ outside of strings. Good enough for config files.
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];
    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") {
        out += next ?? "";
        i++;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i++;
      continue;
    }
    // Tolerate a trailing comma before a closing } or ] (common jsonc mistake).
    if (ch === ",") {
      let j = i + 1;
      while (j < text.length && /\s/.test(text[j]!)) j++;
      if (text[j] === "}" || text[j] === "]") continue;
    }
    out += ch;
  }
  return out;
}

/**
 * Read + validate one config file. NEVER throws: a malformed or invalid file is
 * logged and skipped (returns null), so one stray comma or typo can't brick
 * every command — the tool degrades to defaults instead.
 */
function readConfigFile(path: string): CovenConfig | null {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    log.warn(`ignoring config (unreadable): ${path}: ${String(error)}`);
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stripJsonComments(raw));
  } catch (error) {
    log.warn(`ignoring config (not valid JSON): ${path}: ${String(error)}`);
    return null;
  }
  const result = CovenConfig.safeParse(parsed);
  if (!result.success) {
    const issue = result.error.issues[0];
    log.warn(`ignoring config (invalid): ${path}: ${issue?.path.join(".") ?? "?"}: ${issue?.message ?? "invalid"}`);
    return null;
  }
  return result.data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function deepMerge<T>(base: T, override: T): T {
  if (Array.isArray(base) && Array.isArray(override)) {
    return [...new Set([...base, ...override])] as T;
  }
  if (isRecord(base) && isRecord(override)) {
    const out: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(override)) {
      out[key] = key in out ? deepMerge(out[key], value) : value;
    }
    return out as T;
  }
  return override;
}

function findProjectConfig(startDir: string): string | undefined {
  let dir = resolve(startDir);
  while (true) {
    for (const name of ["coven.json", "coven.jsonc"]) {
      const candidate = join(dir, name);
      if (existsSync(candidate)) return candidate;
    }
    const parent = dirname(dir);
    if (parent === dir) return undefined;
    dir = parent;
  }
}

export function loadConfig(cwd: string = process.cwd()): LoadedConfig {
  const sources: string[] = [];
  let merged: CovenConfig = {};

  const globalPath = join(homedir(), ".config", "coven", "coven.json");
  if (existsSync(globalPath)) {
    const cfg = readConfigFile(globalPath);
    if (cfg) {
      merged = deepMerge(merged, cfg);
      sources.push(dirname(globalPath));
    }
  }

  const projectPath = findProjectConfig(cwd);
  if (projectPath) {
    const cfg = readConfigFile(projectPath);
    if (cfg) {
      merged = deepMerge(merged, cfg);
      sources.push(dirname(projectPath));
    }
  }

  return {
    config: merged,
    sources,
    root: projectPath ? dirname(projectPath) : resolve(cwd),
  };
}
