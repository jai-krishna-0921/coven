import { describe, expect, test } from "bun:test";
import { runTui } from "../../src/tui/index.ts";
import type { App } from "../../src/app.ts";

describe("runTui", () => {
  test("non-TTY environment routes to the fallback REPL, never Ink", async () => {
    const app = {} as unknown as App;
    const calls: string[] = [];
    await runTui(app, {
      isTTY: false,
      fallback: async () => {
        calls.push("fallback");
      },
      mount: async () => {
        calls.push("mount");
      },
    });
    expect(calls).toEqual(["fallback"]);
  });

  test("TTY environment mounts Ink, never the fallback", async () => {
    const app = {} as unknown as App;
    const calls: string[] = [];
    await runTui(app, {
      isTTY: true,
      fallback: async () => {
        calls.push("fallback");
      },
      mount: async () => {
        calls.push("mount");
      },
    });
    expect(calls).toEqual(["mount"]);
  });
});
