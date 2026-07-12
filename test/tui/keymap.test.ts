import { describe, expect, test } from "bun:test";
import { resolveKey, BINDINGS, type KeyObject } from "../../src/tui/keymap.ts";
const K = (o: Partial<KeyObject> = {}): KeyObject => ({ ctrl:false,shift:false,meta:false,return:false,escape:false,upArrow:false,downArrow:false,leftArrow:false,rightArrow:false,pageUp:false,pageDown:false,tab:false,backspace:false,delete:false, ...o });
const base = { modalOpen:false, busy:false, popoverOpen:false, bufferEmpty:true };
describe("resolveKey", () => {
  test("ctrl+p → palette", () => expect(resolveKey("p", K({ctrl:true}), base)).toEqual({ kind:"command", id:"command.palette" }));
  test("ctrl+n → new session", () => expect(resolveKey("n", K({ctrl:true}), base)).toEqual({ kind:"command", id:"session.new" }));
  test("? on empty buffer → help", () => expect(resolveKey("?", K(), base)).toEqual({ kind:"command", id:"help" }));
  test("? with text → falls through", () => expect(resolveKey("?", K(), { ...base, bufferEmpty:false })).toBeNull());
  test("esc closes modal before interrupt", () => expect(resolveKey("", K({escape:true}), { ...base, modalOpen:true, busy:true })).toEqual({ kind:"builtin", name:"modal.close" }));
  test("esc interrupts when busy no modal", () => expect(resolveKey("", K({escape:true}), { ...base, busy:true })).toEqual({ kind:"builtin", name:"interrupt" }));
  test("pageUp → scroll.up", () => expect(resolveKey("", K({pageUp:true}), base)).toEqual({ kind:"builtin", name:"scroll.up" }));
  test("pageDown → scroll.down", () => expect(resolveKey("", K({pageDown:true}), base)).toEqual({ kind:"builtin", name:"scroll.down" }));
  test("shift+up → scroll.up.line", () => expect(resolveKey("", K({shift:true,upArrow:true}), base)).toEqual({ kind:"builtin", name:"scroll.up.line" }));
  test("shift+down → scroll.down.line", () => expect(resolveKey("", K({shift:true,downArrow:true}), base)).toEqual({ kind:"builtin", name:"scroll.down.line" }));
  test("plain up (no shift) falls through to the editor for history", () => expect(resolveKey("", K({upArrow:true}), base)).toBeNull());
  test("ctrl+c → ctrl-c builtin (App owns the state machine)", () => expect(resolveKey("c", K({ctrl:true}), base)).toEqual({ kind:"builtin", name:"ctrl-c" }));
  test("ctrl+c ignored while modal open (falls to modal.close via esc path only)", () => expect(resolveKey("c", K({ctrl:true}), { ...base, modalOpen:true })).toEqual({ kind:"builtin", name:"modal.close" }));
});

describe("BINDINGS", () => {
  test("includes the command palette shortcut in display form", () => {
    expect(BINDINGS).toContainEqual({ key: "ctrl+p", action: "Command palette", category: "Global" });
  });
  test("every entry has key/action/category strings", () => {
    expect(BINDINGS.length).toBeGreaterThan(0);
    for (const b of BINDINGS) {
      expect(typeof b.key).toBe("string");
      expect(b.action.length).toBeGreaterThan(0);
      expect(b.category.length).toBeGreaterThan(0);
    }
  });
});
