/**
 * Context-aware key resolver (§10). Pure: given the typed `input` string (needed
 * to distinguish e.g. `?` from `!`), the Ink `key` flags, and a `KeyContext`,
 * return the action or `null` (fall through to the editor).
 *
 * Precedence (first match wins, §10.3): (1) modal → only esc/ctrl+c close it;
 * (2) popover → esc dismisses; (3) busy → esc interrupts; (4) global bindings;
 * (5) null. So esc = close-modal > dismiss-popover > interrupt.
 */
import type { KeyAction, KeyContext } from "./types.ts";

/** The subset of Ink's `Key` this resolver reads. */
export interface KeyObject {
  ctrl: boolean;
  shift: boolean;
  meta: boolean;
  return: boolean;
  escape: boolean;
  upArrow: boolean;
  downArrow: boolean;
  leftArrow: boolean;
  rightArrow: boolean;
  pageUp: boolean;
  pageDown: boolean;
  tab: boolean;
  backspace: boolean;
  delete: boolean;
}

const cmd = (id: string): KeyAction => ({ kind: "command", id });
const builtin = (name: string): KeyAction => ({ kind: "builtin", name });

export function resolveKey(input: string, key: KeyObject, ctx: KeyContext): KeyAction | null {
  // 1. Modal captures the screen: only esc / ctrl+c close it; nav is the modal's own.
  if (ctx.modalOpen) {
    if (key.escape || (key.ctrl && input === "c")) return builtin("modal.close");
    return null;
  }
  // 2. Autocomplete popover: esc dismisses (before interrupt). Its nav keys reach the editor.
  if (ctx.popoverOpen && key.escape) return builtin("popover.dismiss");
  // 3. Busy turn: esc interrupts. ctrl+c resolves to the ctrl-c builtin below (App decides).
  if (ctx.busy && key.escape) return builtin("interrupt");

  // 4. Global bindings (§10.1).
  if (key.ctrl) {
    switch (input) {
      case "p":
      case "k":
        return cmd("command.palette");
      case "n":
        return cmd("session.new");
      case "s":
        return cmd("session.list");
      case "o":
        return cmd("model.picker");
      case "g":
        return cmd("agent.picker");
      case "t":
        return cmd("theme.picker");
      case "b":
        return cmd("sidebar.toggle");
      case "e":
        return cmd("editor.external");
      case "f":
        return cmd("file.attach");
      case "l":
        return cmd("screen.clear");
      case "c":
        return builtin("ctrl-c");
      case "d":
        if (ctx.bufferEmpty) return builtin("quit");
        break;
    }
  }

  if (input === "?" && ctx.bufferEmpty && !key.ctrl && !key.meta) return cmd("help");
  if (key.pageUp) return builtin("scroll.up");
  if (key.pageDown) return builtin("scroll.down");
  if (key.tab && ctx.bufferEmpty && !ctx.popoverOpen) {
    return builtin(key.shift ? "agent.cycle.reverse" : "agent.cycle");
  }

  return null;
}
