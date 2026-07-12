/**
 * Pure helpers behind the PromptEditor (Task 26). The component stays a thin
 * shell over these so the editing/submit logic is unit-testable without raw-mode
 * key plumbing:
 *
 *  - {@link cursorIndex}   linear char offset of the cursor (feeds completionsFor + cursor x)
 *  - {@link applyKey}      one key → buffer mutation + an outcome (changed / submit / noop)
 *  - {@link completeToken} replace the token under the cursor with a completion value
 *  - {@link parseSubmit}   classify a submitted line as shell (`!cmd`) / prompt / empty
 *  - {@link isSingleLine}  whether history navigation should own up/down
 */
import type { TextBuffer } from "./buffer.ts";

/** The subset of Ink's `Key` the editor reducer reads. */
export interface EditorKey {
  ctrl: boolean;
  meta: boolean;
  shift: boolean;
  return: boolean;
  escape: boolean;
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
}

/** What the caller must do after {@link applyKey} processed (or ignored) a key. */
export type EditorOutcome =
  | { kind: "changed" } // buffer content/cursor moved → re-render
  | { kind: "submit" } // Enter with no continuation → read value & dispatch
  | { kind: "noop" }; // key not consumed by the editor (App may handle it)

/** Linear character index of the cursor within `buffer.value()` (counts `\n`). */
export function cursorIndex(buffer: TextBuffer): number {
  const { row, col } = buffer.cursor();
  const lines = buffer.value().split("\n");
  let idx = 0;
  for (let i = 0; i < row; i++) idx += (lines[i]?.length ?? 0) + 1;
  return idx + col;
}

/** Whether the buffer is a single line (history nav owns up/down when true). */
export function isSingleLine(buffer: TextBuffer): boolean {
  return !buffer.value().includes("\n");
}

/** The character immediately left of the cursor, or undefined at the start. */
function precedingChar(buffer: TextBuffer): string | undefined {
  const idx = cursorIndex(buffer);
  if (idx <= 0) return undefined;
  return buffer.value()[idx - 1];
}

/** True when every code point in `s` is a C0 control char (or DEL). */
function isControlChars(s: string): boolean {
  if (s.length === 0) return true;
  for (const ch of s) {
    const c = ch.codePointAt(0) ?? 0;
    if (c >= 0x20 && c !== 0x7f) return false;
  }
  return true;
}

/**
 * Apply one key to `buffer` (mutating it) and report the outcome. Handles text
 * insertion, deletion, cursor motion, word/line kills, and Enter's
 * submit-vs-newline decision. It deliberately knows nothing about the
 * autocomplete popover or history — the component resolves those first.
 */
export function applyKey(buffer: TextBuffer, key: EditorKey, input: string): EditorOutcome {
  if (key.return) {
    // shift/meta+enter always insert a newline; a trailing `\` is a line continuation.
    if (key.shift || key.meta) {
      buffer.insert("\n");
      return { kind: "changed" };
    }
    if (precedingChar(buffer) === "\\") {
      buffer.backspace();
      buffer.insert("\n");
      return { kind: "changed" };
    }
    return { kind: "submit" };
  }

  if (key.leftArrow) {
    if (key.ctrl || key.meta) buffer.wordLeft();
    else buffer.moveLeft();
    return { kind: "changed" };
  }
  if (key.rightArrow) {
    if (key.ctrl || key.meta) buffer.wordRight();
    else buffer.moveRight();
    return { kind: "changed" };
  }
  if (key.upArrow) {
    buffer.moveUp();
    return { kind: "changed" };
  }
  if (key.downArrow) {
    buffer.moveDown();
    return { kind: "changed" };
  }
  if (key.backspace) {
    if (key.ctrl || key.meta) buffer.deleteWordLeft();
    else buffer.backspace();
    return { kind: "changed" };
  }
  if (key.delete) {
    buffer.del();
    return { kind: "changed" };
  }

  if (key.ctrl) {
    switch (input) {
      case "a":
        buffer.home();
        return { kind: "changed" };
      case "e":
        buffer.end();
        return { kind: "changed" };
      case "u":
        buffer.killToLineStart();
        return { kind: "changed" };
      case "w":
        buffer.deleteWordLeft();
        return { kind: "changed" };
      default:
        return { kind: "noop" };
    }
  }

  if (!key.meta && !key.tab && !isControlChars(input)) {
    buffer.insert(input);
    return { kind: "changed" };
  }
  return { kind: "noop" };
}

/**
 * Replace the whitespace-delimited token containing `cursor` with `replacement`
 * plus a trailing space, returning the new value and cursor offset. Used to
 * accept an autocomplete selection.
 */
export function completeToken(value: string, cursor: number, replacement: string): { value: string; cursor: number } {
  const isWs = (c: string | undefined): boolean => /\s/.test(c ?? "");
  let start = cursor;
  while (start > 0 && !isWs(value[start - 1])) start -= 1;
  let end = cursor;
  while (end < value.length && !isWs(value[end])) end += 1;
  const next = value.slice(0, start) + replacement + " " + value.slice(end);
  return { value: next, cursor: start + replacement.length + 1 };
}

export type SubmitParse =
  | { kind: "shell"; command: string }
  | { kind: "prompt"; text: string }
  | { kind: "empty" };

/** Classify a submitted line: `!cmd` → shell, blank → empty, else a prompt. */
export function parseSubmit(value: string): SubmitParse {
  const trimmed = value.trim();
  if (trimmed.length === 0) return { kind: "empty" };
  if (trimmed.startsWith("!")) return { kind: "shell", command: trimmed.slice(1).trim() };
  return { kind: "prompt", text: value };
}
