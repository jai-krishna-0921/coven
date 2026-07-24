import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const CLIENT = readFileSync(join(import.meta.dir, "..", "..", "src", "mcp", "client.ts"), "utf8");
const HOST = readFileSync(join(import.meta.dir, "..", "..", "src", "mcp", "index.ts"), "utf8");
const APP = readFileSync(join(import.meta.dir, "..", "..", "src", "app.ts"), "utf8");
const SYSTEM = readFileSync(join(import.meta.dir, "..", "..", "src", "session", "system.ts"), "utf8");
const CMD_TYPES = readFileSync(join(import.meta.dir, "..", "..", "src", "command", "types.ts"), "utf8");

describe("Wave 5 — MCP client surface", () => {
  for (const method of ["getInstructions", "serverCapabilities", "listResources", "readResource", "listPrompts", "getPrompt"]) {
    test(`McpClient exposes ${method}()`, () => {
      expect(CLIENT).toMatch(new RegExp(`(async |get )?${method}\\s*\\(`));
    });
  }

  test("notifications/tools/list_changed handler wired", () => {
    expect(CLIENT).toContain("notifications/tools/list_changed");
    expect(CLIENT).toMatch(/onToolsChanged/);
  });

  test("roots/list handler answers with workspace root", () => {
    expect(CLIENT).toMatch(/roots\/list/);
    expect(CLIENT).toMatch(/onListRoots/);
  });

  test("notifications/message handler wired for server-emitted logs", () => {
    expect(CLIENT).toContain("notifications/message");
    expect(CLIENT).toMatch(/onLog/);
  });
});

describe("Wave 5 — MCP host bridges resources, prompts, instructions", () => {
  test("host exposes promptEntries + fetchPrompt", () => {
    expect(HOST).toMatch(/promptEntries\(\)/);
    expect(HOST).toMatch(/fetchPrompt\(/);
  });
  test("host exposes resources + readResource", () => {
    expect(HOST).toMatch(/^\s*resources\(\)/m);
    expect(HOST).toMatch(/readResource\(/);
  });
  test("host exposes instructions() combining every server's block", () => {
    expect(HOST).toMatch(/instructions\(\)/);
    expect(HOST).toMatch(/mcp-server/);
  });
  test("host constructor accepts an onToolsChanged callback for live refresh", () => {
    expect(HOST).toMatch(/onToolsChanged/);
    expect(HOST).toMatch(/refreshTools/);
  });
});

describe("Wave 5 — CommandRegistry + auto-registration", () => {
  test("CommandSource enum includes 'mcp' and 'skill'", () => {
    expect(CMD_TYPES).toMatch(/"builtin"\s*\|\s*"global"\s*\|\s*"project"\s*\|\s*"mcp"\s*\|\s*"skill"/);
  });
  test("CommandDef supports an optional async resolve() for lazy templates", () => {
    expect(CMD_TYPES).toMatch(/resolve\?:\s*\(rawArgs/);
  });
  test("app.ts auto-registers MCP prompts as slash commands", () => {
    expect(APP).toMatch(/mcp\.promptEntries\(\)/);
    expect(APP).toMatch(/commands\.register/);
    expect(APP).toMatch(/source:\s*"mcp"/);
  });
  test("app.ts auto-registers skills as slash commands", () => {
    expect(APP).toMatch(/skills\.all\(\)/);
    expect(APP).toMatch(/source:\s*"skill"/);
  });
});

describe("Wave 5 — MCP instructions folded into system prompt", () => {
  test("assembleSystemPrompt accepts mcpInstructions and emits a block", () => {
    expect(SYSTEM).toMatch(/mcpInstructions/);
    expect(SYSTEM).toContain("mcp-server-instructions");
  });
});
