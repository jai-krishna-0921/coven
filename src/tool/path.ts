/**
 * Path safety shared by all file tools. Every model-supplied path is resolved
 * against the workspace root and containment-checked AFTER symlink resolution —
 * a symlink pointing outside the root does not grant access outside the root.
 */
import { isAbsolute, join, relative, resolve, sep, dirname } from "node:path";
import { existsSync, realpathSync } from "node:fs";

export interface ResolvedPath {
  /** Absolute, symlink-resolved (as far as the existing prefix allows). */
  absolute: string;
  /** Path relative to root, for permission patterns and display. */
  display: string;
  /** True when the real path escapes the workspace root. */
  external: boolean;
}

function realpathExisting(path: string): string {
  // realpath the deepest existing ancestor, then re-append the rest.
  let current = path;
  const tail: string[] = [];
  while (!existsSync(current)) {
    const parent = dirname(current);
    if (parent === current) break;
    tail.unshift(current.slice(parent.length + 1));
    current = parent;
  }
  try {
    current = realpathSync(current);
  } catch {
    // Keep the unresolved prefix; containment check still runs on it.
  }
  return tail.length > 0 ? join(current, ...tail) : current;
}

export function resolvePath(root: string, input: string): ResolvedPath {
  const absolute = realpathExisting(isAbsolute(input) ? resolve(input) : resolve(join(root, input)));
  const realRoot = realpathExisting(root);
  const rel = relative(realRoot, absolute);
  const external = rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
  return { absolute, display: external ? absolute : rel === "" ? "." : rel, external };
}
