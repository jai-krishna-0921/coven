/**
 * Multiline prompt editor: a thin shell over {@link TextBuffer} + the pure
 * reducers in {@link file://./editor-reducer.ts}. A ref holds the buffer and a
 * `version` counter forces re-renders; `useInput` routes keys through the
 * reducer. Enter submits (or, with a popover open, accepts the highlighted
 * completion); shift+enter or a trailing `\` inserts a newline; a leading `!`
 * routes to {@link onShell}. Live `/`-command and `@`-file completions render in
 * a popover below the input, and the real terminal cursor is placed with
 * `useCursor`, using `string-width` so wide glyphs don't misalign it.
 */
import { readdirSync } from "node:fs";
import { useCallback, useEffect, useRef, useState } from "react";
import { Box, Text, useCursor, useInput } from "ink";
import stringWidth from "string-width";
import { useTheme } from "../context.tsx";
import { completionsFor } from "../autocomplete.ts";
import { TextBuffer } from "./buffer.ts";
import { InputHistory } from "./history.ts";
import {
  applyKey,
  completeToken,
  cursorIndex,
  isSingleLine,
  parseSubmit,
  type EditorKey,
} from "./editor-reducer.ts";
import type { PaletteItem } from "../types.ts";

const MAX_POPOVER = 8;
const MAX_FILES = 500;

