import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { globScan, globToRegex } from "../src/util/glob.ts";

describe("globToRegex", () => {
  test("star stays within a path segment", () => {
    expect(globToRegex("*.ts").test("a.ts")).toBe(true);
    expect(globToRegex("*.ts").test("dir/a.ts")).toBe(false);
  });

  test("double star crosses directories", () => {
    expect(globToRegex("**/*.ts").test("a.ts")).toBe(true);
    expect(globToRegex("**/*.ts").test("deep/nested/a.ts")).toBe(true);
    expect(globToRegex("src/**/*.ts").test("src/x/y.ts")).toBe(true);
    expect(globToRegex("src/**/*.ts").test("other/y.ts")).toBe(false);
  });

  test("trailing double star matches everything below", () => {
    expect(globToRegex("src/**").test("src/a/b/c.txt")).toBe(true);
  });

  test("brace alternation", () => {
    const regex = globToRegex("*.{ts,js}");
    expect(regex.test("a.ts")).toBe(true);
    expect(regex.test("a.js")).toBe(true);
    expect(regex.test("a.rs")).toBe(false);
  });

  test("question mark matches one character", () => {
    expect(globToRegex("v?.md").test("v1.md")).toBe(true);
    expect(globToRegex("v?.md").test("v12.md")).toBe(false);
  });
});

describe("globScan", () => {
  test("finds nested matches and skips node_modules", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-glob-"));
    mkdirSync(join(dir, "src", "deep"), { recursive: true });
    mkdirSync(join(dir, "node_modules", "pkg"), { recursive: true });
    writeFileSync(join(dir, "src", "a.ts"), "");
    writeFileSync(join(dir, "src", "deep", "b.ts"), "");
    writeFileSync(join(dir, "node_modules", "pkg", "c.ts"), "");
    const results = globScan(dir, "**/*.ts").sort();
    expect(results).toEqual(["src/a.ts", "src/deep/b.ts"]);
  });

  test("SKILL.md discovery pattern works", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-glob-"));
    mkdirSync(join(dir, "my-skill"), { recursive: true });
    writeFileSync(join(dir, "my-skill", "SKILL.md"), "");
    expect(globScan(dir, "**/SKILL.md")).toEqual(["my-skill/SKILL.md"]);
  });

  test("respects the result limit", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-glob-"));
    for (let i = 0; i < 20; i++) writeFileSync(join(dir, `f${i}.txt`), "");
    expect(globScan(dir, "*.txt", 5)).toHaveLength(5);
  });
});
