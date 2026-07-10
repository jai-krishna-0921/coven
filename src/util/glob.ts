/**
 * Dependency-free glob walker — replaces Bun.Glob so the published bundle runs
 * under plain Node. Supports: `**` (any depth), `*` (within a segment), `?`
 * (one char), `{a,b}` alternation. Skips node_modules/.git at any depth.
 */
import { readdirSync } from "node:fs";
import { join } from "node:path";

const SKIP_DIRS = new Set(["node_modules", ".git", "dist", ".cache", "__pycache__"]);

function segmentToRegex(segment: string): string {
  let out = "";
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i]!;
    if (ch === "*") out += "[^/]*";
    else if (ch === "?") out += "[^/]";
    else if (ch === "{") {
      const end = segment.indexOf("}", i);
      if (end === -1) {
        out += "\\{";
        continue;
      }
      const alternatives = segment.slice(i + 1, end).split(",");
      out += `(?:${alternatives.map((a) => a.replace(/[.+^${}()|[\]\\*?]/g, "\\$&")).join("|")})`;
      i = end;
    } else if (/[.+^$()|[\]\\]/.test(ch)) out += `\\${ch}`;
    else out += ch;
  }
  return out;
}

export function globToRegex(pattern: string): RegExp {
  const segments = pattern.split("/");
  const parts: string[] = [];
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]!;
    if (segment === "**") {
      // `**/` matches zero or more directories.
      parts.push(i === segments.length - 1 ? ".*" : "(?:[^/]+/)*");
    } else {
      parts.push(segmentToRegex(segment) + (i < segments.length - 1 ? "/" : ""));
    }
  }
  return new RegExp(`^${parts.join("")}$`);
}

/** Walk `cwd` returning relative paths (posix separators) matching the pattern. */
export function globScan(cwd: string, pattern: string, limit = 5000): string[] {
  const regex = globToRegex(pattern);
  const results: string[] = [];
  const stack: string[] = [""];

  while (stack.length > 0 && results.length < limit) {
    const rel = stack.pop()!;
    let entries;
    try {
      entries = readdirSync(join(cwd, rel), { withFileTypes: true });
    } catch {
      continue; // Unreadable directory — skip.
    }
    for (const entry of entries) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        if (!SKIP_DIRS.has(entry.name) && !entry.name.startsWith(".git")) stack.push(childRel);
      } else if (regex.test(childRel)) {
        results.push(childRel);
        if (results.length >= limit) break;
      }
    }
  }
  return results;
}
