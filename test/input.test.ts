import { describe, expect, test } from "bun:test";
import { needsContinuation } from "../src/tui/input.ts";

describe("needsContinuation", () => {
  test("plain lines are complete", () => {
    expect(needsContinuation("hello world")).toBe(false);
  });

  test("trailing backslash continues", () => {
    expect(needsContinuation("first line \\")).toBe(true);
  });

  test("unclosed code fence continues", () => {
    expect(needsContinuation("here is code:\n```ts\nconst x = 1;")).toBe(true);
  });

  test("closed code fence is complete", () => {
    expect(needsContinuation("```ts\nconst x = 1;\n```")).toBe(false);
  });
});
