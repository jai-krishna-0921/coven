import { describe, expect, test } from "bun:test";
import { sessionDepth, MAX_SUBAGENT_DEPTH } from "../src/session/loop.ts";

describe("sessionDepth", () => {
  const chain: Record<string, { parentID?: string }> = {
    root: {},
    a: { parentID: "root" },
    b: { parentID: "a" },
    c: { parentID: "b" },
  };
  const lookup = (id: string) => chain[id];

  test("a root session is depth 0", () => {
    expect(sessionDepth(lookup, "root")).toBe(0);
  });

  test("counts parent hops", () => {
    expect(sessionDepth(lookup, "a")).toBe(1);
    expect(sessionDepth(lookup, "b")).toBe(2);
    expect(sessionDepth(lookup, "c")).toBe(3);
  });

  test("is cycle-safe (does not loop forever)", () => {
    const cyclic: Record<string, { parentID?: string }> = { x: { parentID: "y" }, y: { parentID: "x" } };
    expect(sessionDepth((id) => cyclic[id], "x")).toBeLessThanOrEqual(2);
  });

  test("the depth cap is a small positive number", () => {
    expect(MAX_SUBAGENT_DEPTH).toBeGreaterThan(0);
    expect(MAX_SUBAGENT_DEPTH).toBeLessThan(10);
  });
});
