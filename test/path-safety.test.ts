import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isSensitiveFile, readAttachment } from "../src/util/path.ts";

function tmpRoot(): string {
  return mkdtempSync(join(tmpdir(), "coven-path-"));
}

describe("isSensitiveFile", () => {
  test("flags dotenv, keys, and credentials", () => {
    expect(isSensitiveFile("/x/.env")).toBe(true);
    expect(isSensitiveFile("/x/.env.local")).toBe(true);
    expect(isSensitiveFile("/home/u/.ssh/id_rsa")).toBe(true);
    expect(isSensitiveFile("/x/server.pem")).toBe(true);
    expect(isSensitiveFile("/x/private.key")).toBe(true);
    expect(isSensitiveFile("/home/u/.aws/credentials")).toBe(true);
  });

  test("ordinary source files are not sensitive", () => {
    expect(isSensitiveFile("/x/src/index.ts")).toBe(false);
    expect(isSensitiveFile("/x/README.md")).toBe(false);
  });
});

describe("readAttachment", () => {
  test("reads a contained, non-sensitive file", () => {
    const root = tmpRoot();
    writeFileSync(join(root, "notes.txt"), "hello notes");
    expect(readAttachment(root, "notes.txt")?.content).toBe("hello notes");
  });

  test("refuses traversal outside the root", () => {
    const root = tmpRoot();
    expect(readAttachment(root, "../../../../etc/passwd")).toBeUndefined();
  });

  test("refuses a secret file even inside the root", () => {
    const root = tmpRoot();
    writeFileSync(join(root, ".env"), "OPENAI_API_KEY=sk-secret");
    expect(readAttachment(root, ".env")).toBeUndefined();
  });

  test("refuses files over the byte cap", () => {
    const root = tmpRoot();
    writeFileSync(join(root, "big.txt"), "x".repeat(300 * 1024));
    expect(readAttachment(root, "big.txt", 200 * 1024)).toBeUndefined();
  });

  test("caps content length", () => {
    const root = tmpRoot();
    writeFileSync(join(root, "long.txt"), "y".repeat(50_000));
    expect(readAttachment(root, "long.txt", 200 * 1024, 100)?.content.length).toBe(100);
  });

  test("missing files yield undefined", () => {
    expect(readAttachment(tmpRoot(), "nope.txt")).toBeUndefined();
  });
});
