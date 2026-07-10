/**
 * Path safety, shared by every subsystem that turns model- or repo-supplied
 * text into a filesystem path. Containment is checked AFTER symlink resolution:
 * a symlink pointing outside the root does not grant access outside the root.
 */
import { existsSync, readFileSync, realpathSync, statSync } from "node:fs";
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from "node:path";

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

/** Files whose contents are never auto-attached (@file / command @refs), even inside the root. */
const SENSITIVE = /(?:^|[./])(?:\.env(?:\.|$)|.*id_rsa|.*id_ed25519|.*\.pem$|.*\.key$|.*\.p12$|credentials$)/i;

export function isSensitiveFile(path: string): boolean {
  const name = basename(path);
  return SENSITIVE.test(name) || /(?:^|\/)\.(?:ssh|aws|gnupg)\//.test(path);
}

export interface Attachment {
  /** Path as written by the user, for display. */
  mention: string;
  content: string;
}

/**
 * Read a file for `@mention` attachment, safely. Returns undefined (skip the
 * attachment, leave the mention as plain text) when the path escapes the root,
 * is not a regular file, is too large, or is sensitive (keys, .env, secrets).
 */
export function readAttachment(root: string, mention: string, maxBytes = 200 * 1024, maxChars = 20_000): Attachment | undefined {
  const resolved = resolvePath(root, mention);
  if (resolved.external || isSensitiveFile(resolved.absolute)) return undefined;
  try {
    const stat = statSync(resolved.absolute);
    if (!stat.isFile() || stat.size > maxBytes) return undefined;
    return { mention, content: readFileSync(resolved.absolute, "utf8").slice(0, maxChars) };
  } catch {
    return undefined;
  }
}
