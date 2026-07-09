import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync, readFileSync, symlinkSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { editTool } from "../src/tool/edit.ts";
import { readTool } from "../src/tool/read.ts";
import { resolvePath } from "../src/tool/path.ts";
import type { ToolContext } from "../src/tool/types.ts";
import type { Message } from "../src/session/types.ts";

function fakeContext(root: string, asks: string[] = []): ToolContext {
  return {
    sessionID: "ses_test",
    messageID: "msg_test",
    callID: "call_test",
    agent: "builder",
    root,
    abort: new AbortController().signal,
    messages: [] as Message[],
    ask: async (input) => {
      asks.push(`${input.permission}:${input.patterns.join(",")}`);
    },
    progress: () => {},
  };
}

describe("resolvePath containment", () => {
  test("relative paths stay inside the root", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-path-"));
    const resolved = resolvePath(dir, "src/x.ts");
    expect(resolved.external).toBe(false);
    expect(resolved.display).toBe("src/x.ts");
  });

  test("dot-dot escape is detected as external", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-path-"));
    expect(resolvePath(dir, "../../etc/passwd").external).toBe(true);
  });

  test("symlink pointing outside the root is detected as external", () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-path-"));
    const outside = mkdtempSync(join(tmpdir(), "coven-outside-"));
    writeFileSync(join(outside, "secret.txt"), "secret");
    symlinkSync(join(outside, "secret.txt"), join(dir, "innocent.txt"));
    expect(resolvePath(dir, "innocent.txt").external).toBe(true);
  });
});

describe("editTool", () => {
  test("replaces a unique match and reports it", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-edit-"));
    writeFileSync(join(dir, "a.ts"), "const x = 1;\nconst y = 2;\n");
    const result = await editTool.execute({ filePath: "a.ts", oldString: "const x = 1;", newString: "const x = 42;" }, fakeContext(dir));
    expect(readFileSync(join(dir, "a.ts"), "utf8")).toContain("const x = 42;");
    expect(result.output).toContain("Edited");
  });

  test("refuses ambiguous matches without replaceAll", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-edit-"));
    writeFileSync(join(dir, "a.ts"), "dup\ndup\n");
    const result = await editTool.execute({ filePath: "a.ts", oldString: "dup", newString: "x" }, fakeContext(dir));
    expect(result.output).toContain("matches 2 times");
    expect(readFileSync(join(dir, "a.ts"), "utf8")).toBe("dup\ndup\n");
  });

  test("replaceAll replaces every occurrence", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-edit-"));
    writeFileSync(join(dir, "a.ts"), "dup dup dup");
    await editTool.execute({ filePath: "a.ts", oldString: "dup", newString: "x", replaceAll: true }, fakeContext(dir));
    expect(readFileSync(join(dir, "a.ts"), "utf8")).toBe("x x x");
  });

  test("missing oldString returns a model-actionable error, not a throw", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-edit-"));
    writeFileSync(join(dir, "a.ts"), "content");
    const result = await editTool.execute({ filePath: "a.ts", oldString: "nope", newString: "x" }, fakeContext(dir));
    expect(result.output).toContain("not found");
  });
});

describe("readTool", () => {
  test("returns line-numbered content and asks read permission", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-read-"));
    writeFileSync(join(dir, "f.txt"), "alpha\nbeta\n");
    const asks: string[] = [];
    const result = await readTool.execute({ filePath: "f.txt" }, fakeContext(dir, asks));
    expect(result.output).toContain("1→alpha");
    expect(asks).toEqual(["read:f.txt"]);
  });

  test("offset and limit slice the file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-read-"));
    writeFileSync(join(dir, "f.txt"), Array.from({ length: 10 }, (_, i) => `line${i + 1}`).join("\n"));
    const result = await readTool.execute({ filePath: "f.txt", offset: 5, limit: 2 }, fakeContext(dir));
    expect(result.output).toContain("line5");
    expect(result.output).toContain("line6");
    expect(result.output).not.toContain("line7\n");
  });

  test("directories get a clear EISDIR message", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-read-"));
    mkdirSync(join(dir, "sub"));
    const result = await readTool.execute({ filePath: "sub" }, fakeContext(dir));
    expect(result.output).toContain("EISDIR");
  });
});
