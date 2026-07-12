/**
 * Autocomplete for the prompt editor: prefix-narrowing first, then a fuzzy
 * pass over the remainder (§8.3). Two modes, keyed off the token under the
 * cursor — `/command` when the buffer opens with a slash, `@path` file mention
 * anywhere. Anything else yields no completions.
 *
 * File completions never surface secret/key material: paths that
 * `readAttachment` would reject are filtered with the same `isSensitiveFile`
 * predicate, so completion and attachment stay in agreement.
 */
import fuzzysort from "fuzzysort";
import { isSensitiveFile } from "../util/path.ts";
import type { Completion, PaletteItem } from "./types.ts";

const MAX = 8;
const WS = /\s/;

interface Token {
  start: number;
  end: number;
  text: string;
}

/** The maximal run of non-whitespace characters containing the cursor. */
function tokenAt(input: string, cursor: number): Token {
  let start = cursor;
  while (start > 0 && !WS.test(input[start - 1] ?? "")) start -= 1;
  let end = cursor;
  while (end < input.length && !WS.test(input[end] ?? "")) end += 1;
  return { start, end, text: input.slice(start, end) };
}

function range(n: number): number[] {
  return Array.from({ length: n }, (_, i) => i);
}

function commandCompletions(q: string, items: PaletteItem[]): Completion[] {
  const prefix = items
    .filter((i) => i.slash.toLowerCase().startsWith(q))
    .sort((a, b) => a.slash.localeCompare(b.slash));
  const chosen = new Set(prefix.map((i) => i.id));

  const toCompletion = (item: PaletteItem, matched?: number[]): Completion => ({
    value: "/" + item.slash,
    label: item.title,
    hint: item.category,
    kind: "command",
    ...(matched ? { matched } : {}),
  });

  const out: Completion[] = prefix.map((i) => toCompletion(i, q.length > 0 ? range(q.length) : undefined));

  if (q.length > 0 && out.length < MAX) {
    const rest = items.filter((i) => !chosen.has(i.id));
    const results = fuzzysort.go(q, rest, { keys: ["slash", "title"], limit: MAX });
    for (const r of results) {
      const idx = r[0]?.indexes;
      out.push(toCompletion(r.obj, idx ? [...idx] : undefined));
    }
  }
  return out.slice(0, MAX);
}

function fileCompletions(q: string, files: string[]): Completion[] {
  const safe = files.filter((f) => !isSensitiveFile(f));
  const lower = q.toLowerCase();
  const prefix = safe.filter((f) => f.toLowerCase().startsWith(lower)).sort();
  const chosen = new Set(prefix);

  const out: Completion[] = prefix.map((p) => ({ value: p, label: p, kind: "file" }));

  if (q.length > 0 && out.length < MAX) {
    const rest = safe.filter((f) => !chosen.has(f));
    const results = fuzzysort.go(q, rest, { limit: MAX });
    for (const r of results) out.push({ value: r.target, label: r.target, kind: "file", matched: [...r.indexes] });
  }
  return out.slice(0, MAX);
}

export function completionsFor(
  input: string,
  cursor: number,
  items: PaletteItem[],
  files: () => string[],
): Completion[] {
  const tok = tokenAt(input, cursor);
  const firstNonSpace = input.length - input.trimStart().length;

  if (input.trimStart().startsWith("/") && tok.start === firstNonSpace) {
    return commandCompletions(tok.text.slice(1).toLowerCase(), items);
  }
  if (tok.text.startsWith("@")) {
    return fileCompletions(tok.text.slice(1), files());
  }
  return [];
}
