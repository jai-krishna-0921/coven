import { describe, expect, test } from "bun:test";
import type { UiState, PaletteItem, Completion, KeyAction } from "../../src/tui/types.ts";

describe("tui types", () => {
  test("shapes construct", () => {
    const c: Completion = { value: "/new", label: "New session", kind: "command" };
    const a: KeyAction = { kind: "builtin", name: "quit" };
    expect(c.kind).toBe("command");
    expect(a.kind).toBe("builtin");
  });
});
