import { describe, expect, test } from "bun:test";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readTool } from "../../src/tool/read.ts";
import { webfetchTool } from "../../src/tool/webfetch.ts";
import type { ToolContext } from "../../src/tool/types.ts";

function ctx(root: string): ToolContext {
  return {
    sessionID: "s",
    messageID: "m",
    callID: "c",
    agent: "builder",
    root,
    abort: new AbortController().signal,
    messages: [],
    ask: async () => {},
    progress: () => {},
  };
}

describe("read tool secret denylist", () => {
  test("refuses to read a private key even inside the workspace", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-sec-"));
    writeFileSync(join(dir, "id_rsa"), "-----BEGIN OPENSSH PRIVATE KEY-----\nSECRETBYTES\n");
    const r = await readTool.execute({ filePath: "id_rsa" }, ctx(dir));
    expect(r.output.toLowerCase()).toContain("refus");
    expect(r.output).not.toContain("SECRETBYTES");
  });

  test("refuses a .pem file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-sec-"));
    writeFileSync(join(dir, "deploy.pem"), "PEMSECRET");
    const r = await readTool.execute({ filePath: "deploy.pem" }, ctx(dir));
    expect(r.output).not.toContain("PEMSECRET");
  });

  test("still reads a normal source file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "coven-sec-"));
    writeFileSync(join(dir, "ok.ts"), "export const hello = 1;");
    const r = await readTool.execute({ filePath: "ok.ts" }, ctx(dir));
    expect(r.output).toContain("export const hello");
  });
});

describe("webfetch SSRF guard", () => {
  const blocked = [
    "http://localhost/x",
    "http://127.0.0.1/x",
    "http://169.254.169.254/latest/meta-data/",
    "http://192.168.1.1/",
    "http://10.0.0.5/",
    "http://[::1]/",
  ];
  for (const url of blocked) {
    test(`blocks ${url}`, async () => {
      const r = await webfetchTool.execute({ url }, ctx("/"));
      expect(r.output.toLowerCase()).toMatch(/refus|block|not allowed|private|local/);
    });
  }
});
