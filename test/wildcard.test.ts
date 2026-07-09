import { describe, expect, test } from "bun:test";
import { wildcardMatch } from "../src/util/wildcard.ts";

describe("wildcardMatch", () => {
  test("star matches everything", () => {
    expect(wildcardMatch("anything at all", "*")).toBe(true);
    expect(wildcardMatch("", "*")).toBe(true);
  });

  test("exact strings match themselves only", () => {
    expect(wildcardMatch("git status", "git status")).toBe(true);
    expect(wildcardMatch("git statusx", "git status")).toBe(false);
  });

  test("star crosses path separators", () => {
    expect(wildcardMatch("src/deep/nested/.env", "*.env")).toBe(true);
    expect(wildcardMatch("config/.env.local", "*.env.*")).toBe(true);
  });

  test("prefix patterns match command families", () => {
    expect(wildcardMatch("git push origin main", "git push*")).toBe(true);
    expect(wildcardMatch("git pull", "git push*")).toBe(false);
  });

  test("question mark matches exactly one character", () => {
    expect(wildcardMatch("v1", "v?")).toBe(true);
    expect(wildcardMatch("v12", "v?")).toBe(false);
  });

  test("regex metacharacters in patterns are literal", () => {
    expect(wildcardMatch("a.b", "a.b")).toBe(true);
    expect(wildcardMatch("aXb", "a.b")).toBe(false);
    expect(wildcardMatch("foo(1)", "foo(1)")).toBe(true);
  });
});
