/**
 * Wildcard matching for permission rules.
 * `*` matches any sequence of characters (including none, across separators).
 * `?` matches exactly one character.
 * Matching is case-sensitive and anchored (whole-string).
 */
const cache = new Map<string, RegExp>();

function compile(pattern: string): RegExp {
  const cached = cache.get(pattern);
  if (cached) return cached;
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\?/g, ".");
  const regex = new RegExp(`^${escaped}$`, "s");
  if (cache.size > 2000) cache.clear();
  cache.set(pattern, regex);
  return regex;
}

export function wildcardMatch(value: string, pattern: string): boolean {
  if (pattern === "*") return true;
  if (pattern === value) return true;
  return compile(pattern).test(value);
}