export function PromptEditor({
  items,
  onSubmit,
  onShell,
  active,
  onPopoverChange,
  onEmptyChange,
  registerClear,
}: {
  items: PaletteItem[];
  onSubmit(text: string): void;
  onShell(cmd: string): void;
  active: boolean;
  onPopoverChange?(open: boolean): void;
  onEmptyChange?(empty: boolean): void;
  registerClear?(clear: () => void): void;
}) {
  const { theme, icons } = useTheme();
  const bufferRef = useRef<TextBuffer | null>(null);
  if (!bufferRef.current) bufferRef.current = new TextBuffer();
  const buffer = bufferRef.current;

  const historyRef = useRef<InputHistory | null>(null);
  if (!historyRef.current) historyRef.current = new InputHistory();
  const history = historyRef.current;

  const selRef = useRef(0);
  const dismissedRef = useRef(false);
  const [, setVersion] = useState(0);
  const bump = useCallback(() => setVersion((v) => v + 1), []);

  const listFiles = useCallback((): string[] => {
    try {
      return readdirSync(process.cwd()).slice(0, MAX_FILES);
    } catch {
      return [];
    }
  }, []);

  const { setCursorPosition } = useCursor();

  const idx = cursorIndex(buffer);
  const completions = active ? completionsFor(buffer.value(), idx, items, listFiles) : [];
  const open = active && !dismissedRef.current && completions.length > 0;
  const sel = Math.min(selRef.current, Math.max(0, completions.length - 1));

  useEffect(() => {
    onPopoverChange?.(open);
  }, [open, onPopoverChange]);

  // Report real buffer emptiness (incl. backspace-to-empty) so the App can re-arm
  // empty-buffer keybindings (? help, tab agent-cycle, ctrl+d quit) precisely.
  const empty = buffer.isEmpty();
  useEffect(() => {
    onEmptyChange?.(empty);
  }, [empty, onEmptyChange]);

  // Expose a precise clear to the App (ctrl-c "clear input") instead of a remount.
  useEffect(() => {
    registerClear?.(() => {
      buffer.setValue("");
      dismissedRef.current = false;
      selRef.current = 0;
      bump();
    });
  }, [registerClear, buffer, bump]);

  // Best-effort hardware-cursor placement (editor-relative y; App refines absolute).
  useEffect(() => {
    if (!active) {
      setCursorPosition(undefined);
      return;
    }
    const { row, col } = buffer.cursor();
    const line = buffer.value().split("\n")[row] ?? "";
    const promptWidth = stringWidth(`${icons.prompt} `);
    const x = (row === 0 ? promptWidth : 0) + stringWidth(line.slice(0, col));
    setCursorPosition({ x, y: row });
  });

  useInput(
    (input, key) => {
      const ek = key as EditorKey;
      const liveIdx = cursorIndex(buffer);
      const comps = completionsFor(buffer.value(), liveIdx, items, listFiles);
      const popoverOpen = !dismissedRef.current && comps.length > 0;

      if (popoverOpen) {
        if (key.upArrow) {
          selRef.current = (selRef.current + comps.length - 1) % comps.length;
          bump();
          return;
        }
        if (key.downArrow) {
          selRef.current = (selRef.current + 1) % comps.length;
          bump();
          return;
        }
        if (key.escape) {
          dismissedRef.current = true;
          bump();
          return;
        }
        const chosen = comps[Math.min(selRef.current, comps.length - 1)];
        if (key.tab && chosen) {
          const next = completeToken(buffer.value(), liveIdx, chosen.value);
          buffer.setValue(next.value);
          selRef.current = 0;
          // A completed command hides the popover so the NEXT Enter submits/runs it;
          // a completed file keeps editing (you're inserting it into a message).
          dismissedRef.current = chosen.kind === "command";
          bump();
          return;
        }
        if (key.return && chosen) {
          const next = completeToken(buffer.value(), liveIdx, chosen.value);
          if (chosen.kind === "command") {
            // Complete AND run the command in one Enter (matches user expectation).
            const text = next.value.trim();
            history.push(text);
            buffer.setValue("");
            selRef.current = 0;
            dismissedRef.current = false;
            bump();
            onSubmit(text);
            return;
          }
          // File completion: insert it, keep editing (don't submit the message yet).
          buffer.setValue(next.value);
          selRef.current = 0;
          dismissedRef.current = true;
          bump();
          return;
        }
        // Any other key falls through to editing, which narrows the popover.
      } else {
        // shift+↑/↓ is transcript scroll (handled by the App), never history.
        if (key.upArrow && !ek.shift && isSingleLine(buffer)) {
          const prev = history.prev();
          if (prev !== undefined) {
            buffer.setValue(prev);
            bump();
          }
          return;
        }
        if (key.downArrow && !ek.shift && isSingleLine(buffer)) {
          const forward = history.next();
          buffer.setValue(forward ?? "");
          bump();
          return;
        }
      }

      const outcome = applyKey(buffer, ek, input);
      if (outcome.kind === "submit") {
        const parsed = parseSubmit(buffer.value());
        if (parsed.kind === "empty") return;
        history.push(buffer.value());
        buffer.setValue("");
        selRef.current = 0;
        dismissedRef.current = false;
        bump();
        if (parsed.kind === "shell") onShell(parsed.command);
        else onSubmit(parsed.text);
        return;
      }
      if (outcome.kind === "changed") {
        dismissedRef.current = false;
        selRef.current = 0;
        bump();
      }
    },
    { isActive: active },
  );

  const value = buffer.value();

  return (
    <Box flexDirection="column">
      <Box>
        <Text color={theme.accent}>{icons.prompt} </Text>
        {value.length > 0 ? (
          <Text color={theme.fg}>{value}</Text>
        ) : active ? (
          <Text color={theme.fgSubtle} dimColor>
            Type a message and press enter — or / for commands, @ for files, ? for help
          </Text>
        ) : null}
      </Box>
      {open ? (
        <Box flexDirection="column">
          {completions.slice(0, MAX_POPOVER).map((c, i) => {
            const selected = i === sel;
            const label = c.label && c.label !== c.value ? `  ${c.label}` : "";
            const hint = c.hint ? `  ${c.hint}` : "";
            return (
              <Text
                key={c.value}
                backgroundColor={selected ? theme.selectionBg : undefined}
                color={selected ? theme.selectionFg : theme.fgMuted}
              >
                {c.value}
                {label}
                {hint}
              </Text>
            );
          })}
        </Box>
      ) : null}
    </Box>
  );
}
