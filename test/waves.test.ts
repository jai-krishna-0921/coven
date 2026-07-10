import { describe, expect, test } from "bun:test";
import { buildWaves } from "../src/session/loop.ts";

const call = (tool: string, id: string) => ({ callID: id, tool, args: {} });

describe("buildWaves", () => {
  test("consecutive read-only calls merge into one concurrent wave", () => {
    const waves = buildWaves([call("read", "1"), call("grep", "2"), call("glob", "3")]);
    expect(waves).toHaveLength(1);
    expect(waves[0]).toHaveLength(3);
  });

  test("mutating tools are solo barriers in order", () => {
    const waves = buildWaves([call("read", "1"), call("edit", "2"), call("edit", "3"), call("read", "4")]);
    expect(waves.map((w) => w.map((c) => c.callID))).toEqual([["1"], ["2"], ["3"], ["4"]]);
  });

  test("consecutive task calls merge — parallel subagent dispatch", () => {
    const waves = buildWaves([call("task", "1"), call("task", "2"), call("bash", "3")]);
    expect(waves).toHaveLength(2);
    expect(waves[0]).toHaveLength(2);
    expect(waves[1]).toHaveLength(1);
  });

  test("task and read-only calls do not merge with each other", () => {
    const waves = buildWaves([call("read", "1"), call("task", "2")]);
    expect(waves).toHaveLength(2);
  });

  test("empty input yields no waves", () => {
    expect(buildWaves([])).toEqual([]);
  });
});
