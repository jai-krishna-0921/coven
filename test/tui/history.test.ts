import { describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { InputHistory } from "../../src/tui/input/history.ts";

function tmpFile(): string {
  return join(mkdtempSync(join(tmpdir(), "coven-hist-")), "history");
}

describe("InputHistory", () => {
  test("prev walks back newest-first, next walks forward, reset returns to the live line", () => {
    const file = tmpFile();
    const h = new InputHistory(file);
    h.push("one");
    h.push("two");
    h.push("three");
    expect(h.prev()).toBe("three");
    expect(h.prev()).toBe("two");
    expect(h.prev()).toBe("one");
    expect(h.next()).toBe("two");
    expect(h.next()).toBe("three");
    expect(h.next()).toBeUndefined(); // back to the live line
    h.reset();
    expect(h.prev()).toBe("three");
    rmSync(join(file, ".."), { recursive: true, force: true });
  });

  test("persists across a new instance on the same file", () => {
    const file = tmpFile();
    const a = new InputHistory(file);
    a.push("alpha");
    a.push("beta");
    const b = new InputHistory(file);
    expect(b.all()).toEqual(["alpha", "beta"]);
    expect(b.prev()).toBe("beta");
    rmSync(join(file, ".."), { recursive: true, force: true });
  });

  test("de-dups consecutive identical entries", () => {
    const file = tmpFile();
    const h = new InputHistory(file);
    h.push("same");
    h.push("same");
    h.push("other");
    expect(h.all()).toEqual(["same", "other"]);
    rmSync(join(file, ".."), { recursive: true, force: true });
  });
});
