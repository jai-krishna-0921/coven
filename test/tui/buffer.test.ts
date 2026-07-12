import { describe, expect, test } from "bun:test";
import { TextBuffer } from "../../src/tui/input/buffer.ts";
describe("TextBuffer", () => {
  test("insert + cursor", () => { const b = new TextBuffer(); b.insert("hi"); expect(b.value()).toBe("hi"); expect(b.cursor()).toEqual({ row: 0, col: 2 }); });
  test("deleteWordLeft", () => { const b = new TextBuffer(); b.insert("foo bar"); b.deleteWordLeft(); expect(b.value()).toBe("foo "); });
  test("newline + backspace joins", () => { const b = new TextBuffer(); b.insert("a\nb"); b.home(); b.backspace(); expect(b.value()).toBe("ab"); });
  test("isEmpty", () => { expect(new TextBuffer().isEmpty()).toBe(true); });
});
